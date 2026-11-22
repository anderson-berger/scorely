import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  batchGetOrdered,
  dbItem,
  isConditionFailed,
  LOOKUP_ENTITY,
  queryLookupRows,
  sendVersioned,
  stripKeys,
  type TransactItem,
  touch,
  transactWrite,
  ttlFrom,
  withVersion,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import { asGroupId, type GroupId, type UserId } from '@scorely/api/src/lib/ids';
import {
  emailGroupInvitesLookupKey,
  emailGroupInvitesLookupPk,
  GROUP_ENTITY,
  GROUP_INVITE_ENTITY,
  GROUP_INVITE_PREFIX,
  GROUP_INVITE_USE_ENTITY,
  GROUP_INVITE_USE_PREFIX,
  GROUP_MEMBER_ENTITY,
  GROUP_MEMBER_PREFIX,
  GROUP_REQUEST_ENTITY,
  GROUP_REQUEST_PREFIX,
  GROUP_ROLES_ENTITY,
  groupInviteIdLookupKey,
  groupInviteKey,
  groupInviteTokenLookupKey,
  groupInviteUseKey,
  groupKey,
  groupMemberKey,
  groupPublicIdLookupKey,
  groupRequestKey,
  groupRolesKey,
  userGroupInvitesLookupKey,
  userGroupInvitesLookupPk,
  userGroupsLookupKey,
  userGroupsLookupPk,
} from '@scorely/api/src/modules/groups/group.table';
import type { GroupJoinMode, GroupPermission, GroupTier, PublicGroupId } from '@scorely/contracts';

/** O grupo como fica no banco (`META`): `id` é o uuid do sistema, `publicId` o código (GRV-08). Interno da api. */
export interface StoredGroup {
  id: GroupId;
  publicId: PublicGroupId;
  name: string;
  /** Modo de entrada (GRV-25): nasce `invite`. */
  joinMode: GroupJoinMode;
  createdAt: string;
  updatedAt: string;
  version: number;
  /** Ids das mídias do logo e da capa (GRV-09): só quando há imagem; a URL é montada na resposta (MID-12). */
  logoMediaId?: string | undefined;
  coverMediaId?: string | undefined;
}

/** A participação (GRV-02), `GROUP#<id> / MEMBER#<userId>`. */
export interface StoredMembership {
  groupId: GroupId;
  userId: UserId;
  /** Como participa (GRV-17). */
  tier: GroupTier;
  /** O cargo (GRV-40): `owner`, `everyone` ou o id de um cargo criado. Um id que já não está nos cargos vale `everyone` (GRV-47). */
  role: string;
  /** A data de entrada (GRV-22, 29). */
  createdAt: string;
  /** O convite pelo qual entrou ou subiu, quando houve (GRV-29). */
  inviteId?: string | undefined;
  /** Quem criou esse convite (GRV-29): guardado aqui para não sumir com o convite. */
  invitedBy?: UserId | undefined;
}

/** Um cargo criado (GRV-44), dentro do item `ROLES`. */
export interface StoredRole {
  id: string;
  name: string;
  permissions: GroupPermission[];
}

/** Os cargos do grupo (GRV-40), `GROUP#<id> / ROLES`: os criados, do mais alto ao mais baixo, e as permissões do Todos. */
export interface StoredRoles {
  roles: StoredRole[];
  everyonePermissions: GroupPermission[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** O pedido para entrar num grupo aberto (GRV-27), `GROUP#<groupId> / REQUEST#<userId>`. Entidade de relação. */
export interface StoredJoinRequest {
  groupId: GroupId;
  userId: UserId;
  createdAt: string;
}

/**
 * Resultado de aceitar (GRV-28): `request_gone` = o pedido não existe mais (cancelado, recusado ou aceito por outra
 * pessoa); `already_member` = a pessoa já participa (entrou por um convite antes): o pedido foi apagado e nada mais.
 */
export type ApproveRequestResult = 'ok' | 'request_gone' | 'already_member';

/** Para quem é o convite pessoal (GRV-23). */
export type InviteTarget = { userId: UserId } | { email: string };

/** O convite como fica no banco (GRV-18), `GROUP#<groupId> / INVITE#<id>`. Interno da api. */
export interface StoredInvite {
  id: string;
  groupId: GroupId;
  /** O token do link; segredo: só sai para quem tem `members.invite`. */
  token: string;
  createdBy: UserId;
  tier: GroupTier;
  /** Quando deixa de valer (ISO), só com prazo (ADR 0004). */
  expiresAt?: string | undefined;
  maxUses?: number | undefined;
  uses: number;
  revokedAt?: string | undefined;
  declinedAt?: string | undefined;
  /** Para quem é, no convite pessoal (GRV-23). O email vai normalizado. */
  target?: InviteTarget | undefined;
  /** Epoch em segundos: 30 dias depois de deixar de valer (GRV-19). Só limpa a tabela, quem vale é o resto. */
  ttl?: number | undefined;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** Quem entrou por um convite (GRV-19). */
export interface StoredInviteUse {
  groupId: GroupId;
  inviteId: string;
  userId: UserId;
  createdAt: string;
}

/** O que entrar por um convite faz com a participação (GRV-22): entra como novo ou sobe de reserva para membro. */
export type JoinAction = 'join' | 'promote';

/**
 * Resultado da gravação de entrar: `invite_stale` = o convite deixou de valer ou mudou desde a leitura (o service relê
 * e decide o motivo); `membership_stale` = a participação mudou desde a leitura (o service relê e decide de novo).
 */
export type JoinByInviteResult = 'ok' | 'invite_stale' | 'membership_stale';

/** Dias que o convite que deixou de valer continua na lista (GRV-19). */
export const INVITE_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
export const graceTtl = (from: Date) => ttlFrom(new Date(from.getTime() + INVITE_GRACE_DAYS * DAY_MS));

/** Resultado da criação: o lookup do id público já existia (o uuid é novo, só ele pode colidir). */
export type CreateGroupResult = 'created' | 'public_id_taken';

export interface GroupRepository {
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

  /** Convite + lookup do token, numa transação (GRV-18). */
  createInvite(invite: StoredInvite): Promise<void>;
  /** Todos os convites do grupo, em ordem qualquer (o service ordena e filtra). */
  listInvites(groupId: GroupId): Promise<StoredInvite[]>;
  /** `consistent`: leitura forte, para reler depois de a gravação de entrar falhar (GRV-22). */
  getInvite(
    groupId: GroupId,
    inviteId: string,
    opts?: { consistent?: boolean },
  ): Promise<StoredInvite | undefined>;
  /** Token → chave do convite. */
  resolveToken(token: string): Promise<{ groupId: GroupId; inviteId: string } | undefined>;
  /** Marca como cancelado (GRV-20) e agenda a limpeza (`ttl`). Quem chama já conferiu que vale. */
  revokeInvite(invite: StoredInvite, at: Date): Promise<void>;
  /** Os convites pessoais da pessoa, pelo id ou pelo email (GRV-24); em ordem qualquer, inclusive os que já não valem. */
  listInvitesFor(target: InviteTarget): Promise<{ groupId: GroupId; inviteId: string }[]>;
  /** Id do convite pessoal → chave dele (GRV-24, recusar). */
  resolveInviteId(inviteId: string): Promise<{ groupId: GroupId; inviteId: string } | undefined>;
  /** Marca como recusado (GRV-24) e agenda a limpeza (`ttl`). Quem chama já conferiu que vale. */
  declineInvite(invite: StoredInvite, at: Date): Promise<void>;
  /** Quem entrou por convites do grupo (GRV-19). */
  listInviteUses(groupId: GroupId): Promise<StoredInviteUse[]>;
  /**
   * Entrar (GRV-22), numa transação: soma 1 em `uses` com a condição de valer (sem passar do limite), grava ou sobe a
   * participação, o lookup do usuário e o uso. O `ttl` do convite entra quando este é o último uso.
   */
  joinByInvite(input: {
    invite: StoredInvite;
    userId: UserId;
    action: JoinAction;
    now: Date;
  }): Promise<JoinByInviteResult>;
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
  /** Todas as participações do grupo (GRV-29). */
  listMembers(groupId: GroupId): Promise<StoredMembership[]>;
  /** Número de participantes (GRV-21), por `Select: COUNT`. */
  countParticipants(groupId: GroupId): Promise<number>;
  /** Apaga a participação e o lookup do usuário (GRV-30, 31). `false` = a pessoa já não participava. */
  removeMembership(groupId: GroupId, userId: UserId): Promise<boolean>;

  /** Muda o modo de entrada (GRV-25), com a `version` conferida (ADR 0016): versão velha → `VERSION_CONFLICT`. */
  setJoinMode(groupId: GroupId, mode: GroupJoinMode, expectedVersion: number, at: Date): Promise<void>;
  /** O pedido da pessoa, se há (GRV-26, 27). `consistent`: para reler depois de a gravação falhar. */
  getRequest(
    groupId: GroupId,
    userId: UserId,
    opts?: { consistent?: boolean },
  ): Promise<StoredJoinRequest | undefined>;
  /** Grava o pedido, se ainda não há (GRV-27). `false` = já havia um, que fica como estava. */
  putRequest(request: StoredJoinRequest): Promise<boolean>;
  /** Apaga o pedido (GRV-27, 28). Com `mustExist`, `false` = não havia pedido; sem, apagar o que não há não é erro. */
  deleteRequest(groupId: GroupId, userId: UserId, opts?: { mustExist?: boolean }): Promise<boolean>;
  /** Os pedidos do grupo, em ordem qualquer (o service ordena, GRV-28). */
  listRequests(groupId: GroupId): Promise<StoredJoinRequest[]>;
  /**
   * Aceita o pedido (GRV-28), numa transação: apaga o pedido (que precisa existir), grava a participação (que não pode
   * existir) e o lookup do usuário. Se a pessoa já participa, só apaga o pedido.
   */
  approveRequest(input: {
    groupId: GroupId;
    userId: UserId;
    tier: GroupTier;
    now: Date;
  }): Promise<ApproveRequestResult>;
}

/** O convite pessoal grava os lookups do alvo e o do id, na mesma transação do convite (GRV-24). */
function targetLookups(invite: StoredInvite): TransactItem[] {
  if (!invite.target) return [];
  const body = {
    groupId: invite.groupId,
    inviteId: invite.id,
    ...(invite.ttl !== undefined && { ttl: invite.ttl }),
  };
  const put = (key: { PK: string; SK: string }): TransactItem => ({
    Put: { TableName: tableName(), Item: dbItem(key, LOOKUP_ENTITY, body, invite.createdAt) },
  });
  return [
    put(
      'userId' in invite.target
        ? userGroupInvitesLookupKey(invite.target.userId, invite.id)
        : emailGroupInvitesLookupKey(invite.target.email, invite.id),
    ),
    put(groupInviteIdLookupKey(invite.id)),
  ];
}

/** Os lookups do convite somem junto com ele: o do token e, no convite pessoal, os do alvo e do id (GRV-24). */
function lookupTtls(invite: StoredInvite, ttl: number): TransactItem[] {
  const keys = [
    groupInviteTokenLookupKey(invite.token),
    ...(invite.target
      ? [
          'userId' in invite.target
            ? userGroupInvitesLookupKey(invite.target.userId, invite.id)
            : emailGroupInvitesLookupKey(invite.target.email, invite.id),
          groupInviteIdLookupKey(invite.id),
        ]
      : []),
  ];
  // O lookup é gravado com o convite: faltar é bug, e o Update não pode criar um item só com a chave e o `ttl`.
  return keys.map((Key) => ({
    Update: {
      TableName: tableName(),
      Key,
      UpdateExpression: 'SET #ttl = :ttl',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':ttl': ttl },
    },
  }));
}

const joinedPk = (id: GroupId) => `GROUP#${id}`;

/**
 * Convite sem prazo que deixou de valer: os `INVITEUSE` já gravados ganham o `ttl` dele, logo depois da transação e
 * fora dela (o convite sem limite pode ter muitos usos). Se falhar, o uso que sobrar é ignorado na lista (GRV-19).
 */
async function expireInviteUses(invite: StoredInvite, ttl: number): Promise<void> {
  if (invite.expiresAt !== undefined) return; // com prazo, o `ttl` já foi gravado em cada uso
  try {
    const rows = await queryByPrefix(invite.groupId, `${GROUP_INVITE_USE_PREFIX}${invite.id}#`);
    await Promise.all(
      rows.map((row) =>
        dynamo().send(
          new UpdateCommand({
            TableName: tableName(),
            Key: { PK: row.PK as string, SK: row.SK as string },
            UpdateExpression: 'SET #ttl = :ttl',
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeNames: { '#ttl': 'ttl' },
            ExpressionAttributeValues: { ':ttl': ttl },
          }),
        ),
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify({ msg: 'Invite uses ttl failed', inviteId: invite.id, error: String(error) }),
    );
  }
}

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

  async createInvite(invite) {
    const lookupTtl = invite.ttl;
    const result = await transactWrite([
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(groupInviteKey(invite.groupId, invite.id), GROUP_INVITE_ENTITY, invite),
        },
      },
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(
            groupInviteTokenLookupKey(invite.token),
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
      ...targetLookups(invite),
    ]);
    if (!result.ok) throw new Error('Invite create failed');
  },

  async listInvites(groupId) {
    const rows = await queryByPrefix(groupId, GROUP_INVITE_PREFIX);
    return rows.map((row) => ({ ...stripKeys<StoredInvite>(row), ttl: row.ttl as number | undefined }));
  },

  async getInvite(groupId, inviteId, opts) {
    const item = await getItem(groupInviteKey(groupId, inviteId), opts?.consistent);
    return item ? { ...stripKeys<StoredInvite>(item), ttl: item.ttl as number | undefined } : undefined;
  },

  async resolveToken(token) {
    const pointer = await getItem(groupInviteTokenLookupKey(token));
    return pointer
      ? { groupId: asGroupId(pointer.groupId as string), inviteId: pointer.inviteId as string }
      : undefined;
  },

  async revokeInvite(invite, at) {
    const { groupId, id: inviteId } = invite;
    await transactWrite([
      {
        Update: touch(
          {
            TableName: tableName(),
            Key: groupInviteKey(groupId, inviteId),
            UpdateExpression: 'SET revokedAt = :at, #ttl = :ttl',
            ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(revokedAt)',
            ExpressionAttributeNames: { '#ttl': 'ttl' },
            ExpressionAttributeValues: { ':at': at.toISOString(), ':ttl': graceTtl(at) },
          },
          at,
        ),
      },
      ...lookupTtls(invite, graceTtl(at)),
    ]);
    await expireInviteUses(invite, graceTtl(at));
  },

  async listInvitesFor(target) {
    const pk =
      'userId' in target ? userGroupInvitesLookupPk(target.userId) : emailGroupInvitesLookupPk(target.email);
    const { Items = [] } = await dynamo().send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': pk },
      }),
    );
    return Items.map((row) => ({
      groupId: asGroupId(row.groupId as string),
      inviteId: row.inviteId as string,
    }));
  },

  async resolveInviteId(inviteId) {
    const pointer = await getItem(groupInviteIdLookupKey(inviteId));
    return pointer
      ? { groupId: asGroupId(pointer.groupId as string), inviteId: pointer.inviteId as string }
      : undefined;
  },

  async declineInvite(invite, at) {
    const { groupId, id: inviteId } = invite;
    await transactWrite([
      {
        Update: touch(
          {
            TableName: tableName(),
            Key: groupInviteKey(groupId, inviteId),
            UpdateExpression: 'SET declinedAt = :at, #ttl = :ttl',
            ConditionExpression:
              'attribute_exists(PK) AND attribute_not_exists(declinedAt) AND attribute_not_exists(revokedAt)',
            ExpressionAttributeNames: { '#ttl': 'ttl' },
            ExpressionAttributeValues: { ':at': at.toISOString(), ':ttl': graceTtl(at) },
          },
          at,
        ),
      },
      ...lookupTtls(invite, graceTtl(at)),
    ]);
    await expireInviteUses(invite, graceTtl(at));
  },

  async listInviteUses(groupId) {
    const rows = await queryByPrefix(groupId, GROUP_INVITE_USE_PREFIX);
    return rows.map((row) => stripKeys<StoredInviteUse>(row));
  },

  async joinByInvite({ invite, userId, action, now }) {
    const at = now.toISOString();
    const lastUse = invite.maxUses !== undefined && invite.uses + 1 >= invite.maxUses;
    const useInvite: TransactItem = {
      Update: touch(
        {
          TableName: tableName(),
          Key: groupInviteKey(invite.groupId, invite.id),
          UpdateExpression: `${lastUse ? 'SET #ttl = :ttl ' : ''}ADD uses :one`,
          ConditionExpression:
            'attribute_exists(PK) AND attribute_not_exists(revokedAt) AND attribute_not_exists(declinedAt)' +
            ' AND (attribute_not_exists(expiresAt) OR expiresAt > :now)' +
            // Com limite, `uses` igual ao lido: outro uso que entrou antes faz o service reler (e o `ttl` de esgotado
            // nunca é calculado sobre uma leitura atrasada).
            (invite.maxUses !== undefined ? ' AND uses = :uses' : ''),
          ...(lastUse && { ExpressionAttributeNames: { '#ttl': 'ttl' } }),
          ExpressionAttributeValues: {
            ':one': 1,
            ':now': at,
            ...(invite.maxUses !== undefined && { ':uses': invite.uses }),
            ...(lastUse && { ':ttl': graceTtl(now) }),
          },
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
                groupMemberKey(invite.groupId, userId),
                GROUP_MEMBER_ENTITY,
                {
                  groupId: invite.groupId,
                  userId,
                  tier: invite.tier,
                  role: 'everyone',
                  createdAt: at,
                  inviteId: invite.id,
                  invitedBy: invite.createdBy,
                } satisfies StoredMembership,
                at,
              ),
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          }
        : {
            Update: {
              TableName: tableName(),
              Key: groupMemberKey(invite.groupId, userId),
              UpdateExpression: 'SET tier = :member, inviteId = :inviteId, invitedBy = :invitedBy',
              ConditionExpression: 'tier = :reserve',
              ExpressionAttributeValues: {
                ':member': 'member',
                ':reserve': 'reserve',
                ':inviteId': invite.id,
                ':invitedBy': invite.createdBy,
              },
            },
          };
    const use: StoredInviteUse = { groupId: invite.groupId, inviteId: invite.id, userId, createdAt: at };
    // Com prazo, o `ttl` já é conhecido; sem prazo, este uso que esgota leva o `ttl` (a Query de depois pode não vê-lo).
    const ttl =
      invite.expiresAt !== undefined
        ? graceTtl(new Date(invite.expiresAt))
        : lastUse
          ? graceTtl(now)
          : undefined;
    const items: TransactItem[] = [
      useInvite,
      membership,
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(
            groupInviteUseKey(invite.groupId, invite.id, userId),
            GROUP_INVITE_USE_ENTITY,
            { ...use, ...(ttl !== undefined && { ttl }) },
            at,
          ),
        },
      },
      // Convite sem prazo que esgota: o lookup do token também ganha o `ttl` (some junto com o convite).
      ...(lastUse ? lookupTtls(invite, graceTtl(now)) : []),
      ...(action === 'join'
        ? [
            {
              Put: {
                TableName: tableName(),
                Item: dbItem(
                  userGroupsLookupKey(userId, invite.groupId),
                  LOOKUP_ENTITY,
                  { id: invite.groupId },
                  at,
                ),
              },
            },
          ]
        : []),
      // GRV-22: o pedido esperando some na mesma operação (sem condição: quase sempre não há).
      { Delete: { TableName: tableName(), Key: groupRequestKey(invite.groupId, userId) } },
    ];
    const result = await transactWrite(items);
    if (result.ok && lastUse) await expireInviteUses(invite, graceTtl(now));
    if (result.ok) return 'ok';
    if (result.failed.includes(0)) return 'invite_stale';
    if (result.failed.includes(1)) return 'membership_stale';
    throw new Error('Group join failed');
  },

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

  async listMembers(groupId) {
    const rows = await queryByPrefix(groupId, GROUP_MEMBER_PREFIX);
    return rows.map((row) => stripKeys<StoredMembership>(row));
  },

  countParticipants(groupId) {
    return countByPrefix(groupId, GROUP_MEMBER_PREFIX);
  },

  async removeMembership(groupId, userId) {
    const result = await transactWrite([
      {
        Delete: {
          TableName: tableName(),
          Key: groupMemberKey(groupId, userId),
          ConditionExpression: 'attribute_exists(PK)',
        },
      },
      { Delete: { TableName: tableName(), Key: userGroupsLookupKey(userId, groupId) } },
    ]);
    return result.ok;
  },

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
          Item: dbItem(groupRequestKey(request.groupId, request.userId), GROUP_REQUEST_ENTITY, request),
          ConditionExpression: 'attribute_not_exists(PK)',
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
          ConditionExpression: 'attribute_exists(PK)',
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
    ]);
    if (result.ok) return 'ok';
    if (result.failed.includes(0)) return 'request_gone';
    if (result.failed.includes(1)) {
      // Corrida com entrar por convite (GRV-22): a pessoa já participa; só o pedido some, sem mudar a participação.
      await dynamoGroupRepository.deleteRequest(groupId, userId);
      return 'already_member';
    }
    throw new Error('Group request approve failed');
  },
};
