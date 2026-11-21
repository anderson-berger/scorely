import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  batchGetOrdered,
  dbItem,
  LOOKUP_ENTITY,
  queryLookupRows,
  stripKeys,
  type TransactItem,
  touch,
  transactWrite,
  ttlFrom,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import { asGroupId, type GroupId, type UserId } from '@scorely/api/src/lib/ids';
import {
  GROUP_V2_ENTITY,
  GROUP_V2_INVITE_ENTITY,
  GROUP_V2_INVITE_PREFIX,
  GROUP_V2_INVITE_USE_ENTITY,
  GROUP_V2_INVITE_USE_PREFIX,
  GROUP_V2_MEMBER_ENTITY,
  GROUP_V2_MEMBER_PREFIX,
  groupV2InviteKey,
  groupV2InviteTokenLookupKey,
  groupV2InviteUseKey,
  groupV2Key,
  groupV2MemberKey,
  groupV2PublicIdLookupKey,
  userGroupsV2LookupKey,
  userGroupsV2LookupPk,
} from '@scorely/api/src/modules/groups-v2/group-v2.table';
import type { GroupRoleV2, GroupTierV2, PublicGroupId } from '@scorely/contracts';

/** O grupo como fica no banco (`META`): `id` é o uuid do sistema, `publicId` o código (GRV-08). Interno da api. */
export interface StoredGroupV2 {
  id: GroupId;
  publicId: PublicGroupId;
  name: string;
  /** Modo de entrada (GRV-25): nasce `invite`. */
  joinMode: 'invite' | 'open';
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
  /** Como participa (GRV-17). */
  tier: GroupTierV2;
  /** O cargo (GRV-15). */
  role: GroupRoleV2;
  /** A data de entrada (GRV-22, 29). */
  createdAt: string;
  /** O convite pelo qual entrou ou subiu, quando houve (GRV-29). */
  inviteId?: string | undefined;
}

/** O convite como fica no banco (GRV-18), `GROUP2#<groupId> / INVITE#<id>`. Interno da api. */
export interface StoredInviteV2 {
  id: string;
  groupId: GroupId;
  /** O token do link; segredo: só sai para quem tem `members.invite`. */
  token: string;
  createdBy: UserId;
  tier: GroupTierV2;
  /** Quando deixa de valer (ISO), só com prazo (ADR 0004). */
  expiresAt?: string | undefined;
  maxUses?: number | undefined;
  uses: number;
  revokedAt?: string | undefined;
  declinedAt?: string | undefined;
  /** Epoch em segundos: 30 dias depois de deixar de valer (GRV-19). Só limpa a tabela, quem vale é o resto. */
  ttl?: number | undefined;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** Quem entrou por um convite (GRV-19). */
export interface StoredInviteUseV2 {
  groupId: GroupId;
  inviteId: string;
  userId: UserId;
  createdAt: string;
}

/** O que entrar por um convite faz com a participação (GRV-22): entra como novo ou sobe de reserva para membro. */
export type JoinActionV2 = 'join' | 'promote';

/**
 * Resultado da gravação de entrar: `invite_stale` = o convite deixou de valer ou mudou desde a leitura (o service relê
 * e decide o motivo); `membership_stale` = a participação mudou desde a leitura (o service relê e decide de novo).
 */
export type JoinByInviteV2Result = 'ok' | 'invite_stale' | 'membership_stale';

/** Dias que o convite que deixou de valer continua na lista (GRV-19). */
export const INVITE_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
export const graceTtl = (from: Date) => ttlFrom(new Date(from.getTime() + INVITE_GRACE_DAYS * DAY_MS));

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

  /** Convite + lookup do token, numa transação (GRV-18). */
  createInvite(invite: StoredInviteV2): Promise<void>;
  /** Todos os convites do grupo, em ordem qualquer (o service ordena e filtra). */
  listInvites(groupId: GroupId): Promise<StoredInviteV2[]>;
  getInvite(groupId: GroupId, inviteId: string): Promise<StoredInviteV2 | undefined>;
  /** Token → chave do convite. */
  resolveToken(token: string): Promise<{ groupId: GroupId; inviteId: string } | undefined>;
  /** Marca como cancelado (GRV-20) e agenda a limpeza (`ttl`). Quem chama já conferiu que vale. */
  revokeInvite(groupId: GroupId, inviteId: string, token: string, at: Date): Promise<void>;
  /** Quem entrou por convites do grupo (GRV-19). */
  listInviteUses(groupId: GroupId): Promise<StoredInviteUseV2[]>;
  /**
   * Entrar (GRV-22), numa transação: soma 1 em `uses` com a condição de valer (sem passar do limite), grava ou sobe a
   * participação, o lookup do usuário e o uso. O `ttl` do convite entra quando este é o último uso.
   */
  joinByInvite(input: {
    invite: StoredInviteV2;
    userId: UserId;
    action: JoinActionV2;
    now: Date;
  }): Promise<JoinByInviteV2Result>;
  /** Todas as participações do grupo (GRV-29). */
  listMembers(groupId: GroupId): Promise<StoredMembershipV2[]>;
  /** Número de participantes (GRV-21), por `Select: COUNT`. */
  countParticipants(groupId: GroupId): Promise<number>;
  /** Apaga a participação e o lookup do usuário (GRV-30, 31). `false` = a pessoa já não participava. */
  removeMembership(groupId: GroupId, userId: UserId): Promise<boolean>;
}

/** Agenda a limpeza do lookup do token junto com a do convite (o lookup nasce sem `ttl` quando o convite não tem prazo). */
function tokenLookupTtl(token: string, ttl: number): TransactItem {
  return {
    Update: {
      TableName: tableName(),
      Key: groupV2InviteTokenLookupKey(token),
      UpdateExpression: 'SET #ttl = :ttl',
      ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':ttl': ttl },
    },
  };
}

const joinedPk = (id: GroupId) => `GROUP2#${id}`;

/** Query de uma partição do grupo por prefixo de `SK`, seguindo as páginas. */
async function queryByPrefix(
  id: GroupId,
  prefix: string,
  startKey?: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const { Items = [], LastEvaluatedKey } = await dynamo().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': joinedPk(id), ':prefix': prefix },
      ...(startKey && { ExclusiveStartKey: startKey }),
    }),
  );
  return LastEvaluatedKey ? [...Items, ...(await queryByPrefix(id, prefix, LastEvaluatedKey))] : Items;
}

async function countByPrefix(
  id: GroupId,
  prefix: string,
  startKey?: Record<string, unknown>,
): Promise<number> {
  const { Count = 0, LastEvaluatedKey } = await dynamo().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': joinedPk(id), ':prefix': prefix },
      Select: 'COUNT',
      ...(startKey && { ExclusiveStartKey: startKey }),
    }),
  );
  return LastEvaluatedKey ? Count + (await countByPrefix(id, prefix, LastEvaluatedKey)) : Count;
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
      tier: 'member',
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

  async createInvite(invite) {
    const lookupTtl = invite.ttl;
    const result = await transactWrite([
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(groupV2InviteKey(invite.groupId, invite.id), GROUP_V2_INVITE_ENTITY, invite),
        },
      },
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(
            groupV2InviteTokenLookupKey(invite.token),
            LOOKUP_ENTITY,
            {
              groupId: invite.groupId,
              inviteId: invite.id,
              ...(lookupTtl !== undefined && { ttl: lookupTtl }),
            },
            invite.createdAt,
          ),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ]);
    if (!result.ok) throw new Error('Invite create failed');
  },

  async listInvites(groupId) {
    const rows = await queryByPrefix(groupId, GROUP_V2_INVITE_PREFIX);
    return rows.map((row) => ({ ...stripKeys<StoredInviteV2>(row), ttl: row.ttl as number | undefined }));
  },

  async getInvite(groupId, inviteId) {
    const item = await getItem(groupV2InviteKey(groupId, inviteId));
    return item ? { ...stripKeys<StoredInviteV2>(item), ttl: item.ttl as number | undefined } : undefined;
  },

  async resolveToken(token) {
    const pointer = await getItem(groupV2InviteTokenLookupKey(token));
    return pointer
      ? { groupId: asGroupId(pointer.groupId as string), inviteId: pointer.inviteId as string }
      : undefined;
  },

  async revokeInvite(groupId, inviteId, token, at) {
    await transactWrite([
      {
        Update: touch(
          {
            TableName: tableName(),
            Key: groupV2InviteKey(groupId, inviteId),
            UpdateExpression: 'SET revokedAt = :at, #ttl = :ttl',
            ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(revokedAt)',
            ExpressionAttributeNames: { '#ttl': 'ttl' },
            ExpressionAttributeValues: { ':at': at.toISOString(), ':ttl': graceTtl(at) },
          },
          at,
        ),
      },
      tokenLookupTtl(token, graceTtl(at)),
    ]);
  },

  async listInviteUses(groupId) {
    const rows = await queryByPrefix(groupId, GROUP_V2_INVITE_USE_PREFIX);
    return rows.map((row) => stripKeys<StoredInviteUseV2>(row));
  },

  async joinByInvite({ invite, userId, action, now }) {
    const at = now.toISOString();
    const lastUse = invite.maxUses !== undefined && invite.uses + 1 >= invite.maxUses;
    const useInvite: TransactItem = {
      Update: touch(
        {
          TableName: tableName(),
          Key: groupV2InviteKey(invite.groupId, invite.id),
          UpdateExpression: `${lastUse ? 'SET #ttl = :ttl ' : ''}ADD uses :one`,
          ConditionExpression:
            'attribute_exists(PK) AND attribute_not_exists(revokedAt) AND attribute_not_exists(declinedAt)' +
            ' AND (attribute_not_exists(expiresAt) OR expiresAt > :now)' +
            ' AND (attribute_not_exists(maxUses) OR uses < maxUses)',
          ...(lastUse && { ExpressionAttributeNames: { '#ttl': 'ttl' } }),
          ExpressionAttributeValues: { ':one': 1, ':now': at, ...(lastUse && { ':ttl': graceTtl(now) }) },
        },
        now,
      ),
    };
    const membership: TransactItem =
      action === 'join'
        ? {
            Put: {
              TableName: tableName(),
              Item: dbItem(
                groupV2MemberKey(invite.groupId, userId),
                GROUP_V2_MEMBER_ENTITY,
                {
                  groupId: invite.groupId,
                  userId,
                  tier: invite.tier,
                  role: 'member',
                  createdAt: at,
                  inviteId: invite.id,
                } satisfies StoredMembershipV2,
                at,
              ),
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          }
        : {
            Update: {
              TableName: tableName(),
              Key: groupV2MemberKey(invite.groupId, userId),
              UpdateExpression: 'SET tier = :member, inviteId = :inviteId',
              ConditionExpression: 'tier = :reserve',
              ExpressionAttributeValues: {
                ':member': 'member',
                ':reserve': 'reserve',
                ':inviteId': invite.id,
              },
            },
          };
    const use: StoredInviteUseV2 = { groupId: invite.groupId, inviteId: invite.id, userId, createdAt: at };
    const ttl = invite.expiresAt !== undefined ? graceTtl(new Date(invite.expiresAt)) : undefined;
    const items: TransactItem[] = [
      useInvite,
      membership,
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(
            groupV2InviteUseKey(invite.groupId, invite.id, userId),
            GROUP_V2_INVITE_USE_ENTITY,
            { ...use, ...(ttl !== undefined && { ttl }) },
            at,
          ),
        },
      },
      // Convite sem prazo que esgota: o lookup do token também ganha o `ttl` (some junto com o convite).
      ...(lastUse ? [tokenLookupTtl(invite.token, graceTtl(now))] : []),
      ...(action === 'join'
        ? [
            {
              Put: {
                TableName: tableName(),
                Item: dbItem(
                  userGroupsV2LookupKey(userId, invite.groupId),
                  LOOKUP_ENTITY,
                  { id: invite.groupId },
                  at,
                ),
              },
            },
          ]
        : []),
    ];
    const result = await transactWrite(items);
    if (result.ok) return 'ok';
    if (result.failed.includes(0)) return 'invite_stale';
    if (result.failed.includes(1)) return 'membership_stale';
    throw new Error('Group join failed');
  },

  async listMembers(groupId) {
    const rows = await queryByPrefix(groupId, GROUP_V2_MEMBER_PREFIX);
    return rows.map((row) => stripKeys<StoredMembershipV2>(row));
  },

  countParticipants(groupId) {
    return countByPrefix(groupId, GROUP_V2_MEMBER_PREFIX);
  },

  async removeMembership(groupId, userId) {
    const result = await transactWrite([
      {
        Delete: {
          TableName: tableName(),
          Key: groupV2MemberKey(groupId, userId),
          ConditionExpression: 'attribute_exists(PK)',
        },
      },
      { Delete: { TableName: tableName(), Key: userGroupsV2LookupKey(userId, groupId) } },
    ]);
    return result.ok;
  },
};
