import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  batchGetOrdered,
  COUNTERS_ENTITY,
  currentVersion,
  dbItem,
  isConditionFailed,
  LOOKUP_ENTITY,
  queryLookupRows,
  sendVersioned,
  setCreatedAtIfNew,
  stripKeys,
  type TransactItem,
  touch,
  transactWrite,
  ttlFrom,
  versionConflict,
  withVersion,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import { appError } from '@scorely/api/src/lib/errors';
import { asUserId, type UserId } from '@scorely/api/src/lib/ids';
import { type AttendanceRecord, attendanceDeletes } from '@scorely/api/src/modules/groups/game.repository';
import {
  GROUP_ENTITY,
  GROUP_INVITES_ENTITY,
  GROUP_SETTINGS_ENTITY,
  groupCountersKey,
  groupGuestLookupKey,
  groupInviteLookupKey,
  groupInvitesKey,
  groupKey,
  groupPk,
  groupReserveInviteLookupKey,
  groupSettingsKey,
  placeKey,
  sportGroupLookupKey,
} from '@scorely/api/src/modules/groups/group.table';
import {
  MEMBER_INVITE_ENTITY,
  MEMBER_SK_PREFIX,
  MEMBERSHIP_ENTITY,
  type MemberInviteRecord,
  type MembershipRecord,
  memberInviteKey,
  membershipKey,
  userGroupLookupKey,
  userGroupsLookupPk,
} from '@scorely/api/src/modules/groups/membership.table';
import type { Group, InviteKind, MemberTier, RoleId } from '@scorely/contracts';

/**
 * O grupo como o service enxerga: a identidade (`META`), o padrão do jogo (`SETTINGS`) e os links (`INVITES`) juntos.
 * O repositório monta na leitura e separa na escrita (ADR 0015). Ativo, tem os 3 tokens; arquivado, tem `archivedAt` e
 * nenhum token (GRP-31). Quem é o dono não está aqui: é o cargo `owner` da participação (GRP-48).
 */
export type StoredGroup = Omit<
  Group,
  'logoUrl' | 'coverUrl' | 'myTier' | 'myRoleId' | 'myPermissions' | 'myMemberInvite'
> & {
  /** GRP-35: as mídias do logo e da capa; a URL é montada na resposta (MID-12). */
  logoMediaId?: string | undefined;
  coverMediaId?: string | undefined;
};

/** Campos de cada item do grupo (o resto do `StoredGroup` é o `META`). */
const SETTINGS_FIELDS = [
  'weekday',
  'time',
  'defaultPlaceId',
  'slots',
  'minPlayers',
  'listOpensHoursBefore',
  'reservesOpenHoursBefore',
  'guestsOpenHoursBefore',
  'maxMembers',
  'maxReserves',
] as const satisfies readonly (keyof StoredGroup)[];

const TOKEN_FIELD = {
  member: 'inviteToken',
  reserve: 'reserveInviteToken',
  guest: 'guestToken',
} as const satisfies Record<InviteKind, keyof StoredGroup>;

const TOKEN_FIELDS = Object.values(TOKEN_FIELD);

/** Atributos de controle que cada item tem; no `StoredGroup` valem os do `META` (e a `settingsVersion`, GRP-59). */
const OWN_FIELDS = ['createdAt', 'updatedAt', 'version'];

/** Campos que não são de nenhum item: o `dbItem` e a gravação cuidam (a `settingsVersion` é a `version` do SETTINGS). */
const COMPUTED = ['version', 'updatedAt', 'settingsVersion'];

function pick(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(fields.flatMap((f) => (source[f] === undefined ? [] : [[f, source[f]]])));
}

function omit(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(source).filter(([k, v]) => !fields.includes(k) && v !== undefined),
  );
}

/** O `StoredGroup` em três itens: `META`, `SETTINGS` e `INVITES` (ausente sem token, no grupo arquivado). */
function split(group: StoredGroup) {
  const all = group as unknown as Record<string, unknown>;
  const invites = pick(all, TOKEN_FIELDS);
  return {
    meta: omit(all, [...SETTINGS_FIELDS, ...TOKEN_FIELDS, ...COMPUTED]),
    settings: { groupId: group.id, ...pick(all, SETTINGS_FIELDS) },
    invites: Object.keys(invites).length > 0 ? { groupId: group.id, ...invites } : undefined,
  };
}

/** Junta os itens lidos (pelo `entity`) no `StoredGroup`. Sem `META` ou `SETTINGS`, o grupo não existe. */
function assemble(rows: readonly Record<string, unknown>[]): StoredGroup | undefined {
  const byEntity = new Map(
    rows.map((row) => [row.entity as string, stripKeys<Record<string, unknown>>(row)]),
  );
  const meta = byEntity.get(GROUP_ENTITY);
  const settings = byEntity.get(GROUP_SETTINGS_ENTITY);
  if (!meta || !settings) return undefined;
  const invites = byEntity.get(GROUP_INVITES_ENTITY) ?? {};
  return {
    ...meta,
    settingsVersion: Number(settings.version ?? 0),
    ...omit(settings, ['groupId', ...OWN_FIELDS]),
    ...omit(invites, ['groupId', ...OWN_FIELDS]),
  } as unknown as StoredGroup;
}

/** As chaves dos 3 itens que formam o `StoredGroup`. */
function groupKeys(id: string) {
  return [groupKey(id), groupSettingsKey(id), groupInvitesKey(id)];
}

/**
 * Entrada pelo link (GRP-02, 39). `unchanged` = já tinha o papel (ou membro abrindo o link de reserva);
 * `members_full`/`reserves_full` = limite do papel de destino; `stale` = o limite mudou, o grupo foi arquivado ou
 * o papel mudou depois da leitura (releia e tente de novo).
 */
export type AddMemberResult = 'added' | 'promoted' | 'unchanged' | 'members_full' | 'reserves_full' | 'stale';

/** Aceite do convite (GRP-41). `invalid` = sem convite válido no instante (ou não é mais reserva). */
export type AcceptInviteResult = 'promoted' | 'invalid' | 'members_full' | 'stale';

/** Os 3 tokens de um grupo ativo, gerados juntos no desarquivar (GRP-33). */
export interface GroupTokens {
  inviteToken: string;
  reserveInviteToken: string;
  guestToken: string;
}

/**
 * Resultado da remoção (plano 006, D4; plano 013, D6): `not_member` = outra requisição já tirou o participante;
 * `stale` = o papel, o convite ou a presença mudaram depois da leitura (releia e tente de novo).
 */
export type RemoveMemberResult = 'removed' | 'not_member' | 'stale';

/** Mudança do padrão do jogo (o `SETTINGS`). `null` remove o campo (convidados desligados, sem mínimo). */
export interface GroupPatch {
  listOpensHoursBefore?: number | undefined;
  reservesOpenHoursBefore?: number | undefined;
  guestsOpenHoursBefore?: number | null | undefined;
  /** GRP-38 */
  maxMembers?: number | undefined;
  maxReserves?: number | undefined;
  /** GRP-45 */
  slots?: number | undefined;
  /** GRP-46: `null` remove o campo (sem mínimo). */
  minPlayers?: number | null | undefined;
  /** GRP-62: o lugar padrão; `null` tira. Conferido na gravação (o lugar existe e está ativo). */
  defaultPlaceId?: string | null | undefined;
}

/** Participante do grupo; `createdAt` é a data de entrada (o service ordena por ela). */
export interface GroupMember {
  userId: UserId;
  tier: MemberTier;
  /** O cargo (GRP-48), como gravado. */
  roleId: RoleId;
  createdAt: string;
  /** Prazo do convite para membro (GRP-40), como gravado: quem confere se venceu é o service. */
  memberInviteExpiresAt?: string;
}

/** A participação de uma pessoa, com o convite pendente, se houver. */
export type Membership = Omit<GroupMember, 'userId' | 'createdAt'>;

export interface GroupRepository {
  /** O grupo (META + SETTINGS + INVITES), num BatchGet. */
  get(id: string, opts?: { consistent?: boolean }): Promise<StoredGroup | undefined>;
  /** Grupo e tipo do link pelo token (membro, reserva ou convidado). */
  getByToken(token: string): Promise<{ group: StoredGroup; kind: InviteKind } | undefined>;
  /** Os itens do grupo, os lookups dos tokens e do esporte e a participação do dono (cargo `owner`), numa transação. */
  create(group: StoredGroup, ownerId: UserId): Promise<void>;
  /** Papel no grupo (leitura consistente); `undefined` = não participa. */
  roleOf(groupId: string, userId: UserId): Promise<MemberTier | undefined>;
  /** GRP-02, 39: entra com o papel e o cargo Membro, com o limite conferido na gravação; reserva → membro apaga o convite. */
  addMember(group: StoredGroup, userId: UserId, tier: MemberTier): Promise<AddMemberResult>;
  /** Contagem atual (GRP-39), do item COUNTERS. */
  counts(groupId: string): Promise<{ memberCount: number; reserveCount: number }>;
  /** Participação com o convite pendente (leitura consistente). */
  getMembership(groupId: string, userId: UserId): Promise<Membership | undefined>;
  /** GRP-51: grava o cargo (tirar o Admin grava `member`). `not_member` = a participação sumiu. */
  setStaffRole(groupId: string, userId: UserId, roleId: RoleId): Promise<'set' | 'not_member'>;
  /**
   * GRP-54, numa transação: `from` deixa de ser o dono e vira Admin (condição: ainda é `owner`, e o grupo está ativo;
   * senão `stale`); `to` precisa ser membro (senão `not_member`) e recebe o `owner`. Nunca há dois donos.
   */
  transfer(input: {
    group: StoredGroup;
    from: UserId;
    to: UserId;
  }): Promise<'transferred' | 'not_member' | 'stale'>;
  /** GRP-40: grava o convite; `not_reserve` = não é (mais) reserva. */
  setMemberInvite(groupId: string, userId: UserId, expiresAt: string): Promise<'set' | 'not_reserve'>;
  /** GRP-40/41: apaga o convite (cancelar/recusar). Sem convite, não faz nada. */
  clearMemberInvite(groupId: string, userId: UserId): Promise<void>;
  /** GRP-41: promove pelo convite, com a condição do prazo (`> now`) e do limite na mesma transação. */
  acceptMemberInvite(group: StoredGroup, userId: UserId, now: string): Promise<AcceptInviteResult>;
  /** Participantes na ordem da chave (`userId`); quem ordena para a tela é o service. */
  listMembers(groupId: string): Promise<GroupMember[]>;
  /** Grupos do usuário com o papel e o cargo dele em cada um: 1 Query + BatchGet. */
  groupsOf(userId: UserId): Promise<{ group: StoredGroup; tier: MemberTier; roleId: RoleId }[]>;
  /** Troca o token daquele tipo; o antigo deixa de valer na mesma transação. Sem token antigo → só cria (D6). */
  rotateToken(group: StoredGroup, kind: InviteKind, newToken: string): Promise<void>;
  /**
   * GRP-31: grava `archivedAt`, apaga o `INVITES` e os lookups dos tokens, numa transação.
   * `stale` = um token mudou ou o grupo já foi arquivado depois da leitura.
   */
  archive(group: StoredGroup, archivedAt: string): Promise<'archived' | 'stale'>;
  /** GRP-33: tira `archivedAt` e grava o `INVITES` com 3 tokens novos e os lookups. `not_archived` = outra requisição desarquivou. */
  unarchive(group: StoredGroup, tokens: GroupTokens): Promise<'unarchived' | 'not_archived'>;
  /**
   * Muda o `SETTINGS` e devolve o grupo inteiro, relido. Só grava com a `settingsVersion` esperada (GRP-59);
   * senão, `VERSION_CONFLICT` com a atual.
   */
  update(groupId: string, patch: GroupPatch, expectedSettingsVersion: number): Promise<StoredGroup>;
  /**
   * Tira a participação (com o convite pendente), baixa a contagem do papel, troca o link daquele papel e (se vier)
   * apaga a presença. Sem `newToken` é a saída (GRP-42): o link não muda.
   */
  removeMember(input: {
    group: StoredGroup;
    userId: UserId;
    tier: MemberTier;
    newToken?: string;
    attendance?: AttendanceRecord;
  }): Promise<RemoveMemberResult>;
}

const TOKEN_LOOKUP = {
  member: groupInviteLookupKey,
  reserve: groupReserveInviteLookupKey,
  guest: groupGuestLookupKey,
} satisfies Record<InviteKind, (token: string) => { PK: string; SK: string }>;

const KINDS = ['member', 'reserve', 'guest'] as const;

/** O grupo segue ativo (GRP-32), conferido dentro da gravação. */
function activeCheck(groupId: string): TransactItem {
  return {
    ConditionCheck: {
      TableName: tableName(),
      Key: groupKey(groupId),
      ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(archivedAt)',
    },
  };
}

/** Entrar no grupo: a participação (com o cargo) e o lookup de "meus grupos", os dois novos. */
function membershipPuts(
  groupId: string,
  userId: UserId,
  tier: MemberTier,
  roleId: RoleId,
  createdAt: string,
): TransactItem[] {
  const record: MembershipRecord = { groupId, userId, tier, roleId, createdAt };
  return [
    {
      Put: {
        TableName: tableName(),
        Item: dbItem(membershipKey(groupId, userId), MEMBERSHIP_ENTITY, record, createdAt),
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
    {
      Put: {
        TableName: tableName(),
        Item: dbItem(userGroupLookupKey(userId, groupId), LOOKUP_ENTITY, { id: groupId }, createdAt),
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
  ];
}

function tokenLookupPut(kind: InviteKind, token: string, groupId: string, createdAt?: string): TransactItem {
  return {
    Put: {
      TableName: tableName(),
      Item: dbItem(TOKEN_LOOKUP[kind](token), LOOKUP_ENTITY, { id: groupId }, createdAt),
      ConditionExpression: 'attribute_not_exists(PK)',
    },
  };
}

/**
 * Delete do lookup antigo (se houver) + Put do novo + Update do `INVITES`, com a condição de que ninguém trocou antes,
 * e o grupo ativo (o arquivado não ganha link novo, nem numa corrida, GRP-31, 32).
 */
function tokenSwap(group: StoredGroup, kind: InviteKind, newToken: string): TransactItem[] {
  const field = TOKEN_FIELD[kind];
  const old = group[field];
  return [
    ...(old ? [{ Delete: { TableName: tableName(), Key: TOKEN_LOOKUP[kind](old) } }] : []),
    tokenLookupPut(kind, newToken, group.id),
    {
      Update: touch({
        TableName: tableName(),
        Key: groupInvitesKey(group.id),
        UpdateExpression: 'SET #token = :new',
        ConditionExpression: old ? '#token = :old' : 'attribute_exists(PK) AND attribute_not_exists(#token)',
        ExpressionAttributeNames: { '#token': field },
        ExpressionAttributeValues: { ':new': newToken, ...(old && { ':old': old }) },
      }),
    },
    activeCheck(group.id),
  ];
}

/** Transação em que nenhuma condição deveria falhar (ids e tokens novos, token conferido): falhou → bug ou corrida, 500. */
async function mustWrite(items: TransactItem[]): Promise<void> {
  const result = await transactWrite(items);
  if (!result.ok) throw new Error(`Transaction condition failed at items ${result.failed.join(',')}`);
}

/** A participação, com leitura consistente: quem acabou de ser removido não pode mais ler o grupo (D12 do 003). */
async function readMembership(groupId: string, userId: UserId): Promise<MembershipRecord | undefined> {
  const { Item } = await dynamo().send(
    new GetCommand({ TableName: tableName(), Key: membershipKey(groupId, userId), ConsistentRead: true }),
  );
  return Item ? stripKeys<MembershipRecord>(Item) : undefined;
}

/** Todos os itens `MEMBER#` e `MEMBER_INVITE#` do grupo (consistente), seguindo as páginas. */
async function queryMemberRows(
  groupId: string,
  startKey?: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const { Items = [], LastEvaluatedKey } = await dynamo().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': groupPk(groupId), ':prefix': MEMBER_SK_PREFIX },
      ConsistentRead: true,
      ...(startKey && { ExclusiveStartKey: startKey }),
    }),
  );
  return LastEvaluatedKey ? [...Items, ...(await queryMemberRows(groupId, LastEvaluatedKey))] : Items;
}

/** Reserva → membro: troca o papel na própria participação (o cargo e a data de entrada ficam, GRP-03, 48). */
function promoteUpdate(groupId: string, userId: UserId): TransactItem {
  return {
    Update: touch({
      TableName: tableName(),
      Key: membershipKey(groupId, userId),
      UpdateExpression: 'SET tier = :member',
      ConditionExpression: 'tier = :reserve',
      ExpressionAttributeValues: { ':member': 'member', ':reserve': 'reserve' },
    }),
  };
}

const LIMIT = {
  member: { field: 'maxMembers', counter: 'memberCount' },
  reserve: { field: 'maxReserves', counter: 'reserveCount' },
} as const satisfies Record<MemberTier, { field: keyof StoredGroup; counter: string }>;

/**
 * Condição do limite dentro da gravação (GRP-39), 3 itens: [0] `ADD` na contagem do papel de destino, com
 * `contagem < limite` (e `-1` no papel de origem, na promoção); [1] `ConditionCheck` no `SETTINGS` de que o limite é
 * o lido; [2] o grupo segue ativo.
 */
function limitItems(group: StoredGroup, tier: MemberTier, from?: MemberTier): TransactItem[] {
  const { field, counter } = LIMIT[tier];
  const created = setCreatedAtIfNew();
  return [
    {
      Update: {
        TableName: tableName(),
        Key: groupCountersKey(group.id),
        UpdateExpression: `SET ${created.expression} ADD #to :one${from ? ', #from :minus' : ''}`,
        ConditionExpression: 'attribute_not_exists(#to) OR #to < :max',
        ExpressionAttributeNames: { '#to': counter, ...(from && { '#from': LIMIT[from].counter }) },
        ExpressionAttributeValues: {
          ':one': 1,
          ':max': group[field],
          ...(from && { ':minus': -1 }),
          ...created.values,
        },
      },
    },
    {
      ConditionCheck: {
        TableName: tableName(),
        Key: groupSettingsKey(group.id),
        ConditionExpression: '#lim = :lim',
        ExpressionAttributeNames: { '#lim': field },
        ExpressionAttributeValues: { ':lim': group[field] },
      },
    },
    activeCheck(group.id),
  ];
}

export const dynamoGroupRepository: GroupRepository = {
  async get(id, opts) {
    return assemble(await batchGetOrdered(groupKeys(id), { consistent: opts?.consistent ?? false }));
  },

  async getByToken(token) {
    const pointers = await Promise.all(
      KINDS.map(async (kind) => {
        const { Item } = await dynamo().send(
          new GetCommand({ TableName: tableName(), Key: TOKEN_LOOKUP[kind](token), ConsistentRead: true }),
        );
        return Item ? { kind, id: Item.id as string } : undefined;
      }),
    );
    const pointer = pointers.find((p) => p !== undefined);
    if (!pointer) return undefined;
    const group = await this.get(pointer.id, { consistent: true });
    return group && { group, kind: pointer.kind };
  },

  async create(group, ownerId) {
    const { meta, settings, invites } = split(group);
    const at = group.createdAt;
    const put = (
      key: { PK: string; SK: string },
      entity: string,
      data: Record<string, unknown>,
    ): TransactItem => ({
      Put: {
        TableName: tableName(),
        Item: dbItem(key, entity, data, at),
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    });
    const tokenPuts = KINDS.flatMap((kind) => {
      const token = group[TOKEN_FIELD[kind]];
      return token ? [tokenLookupPut(kind, token, group.id, at)] : [];
    });
    await mustWrite([
      put(groupKey(group.id), GROUP_ENTITY, meta),
      put(groupSettingsKey(group.id), GROUP_SETTINGS_ENTITY, settings),
      ...(invites ? [put(groupInvitesKey(group.id), GROUP_INVITES_ENTITY, invites)] : []),
      put(groupCountersKey(group.id), COUNTERS_ENTITY, { memberCount: 1, reserveCount: 0 }),
      ...tokenPuts,
      // GRP-01, 48: o criador é membro, com o cargo Dono.
      ...membershipPuts(group.id, ownerId, 'member', 'owner', at),
      // GRP-58: o grupo na lista do esporte (o filtro por esporte, ainda sem rota).
      put(sportGroupLookupKey(group.sportId, group.id), LOOKUP_ENTITY, { id: group.id }),
    ]);
  },

  async roleOf(groupId, userId) {
    return (await readMembership(groupId, userId))?.tier;
  },

  async addMember(group, userId, tier) {
    const current = (await readMembership(group.id, userId))?.tier;
    if (current === 'member' || current === tier) return 'unchanged';
    // Reserva aceitando o link de membro (D5 do 007): troca o papel na própria participação e apaga o convite (GRP-41).
    const promoting = current === 'reserve';
    const at = new Date().toISOString();
    const write: TransactItem[] = promoting
      ? [
          promoteUpdate(group.id, userId),
          { Delete: { TableName: tableName(), Key: memberInviteKey(group.id, userId) } },
        ]
      : membershipPuts(group.id, userId, tier, 'member', at);
    const result = await transactWrite([
      ...write,
      ...limitItems(group, tier, promoting ? 'reserve' : undefined),
    ]);
    if (result.ok) return promoting ? 'promoted' : 'added';
    if (result.failed.includes(write.length)) {
      // A contagem bateu no limite; se o limite ou o grupo mudaram também, relê.
      const changed = result.failed.some((i) => i > write.length);
      if (!changed) return tier === 'member' ? 'members_full' : 'reserves_full';
    }
    // O limite, o arquivamento ou a participação mudaram no meio (outra entrada, promoção ou saída): relê.
    return 'stale';
  },

  async counts(groupId) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: groupCountersKey(groupId), ConsistentRead: true }),
    );
    return { memberCount: Number(Item?.memberCount ?? 0), reserveCount: Number(Item?.reserveCount ?? 0) };
  },

  async getMembership(groupId, userId) {
    const rows = await batchGetOrdered([membershipKey(groupId, userId), memberInviteKey(groupId, userId)], {
      consistent: true,
    });
    const m = rows.find((r) => r.entity === MEMBERSHIP_ENTITY);
    if (!m) return undefined;
    const invite = rows.find((r) => r.entity === MEMBER_INVITE_ENTITY);
    return {
      tier: m.tier as MemberTier,
      roleId: m.roleId as RoleId,
      ...(invite && { memberInviteExpiresAt: invite.expiresAt as string }),
    };
  },

  async setStaffRole(groupId, userId, roleId) {
    try {
      await dynamo().send(
        new UpdateCommand(
          touch({
            TableName: tableName(),
            Key: membershipKey(groupId, userId),
            UpdateExpression: 'SET roleId = :role',
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeValues: { ':role': roleId },
          }),
        ),
      );
      return 'set';
    } catch (err) {
      if (isConditionFailed(err)) return 'not_member';
      throw err;
    }
  },

  async transfer({ group, from, to }) {
    // [0] o dono antigo (ainda `owner`) vira Admin, [1] o grupo ativo, [2] o novo dono (membro) recebe o `owner`.
    const result = await transactWrite([
      {
        Update: touch({
          TableName: tableName(),
          Key: membershipKey(group.id, from),
          UpdateExpression: 'SET roleId = :admin',
          ConditionExpression: 'roleId = :owner',
          ExpressionAttributeValues: { ':admin': 'admin', ':owner': 'owner' },
        }),
      },
      activeCheck(group.id),
      {
        Update: touch({
          TableName: tableName(),
          Key: membershipKey(group.id, to),
          UpdateExpression: 'SET roleId = :owner',
          ConditionExpression: 'tier = :member',
          ExpressionAttributeValues: { ':owner': 'owner', ':member': 'member' },
        }),
      },
    ]);
    if (result.ok) return 'transferred';
    if (result.failed.includes(0) || result.failed.includes(1)) return 'stale';
    return 'not_member';
  },

  async setMemberInvite(groupId, userId, expiresAt) {
    const record: MemberInviteRecord = { groupId, userId, expiresAt };
    // [0] o convite (substitui um vencido), [1] ainda é reserva.
    const result = await transactWrite([
      {
        Put: {
          TableName: tableName(),
          Item: {
            ...dbItem(memberInviteKey(groupId, userId), MEMBER_INVITE_ENTITY, record),
            ttl: ttlFrom(new Date(expiresAt)),
          },
        },
      },
      {
        ConditionCheck: {
          TableName: tableName(),
          Key: membershipKey(groupId, userId),
          ConditionExpression: 'tier = :reserve',
          ExpressionAttributeValues: { ':reserve': 'reserve' },
        },
      },
    ]);
    return result.ok ? 'set' : 'not_reserve';
  },

  async clearMemberInvite(groupId, userId) {
    await transactWrite([{ Delete: { TableName: tableName(), Key: memberInviteKey(groupId, userId) } }]);
  },

  async acceptMemberInvite(group, userId, now) {
    // [0] participação (ainda reserva), [1] convite no prazo (apagado), [2] contagem com o limite, [3] limite lido,
    // [4] grupo ativo.
    const result = await transactWrite([
      promoteUpdate(group.id, userId),
      {
        Delete: {
          TableName: tableName(),
          Key: memberInviteKey(group.id, userId),
          ConditionExpression: 'expiresAt > :now',
          ExpressionAttributeValues: { ':now': now },
        },
      },
      ...limitItems(group, 'member', 'reserve'),
    ]);
    if (result.ok) return 'promoted';
    if (result.failed.includes(0) || result.failed.includes(1)) return 'invalid';
    if (result.failed.includes(3) || result.failed.includes(4)) return 'stale';
    return 'members_full';
  },

  async listMembers(groupId) {
    const rows = await queryMemberRows(groupId);
    const invites = new Map(
      rows
        .filter((r) => r.entity === MEMBER_INVITE_ENTITY)
        .map((r) => [r.userId as string, r.expiresAt as string]),
    );
    return rows
      .filter((r) => r.entity === MEMBERSHIP_ENTITY)
      .map((row) => {
        const { userId, tier, roleId, createdAt } = stripKeys<MembershipRecord>(row);
        const expiresAt = invites.get(userId);
        return {
          userId: asUserId(userId),
          tier,
          roleId,
          createdAt,
          ...(expiresAt !== undefined && { memberInviteExpiresAt: expiresAt }),
        };
      });
  },

  async groupsOf(userId) {
    const rows = await queryLookupRows(userGroupsLookupPk(userId), { consistent: true });
    const items = await batchGetOrdered(
      rows.flatMap((row) => [...groupKeys(row.id), membershipKey(row.id, userId)]),
      { consistent: true },
    );
    return rows.flatMap((row) => {
      const parts = items.filter((item) => item.PK === groupPk(row.id));
      const group = assemble(parts);
      const m = parts.find((p) => p.entity === MEMBERSHIP_ENTITY);
      if (!group || !m) return [];
      return [{ group, tier: m.tier as MemberTier, roleId: m.roleId as RoleId }];
    });
  },

  async rotateToken(group, kind, newToken) {
    await mustWrite(tokenSwap(group, kind, newToken));
  },

  async archive(group, archivedAt) {
    // [0] o `META`, com a condição de que ninguém arquivou antes; [1] o `INVITES`, com os tokens lidos (nenhum mudou);
    // depois, o Delete de cada lookup de token: os links param na mesma transação.
    const present = KINDS.flatMap((kind) => {
      const token = group[TOKEN_FIELD[kind]];
      return token ? [{ kind, token }] : [];
    });
    const result = await transactWrite([
      {
        Update: touch({
          TableName: tableName(),
          Key: groupKey(group.id),
          UpdateExpression: 'SET archivedAt = :at',
          ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(archivedAt)',
          ExpressionAttributeValues: { ':at': archivedAt },
        }),
      },
      ...(present.length > 0
        ? [
            {
              Delete: {
                TableName: tableName(),
                Key: groupInvitesKey(group.id),
                ConditionExpression: KINDS.map((kind) =>
                  group[TOKEN_FIELD[kind]] ? `#${kind} = :${kind}` : `attribute_not_exists(#${kind})`,
                ).join(' AND '),
                ExpressionAttributeNames: Object.fromEntries(
                  KINDS.map((kind) => [`#${kind}`, TOKEN_FIELD[kind]]),
                ),
                ExpressionAttributeValues: Object.fromEntries(
                  present.map(({ kind, token }) => [`:${kind}`, token]),
                ),
              },
            },
          ]
        : []),
      ...present.map(({ kind, token }) => ({
        Delete: { TableName: tableName(), Key: TOKEN_LOOKUP[kind](token) },
      })),
    ]);
    return result.ok ? 'archived' : 'stale';
  },

  async unarchive(group, tokens) {
    const result = await transactWrite([
      {
        Update: touch({
          TableName: tableName(),
          Key: groupKey(group.id),
          UpdateExpression: 'REMOVE archivedAt',
          ConditionExpression: 'attribute_exists(archivedAt)',
        }),
      },
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(groupInvitesKey(group.id), GROUP_INVITES_ENTITY, { groupId: group.id, ...tokens }),
        },
      },
      ...KINDS.map((kind) => tokenLookupPut(kind, tokens[TOKEN_FIELD[kind]], group.id)),
    ]);
    if (result.ok) return 'unarchived';
    // Tokens novos colidindo (índices 2–4) seria bug: 32 bytes aleatórios.
    if (!result.failed.includes(0))
      throw new Error(`Unarchive token lookup collision at ${result.failed.join(',')}`);
    return 'not_archived';
  },

  async update(groupId, patch, expectedSettingsVersion) {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    const set = entries.filter(([, v]) => v !== null);
    const remove = entries.filter(([, v]) => v === null);
    const clauses = [
      ...(set.length > 0 ? [`SET ${set.map(([k]) => `#${k} = :${k}`).join(', ')}`] : []),
      ...(remove.length > 0 ? [`REMOVE ${remove.map(([k]) => `#${k}`).join(', ')}`] : []),
    ];
    const settingsUpdate = withVersion(
      touch({
        TableName: tableName(),
        Key: groupSettingsKey(groupId),
        UpdateExpression: clauses.join(' '),
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: Object.fromEntries(entries.map(([k]) => [`#${k}`, k])),
        ...(set.length > 0 && {
          ExpressionAttributeValues: Object.fromEntries(set.map(([k, v]) => [`:${k}`, v])),
        }),
      }),
      expectedSettingsVersion,
    );
    if (typeof patch.defaultPlaceId === 'string') {
      // GRP-62: [0] os Ajustes na versão, [1] o lugar novo existe e está ativo, na mesma gravação.
      const result = await transactWrite([
        { Update: settingsUpdate },
        {
          ConditionCheck: {
            TableName: tableName(),
            Key: placeKey(groupId, patch.defaultPlaceId),
            ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(archivedAt)',
          },
        },
      ]);
      if (!result.ok) {
        if (result.failed.includes(1)) throw appError('PLACE_NOT_FOUND');
        throw await versionConflict(() => currentVersion(groupSettingsKey(groupId)));
      }
    } else {
      await sendVersioned(groupSettingsKey(groupId), () => dynamo().send(new UpdateCommand(settingsUpdate)));
    }
    const updated = await this.get(groupId, { consistent: true });
    if (!updated) throw new Error('Group vanished after update');
    return updated;
  },

  async removeMember({ group, userId, tier, newToken, attendance }) {
    // O índice 0 é a participação, com o papel lido: assim o link trocado é sempre o do papel atual (D6 do 013).
    const result = await transactWrite([
      {
        Delete: {
          TableName: tableName(),
          Key: membershipKey(group.id, userId),
          ConditionExpression: 'attribute_exists(PK) AND tier = :tier',
          ExpressionAttributeValues: { ':tier': tier },
        },
      },
      { Delete: { TableName: tableName(), Key: memberInviteKey(group.id, userId) } },
      { Delete: { TableName: tableName(), Key: userGroupLookupKey(userId, group.id) } },
      // GRP-39: o lugar no limite do papel volta na hora.
      {
        Update: {
          TableName: tableName(),
          Key: groupCountersKey(group.id),
          UpdateExpression: 'ADD #c :minus',
          ExpressionAttributeNames: { '#c': LIMIT[tier].counter },
          ExpressionAttributeValues: { ':minus': -1 },
        },
      },
      // Sem `newToken` é a saída (GRP-42): o link não muda.
      ...(newToken ? tokenSwap(group, tier, newToken) : []),
      ...(attendance ? attendanceDeletes(attendance) : []),
    ]);
    if (result.ok) return 'removed';
    if (!result.failed.includes(0)) return 'stale';
    // A participação sumiu (outra remoção) ou mudou de papel (promoção no meio).
    return (await readMembership(group.id, userId)) ? 'stale' : 'not_member';
  },
};
