// Grupo aberto (GRV-25–28): o modo de entrada e os pedidos para entrar.
import { DeleteCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  dbItem,
  isConditionFailed,
  LOOKUP_ENTITY,
  sendVersioned,
  stripKeys,
  touch,
  transactWrite,
  ttlFrom,
  withVersion,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import type { GroupId, UserId } from '@scorely/api/src/lib/ids';
import {
  getItem,
  participantsDelta,
  queryByPrefix,
} from '@scorely/api/src/modules/groups/data/groups.dynamo';
import {
  GROUP_MEMBER_ENTITY,
  GROUP_REQUEST_DAYS,
  GROUP_REQUEST_ENTITY,
  GROUP_REQUEST_PREFIX,
  groupKey,
  groupMemberKey,
  groupRequestKey,
  userGroupsLookupKey,
} from '@scorely/api/src/modules/groups/data/groups.table';
import type {
  ApproveRequestResult,
  StoredJoinRequest,
  StoredMembership,
} from '@scorely/api/src/modules/groups/data/groups.types';
import type { GroupJoinMode, GroupTier } from '@scorely/contracts';

const DAY_MS = 24 * 60 * 60 * 1000;

/** GRV-27: quando vence o pedido feito em `createdAt`. */
export function requestExpiresAt(createdAt: string): string {
  return new Date(Date.parse(createdAt) + GROUP_REQUEST_DAYS * DAY_MS).toISOString();
}

export interface OpenRepository {
  /** Muda o modo de entrada (GRV-25), com a `version` conferida (ADR 0016): versão velha → `VERSION_CONFLICT`. */
  setJoinMode(groupId: GroupId, mode: GroupJoinMode, expectedVersion: number, at: Date): Promise<void>;
  /** O pedido da pessoa, se há (GRV-26, 27). `consistent`: para reler depois de a gravação falhar. */
  getRequest(
    groupId: GroupId,
    userId: UserId,
    opts?: { consistent?: boolean },
  ): Promise<StoredJoinRequest | undefined>;
  /**
   * Grava o pedido (com o `ttl` no `expiresAt`), se não há um ou se o que há venceu (GRV-27). `false` = já havia um
   * pedido valendo, que fica como estava.
   */
  putRequest(request: StoredJoinRequest): Promise<boolean>;
  /** Apaga o pedido (GRV-27, 28). Com `mustExist`, `false` = não havia pedido; sem, apagar o que não há não é erro. */
  deleteRequest(groupId: GroupId, userId: UserId, opts?: { mustExist?: boolean }): Promise<boolean>;
  /** Os pedidos do grupo, em ordem qualquer (o service ordena, GRV-28). */
  listRequests(groupId: GroupId): Promise<StoredJoinRequest[]>;
  /**
   * Aceita o pedido (GRV-28), numa transação: apaga o pedido (que precisa existir e valer), grava a participação (que
   * não pode existir), o lookup do usuário e soma 1 nos participantes, com a condição de ter vaga (GRV-54). Se a pessoa
   * já participa, só apaga o pedido.
   */
  approveRequest(input: {
    groupId: GroupId;
    userId: UserId;
    tier: GroupTier;
    now: Date;
  }): Promise<ApproveRequestResult>;
}

export const dynamoOpenRepository: OpenRepository = {
  async setJoinMode(groupId, mode, expectedVersion, at) {
    const key = groupKey(groupId);
    await sendVersioned(key, () =>
      dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          ...withVersion(
            touch(
              {
                Key: key,
                UpdateExpression: 'SET joinMode = :mode',
                ConditionExpression: 'attribute_exists(PK)',
                ExpressionAttributeValues: { ':mode': mode },
              },
              at,
            ),
            expectedVersion,
          ),
        }),
      ),
    );
  },

  async getRequest(groupId, userId, opts) {
    const item = await getItem(groupRequestKey(groupId, userId), opts?.consistent);
    return item ? stripKeys<StoredJoinRequest>(item) : undefined;
  },

  async putRequest(request) {
    try {
      await dynamo().send(
        new PutCommand({
          TableName: tableName(),
          Item: dbItem(groupRequestKey(request.groupId, request.userId), GROUP_REQUEST_ENTITY, {
            ...request,
            ttl: ttlFrom(new Date(request.expiresAt)),
          }),
          // GRV-27: o pedido vencido (o `ttl` atrasa) é regravado como se não existisse.
          ConditionExpression: 'attribute_not_exists(PK) OR expiresAt <= :now',
          ExpressionAttributeValues: { ':now': request.createdAt },
        }),
      );
      return true;
    } catch (err) {
      if (isConditionFailed(err)) return false;
      throw err;
    }
  },

  async deleteRequest(groupId, userId, opts) {
    try {
      await dynamo().send(
        new DeleteCommand({
          TableName: tableName(),
          Key: groupRequestKey(groupId, userId),
          ...(opts?.mustExist && { ConditionExpression: 'attribute_exists(PK)' }),
        }),
      );
      return true;
    } catch (err) {
      if (isConditionFailed(err)) return false;
      throw err;
    }
  },

  async listRequests(groupId) {
    const rows = await queryByPrefix(groupId, GROUP_REQUEST_PREFIX);
    return rows.map((row) => stripKeys<StoredJoinRequest>(row));
  },

  async approveRequest({ groupId, userId, tier, now }) {
    const at = now.toISOString();
    const membership: StoredMembership = { groupId, userId, tier, role: 'everyone', createdAt: at };
    const result = await transactWrite([
      {
        Delete: {
          TableName: tableName(),
          Key: groupRequestKey(groupId, userId),
          // GRV-27: o vencido conta como apagado.
          ConditionExpression: 'attribute_exists(PK) AND expiresAt > :now',
          ExpressionAttributeValues: { ':now': at },
        },
      },
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(groupMemberKey(groupId, userId), GROUP_MEMBER_ENTITY, membership, at),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(userGroupsLookupKey(userId, groupId), LOOKUP_ENTITY, { id: groupId }, at),
        },
      },
      participantsDelta(groupId, 1, at),
    ]);
    if (result.ok) return 'ok';
    if (result.failed.includes(0)) return 'request_gone';
    // Corrida com entrar por convite (GRV-22): a pessoa já participa; só o pedido some, sem mudar a participação.
    // Vem antes do cheio: ela não ocuparia vaga nova.
    if (result.failed.includes(1)) {
      await dynamoOpenRepository.deleteRequest(groupId, userId);
      return 'already_member';
    }
    if (result.failed.includes(3)) return 'group_full';
    throw new Error('Group request approve failed');
  },
};
