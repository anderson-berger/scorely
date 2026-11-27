// Cargos (GRV-40–51): gravar os cargos, trocar o cargo de alguém e passar o grupo.
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  isConditionFailed,
  sendVersioned,
  stripKeys,
  touch,
  transactWrite,
  withVersion,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import type { GroupId, UserId } from '@scorely/api/src/lib/ids';
import { getItem } from '@scorely/api/src/modules/groups/data/groups.dynamo';
import { groupMemberKey, groupRolesKey } from '@scorely/api/src/modules/groups/data/groups.table';
import type { StoredRoles, TransferGroupResult } from '@scorely/api/src/modules/groups/data/groups.types';

export interface RoleRepository {
  /** Os cargos do grupo (GRV-40, 42), com a `version` deles. */
  getRoles(groupId: GroupId, opts?: { consistent?: boolean }): Promise<StoredRoles>;
  /**
   * Grava os cargos (GRV-44–47) com a `version` conferida (ADR 0016): versão velha → `VERSION_CONFLICT`. O item vale
   * inteiro; quem tinha um cargo apagado fica com o id velho, que vale o Todos (GRV-47).
   */
  saveRoles(
    groupId: GroupId,
    data: Pick<StoredRoles, 'roles' | 'everyonePermissions'>,
    expectedVersion: number,
    at: Date,
  ): Promise<void>;
  /** Troca o cargo da participação (GRV-48). `false` = a pessoa já não participa. */
  setMemberRole(groupId: GroupId, userId: UserId, role: string): Promise<boolean>;
  /**
   * Passa o grupo (GRV-49), numa transação: `toUserId` vira `owner` (condição: ainda é membro com o cargo `toRole`) e
   * `fromUserId` recebe `toRole` (condição: ainda é `owner`).
   */
  transferGroup(input: {
    groupId: GroupId;
    fromUserId: UserId;
    toUserId: UserId;
    toRole: string;
    now: Date;
  }): Promise<TransferGroupResult>;
}

export const dynamoRoleRepository: RoleRepository = {
  async getRoles(groupId, opts) {
    const item = await getItem(groupRolesKey(groupId), opts?.consistent);
    if (item) return stripKeys<StoredRoles>(item);
    // Grupo sem o item (não nasce assim): só os fixos, na versão 0.
    return { roles: [], everyonePermissions: [], createdAt: '', updatedAt: '', version: 0 };
  },

  async saveRoles(groupId, data, expectedVersion, at) {
    const key = groupRolesKey(groupId);
    await sendVersioned(key, () =>
      dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          ...withVersion(
            touch(
              {
                Key: key,
                UpdateExpression: 'SET #roles = :roles, everyonePermissions = :everyone',
                ExpressionAttributeNames: { '#roles': 'roles' },
                ExpressionAttributeValues: { ':roles': data.roles, ':everyone': data.everyonePermissions },
              },
              at,
            ),
            expectedVersion,
          ),
        }),
      ),
    );
  },

  async setMemberRole(groupId, userId, role) {
    try {
      await dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          ...touch({
            Key: groupMemberKey(groupId, userId),
            UpdateExpression: 'SET #role = :role',
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeNames: { '#role': 'role' },
            ExpressionAttributeValues: { ':role': role },
          }),
        }),
      );
      return true;
    } catch (err) {
      if (isConditionFailed(err)) return false;
      throw err;
    }
  },

  async transferGroup({ groupId, fromUserId, toUserId, toRole, now }) {
    const update = (
      userId: UserId,
      condition: string,
      names: Record<string, string>,
      values: Record<string, unknown>,
    ) => ({
      Update: touch(
        {
          TableName: tableName(),
          Key: groupMemberKey(groupId, userId),
          UpdateExpression: 'SET #role = :role',
          ConditionExpression: condition,
          ExpressionAttributeNames: { '#role': 'role', ...names },
          ExpressionAttributeValues: values,
        },
        now,
      ),
    });
    const result = await transactWrite([
      update(
        toUserId,
        '#role = :was AND #tier = :member',
        { '#tier': 'tier' },
        { ':role': 'owner', ':was': toRole, ':member': 'member' },
      ),
      update(fromUserId, '#role = :was', {}, { ':role': toRole, ':was': 'owner' }),
    ]);
    return result.ok ? 'ok' : 'conflict';
  },
};
