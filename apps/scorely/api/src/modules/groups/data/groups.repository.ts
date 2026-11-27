// O grupo (GRV-01–08, 52) e o repositório inteiro, que junta os assuntos de data/.
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  batchGetOrdered,
  COUNTERS_ENTITY,
  dbItem,
  LOOKUP_ENTITY,
  queryLookupRows,
  sendVersioned,
  stripKeys,
  type TransactItem,
  touch,
  transactWrite,
  withVersion,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import { asGroupId, type GroupId, type UserId } from '@scorely/api/src/lib/ids';
import { getItem } from '@scorely/api/src/modules/groups/data/groups.dynamo';
import {
  dynamoInviteRepository,
  type InviteRepository,
} from '@scorely/api/src/modules/groups/data/groups.invites.repository';
import {
  dynamoMemberRepository,
  type MemberRepository,
} from '@scorely/api/src/modules/groups/data/groups.members.repository';
import {
  dynamoOpenRepository,
  type OpenRepository,
} from '@scorely/api/src/modules/groups/data/groups.open.repository';
import {
  dynamoRoleRepository,
  type RoleRepository,
} from '@scorely/api/src/modules/groups/data/groups.roles.repository';
import {
  GROUP_ENTITY,
  GROUP_MEMBER_ENTITY,
  GROUP_ROLES_ENTITY,
  groupCountersKey,
  groupKey,
  groupMemberKey,
  groupPublicIdLookupKey,
  groupRolesKey,
  userGroupsLookupKey,
  userGroupsLookupPk,
} from '@scorely/api/src/modules/groups/data/groups.table';
import type {
  CreateGroupResult,
  StoredGroup,
  StoredMembership,
} from '@scorely/api/src/modules/groups/data/groups.types';
import type { GroupModality, PublicGroupId } from '@scorely/contracts';

export { graceTtl, INVITE_GRACE_DAYS } from '@scorely/api/src/modules/groups/data/groups.invites.repository';
export { requestExpiresAt } from '@scorely/api/src/modules/groups/data/groups.open.repository';
export type * from '@scorely/api/src/modules/groups/data/groups.types';

export interface GroupRepository extends InviteRepository, RoleRepository, MemberRepository, OpenRepository {
  /** META + MEMBER do dono + LOOKUP do usuário + LOOKUP público, numa transação. */
  create(group: StoredGroup, ownerId: UserId): Promise<CreateGroupResult>;
  /** LOOKUP público → uuid. */
  resolve(publicId: PublicGroupId): Promise<GroupId | undefined>;
  /** `consistent`: leitura forte, para ler logo depois de a mídia gravar (GRV-09). */
  get(id: GroupId, opts?: { consistent?: boolean }): Promise<StoredGroup | undefined>;
  getMembership(
    id: GroupId,
    userId: UserId,
    opts?: { consistent?: boolean },
  ): Promise<StoredMembership | undefined>;
  /** Os grupos da pessoa com a participação dela (ordem qualquer: o service ordena). */
  listMine(userId: UserId): Promise<{ group: StoredGroup; membership: StoredMembership }[]>;
  /** Muda a modalidade (GRV-52), com a `version` conferida (ADR 0016): versão velha → `VERSION_CONFLICT`. */
  setModality(groupId: GroupId, modality: GroupModality, expectedVersion: number, at: Date): Promise<void>;
}

export const dynamoGroupRepository: GroupRepository = {
  async create(group, ownerId) {
    const put = (Item: Record<string, unknown>, unique = false): TransactItem => ({
      Put: {
        TableName: tableName(),
        Item,
        ...(unique && { ConditionExpression: 'attribute_not_exists(PK)' }),
      },
    });
    const membership: StoredMembership = {
      groupId: group.id,
      userId: ownerId,
      tier: 'member',
      role: 'owner',
      createdAt: group.createdAt,
    };
    // O índice 3 é o lookup público: o único que pode colidir (o uuid é novo).
    const result = await transactWrite([
      put(dbItem(groupKey(group.id), GROUP_ENTITY, group), true),
      put(dbItem(groupMemberKey(group.id, ownerId), GROUP_MEMBER_ENTITY, membership, group.createdAt)),
      put(dbItem(userGroupsLookupKey(ownerId, group.id), LOOKUP_ENTITY, { id: group.id }, group.createdAt)),
      put(
        dbItem(groupPublicIdLookupKey(group.publicId), LOOKUP_ENTITY, { id: group.id }, group.createdAt),
        true,
      ),
      // GRV-02: os cargos nascem vazios, só com os dois fixos (que não são gravados).
      put(
        dbItem(
          groupRolesKey(group.id),
          GROUP_ROLES_ENTITY,
          { roles: [], everyonePermissions: [] },
          group.createdAt,
        ),
      ),
      // GRV-54: o dono é o primeiro participante.
      put(dbItem(groupCountersKey(group.id), COUNTERS_ENTITY, { participants: 1 }, group.createdAt)),
    ]);
    if (result.ok) return 'created';
    if (result.failed.includes(3)) return 'public_id_taken';
    throw new Error('Group create failed');
  },

  async resolve(publicId) {
    const pointer = await getItem(groupPublicIdLookupKey(publicId));
    return pointer ? asGroupId(pointer.id as string) : undefined;
  },

  async get(id, opts) {
    const item = await getItem(groupKey(id), opts?.consistent);
    return item ? stripKeys<StoredGroup>(item) : undefined;
  },

  async getMembership(id, userId, opts) {
    const item = await getItem(groupMemberKey(id, userId), opts?.consistent);
    return item ? stripKeys<StoredMembership>(item) : undefined;
  },

  async listMine(userId) {
    const ids = (await queryLookupRows(userGroupsLookupPk(userId))).map((row) => asGroupId(row.id));
    const rows = await batchGetOrdered(ids.flatMap((id) => [groupKey(id), groupMemberKey(id, userId)]));
    const byKey = new Map(rows.map((row) => [`${row.PK}|${row.SK}`, row]));
    return ids.flatMap((id) => {
      const g = groupKey(id);
      const m = groupMemberKey(id, userId);
      const group = byKey.get(`${g.PK}|${g.SK}`);
      const membership = byKey.get(`${m.PK}|${m.SK}`);
      if (!group || !membership) return [];
      return [{ group: stripKeys<StoredGroup>(group), membership: stripKeys<StoredMembership>(membership) }];
    });
  },

  async setModality(groupId, modality, expectedVersion, at) {
    const key = groupKey(groupId);
    await sendVersioned(key, () =>
      dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          ...withVersion(
            touch(
              {
                Key: key,
                UpdateExpression: 'SET modality = :modality',
                ConditionExpression: 'attribute_exists(PK)',
                ExpressionAttributeValues: { ':modality': modality },
              },
              at,
            ),
            expectedVersion,
          ),
        }),
      ),
    );
  },

  ...dynamoInviteRepository,
  ...dynamoRoleRepository,
  ...dynamoMemberRepository,
  ...dynamoOpenRepository,
};
