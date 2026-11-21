import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  batchGetOrdered,
  dbItem,
  LOOKUP_ENTITY,
  queryLookupRows,
  stripKeys,
  type TransactItem,
  transactWrite,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import { asGroupId, type GroupId, type UserId } from '@scorely/api/src/lib/ids';
import {
  GROUP_V2_ENTITY,
  GROUP_V2_MEMBER_ENTITY,
  groupV2Key,
  groupV2MemberKey,
  groupV2PublicIdLookupKey,
  userGroupsV2LookupKey,
  userGroupsV2LookupPk,
} from '@scorely/api/src/modules/groups-v2/group-v2.table';
import type { GroupRoleV2, PublicGroupId } from '@scorely/contracts';

/** O grupo como fica no banco (`META`): `id` é o uuid do sistema, `publicId` o código (GRV-08). Interno da api. */
export interface StoredGroupV2 {
  id: GroupId;
  publicId: PublicGroupId;
  name: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  /** Ids das mídias do logo e da capa (GRV-09): só quando há imagem; a URL é montada na resposta (MID-12). */
  logoMediaId?: string | undefined;
  coverMediaId?: string | undefined;
}

/** A participação (GRV-02), `GROUP2#<id> / MEMBER#<userId>`. */
export interface StoredMembershipV2 {
  groupId: GroupId;
  userId: UserId;
  role: GroupRoleV2;
  createdAt: string;
}

/** Resultado da criação: o lookup do id público já existia (o uuid é novo, só ele pode colidir). */
export type CreateGroupV2Result = 'created' | 'public_id_taken';

export interface GroupV2Repository {
  /** META + MEMBER do dono + LOOKUP do usuário + LOOKUP público, numa transação. */
  create(group: StoredGroupV2, ownerId: UserId): Promise<CreateGroupV2Result>;
  /** LOOKUP público → uuid. */
  resolve(publicId: PublicGroupId): Promise<GroupId | undefined>;
  /** `consistent`: leitura forte, para ler logo depois de a mídia gravar (GRV-09). */
  get(id: GroupId, opts?: { consistent?: boolean }): Promise<StoredGroupV2 | undefined>;
  getMembership(id: GroupId, userId: UserId): Promise<StoredMembershipV2 | undefined>;
  /** Os grupos da pessoa com a participação dela (ordem qualquer: o service ordena). */
  listMine(userId: UserId): Promise<{ group: StoredGroupV2; membership: StoredMembershipV2 }[]>;
}

async function getItem(
  Key: Record<string, string>,
  consistent = false,
): Promise<Record<string, unknown> | undefined> {
  const { Item } = await dynamo().send(
    new GetCommand({ TableName: tableName(), Key, ConsistentRead: consistent }),
  );
  return Item;
}

export const dynamoGroupV2Repository: GroupV2Repository = {
  async create(group, ownerId) {
    const put = (Item: Record<string, unknown>, unique = false): TransactItem => ({
      Put: {
        TableName: tableName(),
        Item,
        ...(unique && { ConditionExpression: 'attribute_not_exists(PK)' }),
      },
    });
    const membership: StoredMembershipV2 = {
      groupId: group.id,
      userId: ownerId,
      role: 'owner',
      createdAt: group.createdAt,
    };
    // O índice 3 é o lookup público: o único que pode colidir (o uuid é novo).
    const result = await transactWrite([
      put(dbItem(groupV2Key(group.id), GROUP_V2_ENTITY, group), true),
      put(dbItem(groupV2MemberKey(group.id, ownerId), GROUP_V2_MEMBER_ENTITY, membership, group.createdAt)),
      put(dbItem(userGroupsV2LookupKey(ownerId, group.id), LOOKUP_ENTITY, { id: group.id }, group.createdAt)),
      put(
        dbItem(groupV2PublicIdLookupKey(group.publicId), LOOKUP_ENTITY, { id: group.id }, group.createdAt),
        true,
      ),
    ]);
    if (result.ok) return 'created';
    if (result.failed.includes(3)) return 'public_id_taken';
    throw new Error('Group create failed');
  },

  async resolve(publicId) {
    const pointer = await getItem(groupV2PublicIdLookupKey(publicId));
    return pointer ? asGroupId(pointer.id as string) : undefined;
  },

  async get(id, opts) {
    const item = await getItem(groupV2Key(id), opts?.consistent);
    return item ? stripKeys<StoredGroupV2>(item) : undefined;
  },

  async getMembership(id, userId) {
    const item = await getItem(groupV2MemberKey(id, userId));
    return item ? stripKeys<StoredMembershipV2>(item) : undefined;
  },

  async listMine(userId) {
    const ids = (await queryLookupRows(userGroupsV2LookupPk(userId))).map((row) => asGroupId(row.id));
    const rows = await batchGetOrdered(ids.flatMap((id) => [groupV2Key(id), groupV2MemberKey(id, userId)]));
    const byKey = new Map(rows.map((row) => [`${row.PK}|${row.SK}`, row]));
    return ids.flatMap((id) => {
      const g = groupV2Key(id);
      const m = groupV2MemberKey(id, userId);
      const group = byKey.get(`${g.PK}|${g.SK}`);
      const membership = byKey.get(`${m.PK}|${m.SK}`);
      if (!group || !membership) return [];
      return [
        { group: stripKeys<StoredGroupV2>(group), membership: stripKeys<StoredMembershipV2>(membership) },
      ];
    });
  },
};
