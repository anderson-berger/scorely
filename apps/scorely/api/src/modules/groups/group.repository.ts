import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GROUP_LIMITS, type Group, type InviteKind, type MemberRole } from '@scorely/contracts';
import {
  batchGetOrdered,
  dbItem,
  isConditionFailed,
  LOOKUP_ENTITY,
  queryLookupRows,
  setCreatedAtIfNew,
  stripKeys,
  type TransactItem,
  transactWrite,
} from '../../lib/db';
import { dynamo, tableName } from '../../lib/dynamo';
import { type AttendanceRecord, attendanceDeletes } from './game.repository';
import {
  GROUP_ENTITY,
  groupCountersKey,
  groupGuestLookupKey,
  groupInviteLookupKey,
  groupKey,
  groupReserveInviteLookupKey,
} from './group.table';
import {
  groupMembershipLookupKey,
  groupMembershipsLookupPk,
  MEMBERSHIP_ENTITY,
  type MembershipRecord,
  membershipKey,
  userGroupLookupKey,
  userGroupsLookupPk,
} from './membership.table';

/**
 * O grupo como fica no banco (o service tira os tokens para quem não é dono). Ativo, tem os 3 tokens;
 * arquivado, tem `archivedAt` e nenhum token (GRP-31). Grupo de antes da E2 não tem `reservesOpenHoursBefore`.
 */
export type StoredGroup = Omit<
  Group,
  'myRole' | 'myMemberInvite' | 'reservesOpenHoursBefore' | 'maxMembers' | 'maxReserves'
> & {
  reservesOpenHoursBefore?: number | undefined;
  /** GRP-38: grupo novo sempre grava os dois; grupo antigo sem eles é lido com o teto (`limitsOf`). */
  maxMembers?: number | undefined;
  maxReserves?: number | undefined;
};

/** Limites efetivos (GRP-38): o gravado, ou o teto do contrato para grupo antigo sem o campo. */
export function limitsOf(group: StoredGroup): { maxMembers: number; maxReserves: number } {
  return {
    maxMembers: group.maxMembers ?? GROUP_LIMITS.maxMembers.max,
    maxReserves: group.maxReserves ?? GROUP_LIMITS.maxReserves.max,
  };
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

/** Mudança das camadas (plano 007, D11). `guestsOpenHoursBefore: null` remove o campo (convidados desligados). */
export interface GroupPatch {
  listOpensHoursBefore?: number | undefined;
  reservesOpenHoursBefore?: number | undefined;
  guestsOpenHoursBefore?: number | null | undefined;
  /** GRP-38 */
  maxMembers?: number | undefined;
  maxReserves?: number | undefined;
}

/** Participante do grupo; `createdAt` é a data de entrada (plano 013, D9: o service ordena por ela). */
export interface GroupMember {
  userId: string;
  role: MemberRole;
  createdAt: string;
  /** Prazo do convite para membro (GRP-40), como gravado: quem confere se venceu é o service. */
  memberInviteExpiresAt?: string;
}

export interface GroupRepository {
  get(id: string, opts?: { consistent?: boolean }): Promise<StoredGroup | undefined>;
  /** Grupo e tipo do link pelo token (membro, reserva ou convidado). */
  getByToken(token: string): Promise<{ group: StoredGroup; kind: InviteKind } | undefined>;
  /** Grupo + lookups dos tokens + participação do dono (membership + 2 lookups), numa transação. */
  create(group: StoredGroup): Promise<void>;
  /** Papel no grupo (leitura consistente); `undefined` = não participa. */
  roleOf(groupId: string, userId: string): Promise<MemberRole | undefined>;
  /** D5 do 007 + GRP-39: entra com o papel, com o limite conferido na gravação; reserva → membro apaga o convite. */
  addMember(group: StoredGroup, userId: string, role: MemberRole): Promise<AddMemberResult>;
  /** Contagem atual (GRP-39), do item COUNTERS. */
  counts(groupId: string): Promise<{ memberCount: number; reserveCount: number }>;
  /** Participação com o convite pendente (leitura consistente). */
  getMembership(
    groupId: string,
    userId: string,
  ): Promise<{ role: MemberRole; memberInviteExpiresAt?: string } | undefined>;
  /** GRP-40: grava o prazo do convite; `not_reserve` = não é (mais) reserva. */
  setMemberInvite(groupId: string, userId: string, expiresAt: string): Promise<'set' | 'not_reserve'>;
  /** GRP-40/41: apaga o convite (cancelar/recusar). Sem participação, não faz nada. */
  clearMemberInvite(groupId: string, userId: string): Promise<void>;
  /** GRP-41: promove pelo convite, com a condição do prazo (`> now`) e do limite na mesma transação. */
  acceptMemberInvite(group: StoredGroup, userId: string, now: string): Promise<AcceptInviteResult>;
  /** Participantes na ordem da chave (`userId`); quem ordena para a tela é o service. */
  listMembers(groupId: string): Promise<GroupMember[]>;
  /** Grupos do usuário com o papel dele em cada um (plano 013, D7): 1 Query + BatchGet. */
  groupsOf(userId: string): Promise<{ group: StoredGroup; role: MemberRole }[]>;
  /** Troca o token daquele tipo; o antigo deixa de valer na mesma transação. Sem token antigo → só cria (D6). */
  rotateToken(group: StoredGroup, kind: InviteKind, newToken: string): Promise<void>;
  /**
   * GRP-31: grava `archivedAt`, tira os 3 tokens e apaga os lookups deles, numa transação.
   * `stale` = um token mudou ou o grupo já foi arquivado depois da leitura.
   */
  archive(group: StoredGroup, archivedAt: string): Promise<'archived' | 'stale'>;
  /** GRP-33: tira `archivedAt` e grava 3 tokens novos com os lookups. `not_archived` = outra requisição desarquivou. */
  unarchive(group: StoredGroup, tokens: GroupTokens): Promise<'unarchived' | 'not_archived'>;
  update(groupId: string, patch: GroupPatch): Promise<StoredGroup>;
  /**
   * D12 do 003 / D10 do 007 / D6 do 013: tira a participação (com o convite pendente), baixa a contagem do papel,
   * troca o link daquele papel e (se vier) apaga a presença. Sem `newToken` é a saída (GRP-42): o link não muda.
   */
  removeMember(input: {
    group: StoredGroup;
    userId: string;
    role: MemberRole;
    newToken?: string;
    attendance?: AttendanceRecord;
  }): Promise<RemoveMemberResult>;
}

const TOKEN_FIELD = {
  member: 'inviteToken',
  reserve: 'reserveInviteToken',
  guest: 'guestToken',
} as const satisfies Record<InviteKind, keyof StoredGroup>;

const TOKEN_LOOKUP = {
  member: groupInviteLookupKey,
  reserve: groupReserveInviteLookupKey,
  guest: groupGuestLookupKey,
} satisfies Record<InviteKind, (token: string) => { PK: string; SK: string }>;

const KINDS = ['member', 'reserve', 'guest'] as const;

/** Entrar no grupo (plano 013, D5): a membership e os 2 lookups, todos novos. */
function membershipPuts(
  groupId: string,
  userId: string,
  role: MemberRole,
  createdAt: string,
): TransactItem[] {
  const record: MembershipRecord = { groupId, userId, role, createdAt };
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
        Item: dbItem(groupMembershipLookupKey(groupId, userId), LOOKUP_ENTITY, { id: userId }, createdAt),
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

/** Delete do lookup antigo (se houver) + Put do novo + Update do grupo, com a condição de que ninguém trocou antes. */
function tokenSwap(group: StoredGroup, kind: InviteKind, newToken: string): TransactItem[] {
  const field = TOKEN_FIELD[kind];
  const old = group[field];
  return [
    ...(old ? [{ Delete: { TableName: tableName(), Key: TOKEN_LOOKUP[kind](old) } }] : []),
    {
      Put: {
        TableName: tableName(),
        Item: dbItem(TOKEN_LOOKUP[kind](newToken), LOOKUP_ENTITY, { id: group.id }),
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
    {
      Update: {
        TableName: tableName(),
        Key: groupKey(group.id),
        UpdateExpression: 'SET #token = :new',
        // O grupo arquivado não ganha link novo, nem numa corrida (GRP-31, GRP-32).
        ConditionExpression: `${old ? '#token = :old' : 'attribute_not_exists(#token)'} AND attribute_not_exists(archivedAt)`,
        ExpressionAttributeNames: { '#token': field },
        ExpressionAttributeValues: { ':new': newToken, ...(old && { ':old': old }) },
      },
    },
  ];
}

/** Transação em que nenhuma condição deveria falhar (ids e tokens novos, token conferido): falhou → bug ou corrida, 500. */
async function mustWrite(items: TransactItem[]): Promise<void> {
  const result = await transactWrite(items);
  if (!result.ok) throw new Error(`Transaction condition failed at items ${result.failed.join(',')}`);
}

/** A participação, com leitura consistente: quem acabou de ser removido não pode mais ler o grupo (D12 do 003). */
async function readMembership(groupId: string, userId: string): Promise<MembershipRecord | undefined> {
  const { Item } = await dynamo().send(
    new GetCommand({ TableName: tableName(), Key: membershipKey(groupId, userId), ConsistentRead: true }),
  );
  return Item ? stripKeys<MembershipRecord>(Item) : undefined;
}

/**
 * Reserva → membro (plano 013, D5; GRP-41): troca o papel na própria membership (os lookups ficam), grava
 * `roleChangedAt` e apaga o convite pendente. Pelo convite, a condição também exige o prazo no futuro.
 */
function promoteUpdate(groupId: string, userId: string, at: string, byInvite: boolean): TransactItem {
  return {
    Update: {
      TableName: tableName(),
      Key: membershipKey(groupId, userId),
      UpdateExpression: 'SET #role = :member, roleChangedAt = :now REMOVE memberInviteExpiresAt',
      ConditionExpression: byInvite
        ? '#role = :reserve AND memberInviteExpiresAt > :now'
        : '#role = :reserve',
      ExpressionAttributeNames: { '#role': 'role' },
      ExpressionAttributeValues: { ':member': 'member', ':reserve': 'reserve', ':now': at },
    },
  };
}

const LIMIT = {
  member: { field: 'maxMembers', counter: 'memberCount' },
  reserve: { field: 'maxReserves', counter: 'reserveCount' },
} as const satisfies Record<MemberRole, { field: keyof StoredGroup; counter: string }>;

/**
 * Condição do limite dentro da gravação (GRP-39), 2 itens: [0] `ADD` na contagem do papel de destino, com
 * `contagem < limite` (e `-1` no papel de origem, na promoção); [1] `ConditionCheck` no `META` de que o limite é
 * o lido e o grupo segue ativo. Grupo antigo sem limite usa o teto (`limitsOf`) e confere que o campo segue ausente.
 */
function limitItems(group: StoredGroup, role: MemberRole, from?: MemberRole): TransactItem[] {
  const { field, counter } = LIMIT[role];
  const stored = group[field];
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
          ':max': limitsOf(group)[field],
          ...(from && { ':minus': -1 }),
          ...created.values,
        },
      },
    },
    {
      ConditionCheck: {
        TableName: tableName(),
        Key: groupKey(group.id),
        ConditionExpression: `${stored === undefined ? 'attribute_not_exists(#lim)' : '#lim = :lim'} AND attribute_not_exists(archivedAt)`,
        ExpressionAttributeNames: { '#lim': field },
        ...(stored !== undefined && { ExpressionAttributeValues: { ':lim': stored } }),
      },
    },
  ];
}

export const dynamoGroupRepository: GroupRepository = {
  async get(id, opts) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: groupKey(id), ConsistentRead: opts?.consistent }),
    );
    return Item ? stripKeys<StoredGroup>(Item) : undefined;
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

  async create(group) {
    const tokenPuts = KINDS.flatMap((kind) => {
      const token = group[TOKEN_FIELD[kind]];
      return token
        ? [
            {
              Put: {
                TableName: tableName(),
                Item: dbItem(TOKEN_LOOKUP[kind](token), LOOKUP_ENTITY, { id: group.id }, group.createdAt),
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ]
        : [];
    });
    await mustWrite([
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(groupKey(group.id), GROUP_ENTITY, group),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      ...tokenPuts,
      ...membershipPuts(group.id, group.ownerId, 'member', group.createdAt),
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(
            groupCountersKey(group.id),
            'Counters',
            { memberCount: 1, reserveCount: 0 },
            group.createdAt,
          ),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ]);
  },

  async roleOf(groupId, userId) {
    return (await readMembership(groupId, userId))?.role;
  },

  async addMember(group, userId, role) {
    const current = (await readMembership(group.id, userId))?.role;
    if (current === 'member' || current === role) return 'unchanged';
    // Reserva aceitando o link de membro (D5 do 007): troca o papel na própria membership e apaga o convite (GRP-41).
    const promoting = current === 'reserve';
    const at = new Date().toISOString();
    const write = promoting
      ? [promoteUpdate(group.id, userId, at, false)]
      : membershipPuts(group.id, userId, role, at);
    const result = await transactWrite([
      ...write,
      ...limitItems(group, role, promoting ? 'reserve' : undefined),
    ]);
    if (result.ok) return promoting ? 'promoted' : 'added';
    if (result.failed.includes(write.length + 1)) return 'stale';
    if (result.failed.includes(write.length)) return role === 'member' ? 'members_full' : 'reserves_full';
    // A membership mudou no meio (a mesma entrada feita por outra requisição, promoção ou saída): relê.
    return 'stale';
  },

  async counts(groupId) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: groupCountersKey(groupId), ConsistentRead: true }),
    );
    return { memberCount: Number(Item?.memberCount ?? 0), reserveCount: Number(Item?.reserveCount ?? 0) };
  },

  async getMembership(groupId, userId) {
    const m = await readMembership(groupId, userId);
    if (!m) return undefined;
    return m.memberInviteExpiresAt === undefined
      ? { role: m.role }
      : { role: m.role, memberInviteExpiresAt: m.memberInviteExpiresAt };
  },

  async setMemberInvite(groupId, userId, expiresAt) {
    try {
      await dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          Key: membershipKey(groupId, userId),
          UpdateExpression: 'SET memberInviteExpiresAt = :at',
          ConditionExpression: '#role = :reserve',
          ExpressionAttributeNames: { '#role': 'role' },
          ExpressionAttributeValues: { ':at': expiresAt, ':reserve': 'reserve' },
        }),
      );
      return 'set';
    } catch (err) {
      if (isConditionFailed(err)) return 'not_reserve';
      throw err;
    }
  },

  async clearMemberInvite(groupId, userId) {
    try {
      await dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          Key: membershipKey(groupId, userId),
          UpdateExpression: 'REMOVE memberInviteExpiresAt',
          ConditionExpression: 'attribute_exists(PK)',
        }),
      );
    } catch (err) {
      if (!isConditionFailed(err)) throw err;
    }
  },

  async acceptMemberInvite(group, userId, now) {
    // [0] membership (papel + prazo), [1] contagem com o limite, [2] limite lido e grupo ativo.
    const result = await transactWrite([
      promoteUpdate(group.id, userId, now, true),
      ...limitItems(group, 'member', 'reserve'),
    ]);
    if (result.ok) return 'promoted';
    if (result.failed.includes(0)) return 'invalid';
    if (result.failed.includes(2)) return 'stale';
    return 'members_full';
  },

  async listMembers(groupId) {
    const rows = await queryLookupRows(groupMembershipsLookupPk(groupId), { consistent: true });
    const items = await batchGetOrdered(
      rows.map((row) => membershipKey(groupId, row.id)),
      { consistent: true },
    );
    return items.map((item) => {
      const { userId, role, createdAt, memberInviteExpiresAt } = stripKeys<MembershipRecord>(item);
      return memberInviteExpiresAt === undefined
        ? { userId, role, createdAt }
        : { userId, role, createdAt, memberInviteExpiresAt };
    });
  },

  async groupsOf(userId) {
    const rows = await queryLookupRows(userGroupsLookupPk(userId), { consistent: true });
    const items = await batchGetOrdered(
      rows.flatMap((row) => [groupKey(row.id), membershipKey(row.id, userId)]),
      { consistent: true },
    );
    const groups = new Map(
      items.filter((i) => i.entity === GROUP_ENTITY).map((i) => [i.id as string, stripKeys<StoredGroup>(i)]),
    );
    const roles = new Map(
      items
        .filter((i) => i.entity === MEMBERSHIP_ENTITY)
        .map((i) => [i.groupId as string, i.role as MemberRole]),
    );
    return rows.flatMap((row) => {
      const group = groups.get(row.id);
      const role = roles.get(row.id);
      return group && role ? [{ group, role }] : [];
    });
  },

  async rotateToken(group, kind, newToken) {
    await mustWrite(tokenSwap(group, kind, newToken));
  },

  async archive(group, archivedAt) {
    // Índice 0: o grupo, com a condição de que nenhum token mudou e de que ninguém arquivou antes.
    // Depois, o Delete de cada lookup de token que existir: os links param na mesma transação.
    const present = KINDS.flatMap((kind) => {
      const token = group[TOKEN_FIELD[kind]];
      return token ? [{ kind, token }] : [];
    });
    const tokenConditions = KINDS.map((kind) => {
      const token = group[TOKEN_FIELD[kind]];
      return token ? `#${kind} = :${kind}` : `attribute_not_exists(#${kind})`;
    });
    const result = await transactWrite([
      {
        Update: {
          TableName: tableName(),
          Key: groupKey(group.id),
          UpdateExpression: 'SET archivedAt = :at REMOVE #member, #reserve, #guest',
          ConditionExpression: [
            'attribute_exists(PK)',
            'attribute_not_exists(archivedAt)',
            ...tokenConditions,
          ].join(' AND '),
          ExpressionAttributeNames: Object.fromEntries(KINDS.map((kind) => [`#${kind}`, TOKEN_FIELD[kind]])),
          ExpressionAttributeValues: {
            ':at': archivedAt,
            ...Object.fromEntries(present.map(({ kind, token }) => [`:${kind}`, token])),
          },
        },
      },
      ...present.map(({ kind, token }) => ({
        Delete: { TableName: tableName(), Key: TOKEN_LOOKUP[kind](token) },
      })),
    ]);
    return result.ok ? 'archived' : 'stale';
  },

  async unarchive(group, tokens) {
    const result = await transactWrite([
      {
        Update: {
          TableName: tableName(),
          Key: groupKey(group.id),
          UpdateExpression:
            'SET inviteToken = :member, reserveInviteToken = :reserve, guestToken = :guest REMOVE archivedAt',
          ConditionExpression: 'attribute_exists(archivedAt)',
          ExpressionAttributeValues: {
            ':member': tokens.inviteToken,
            ':reserve': tokens.reserveInviteToken,
            ':guest': tokens.guestToken,
          },
        },
      },
      ...KINDS.map((kind) => ({
        Put: {
          TableName: tableName(),
          Item: dbItem(TOKEN_LOOKUP[kind](tokens[TOKEN_FIELD[kind]]), LOOKUP_ENTITY, { id: group.id }),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      })),
    ]);
    if (result.ok) return 'unarchived';
    // Tokens novos colidindo (índices 1–3) seria bug: 32 bytes aleatórios.
    if (!result.failed.includes(0))
      throw new Error(`Unarchive token lookup collision at ${result.failed.join(',')}`);
    return 'not_archived';
  },

  async update(groupId, patch) {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    const set = entries.filter(([, v]) => v !== null);
    const remove = entries.filter(([, v]) => v === null);
    const clauses = [
      ...(set.length > 0 ? [`SET ${set.map(([k]) => `#${k} = :${k}`).join(', ')}`] : []),
      ...(remove.length > 0 ? [`REMOVE ${remove.map(([k]) => `#${k}`).join(', ')}`] : []),
    ];
    const { Attributes } = await dynamo().send(
      new UpdateCommand({
        TableName: tableName(),
        Key: groupKey(groupId),
        UpdateExpression: clauses.join(' '),
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: Object.fromEntries(entries.map(([k]) => [`#${k}`, k])),
        ...(set.length > 0 && {
          ExpressionAttributeValues: Object.fromEntries(set.map(([k, v]) => [`:${k}`, v])),
        }),
        ReturnValues: 'ALL_NEW',
      }),
    );
    return stripKeys<StoredGroup>(Attributes ?? {});
  },

  async removeMember({ group, userId, role, newToken, attendance }) {
    // O índice 0 é a membership, com o papel lido: assim o link trocado é sempre o do papel atual (D6 do 013).
    const result = await transactWrite([
      {
        Delete: {
          TableName: tableName(),
          Key: membershipKey(group.id, userId),
          ConditionExpression: 'attribute_exists(PK) AND #role = :role',
          ExpressionAttributeNames: { '#role': 'role' },
          ExpressionAttributeValues: { ':role': role },
        },
      },
      { Delete: { TableName: tableName(), Key: groupMembershipLookupKey(group.id, userId) } },
      { Delete: { TableName: tableName(), Key: userGroupLookupKey(userId, group.id) } },
      // GRP-39: o lugar no limite do papel volta na hora.
      {
        Update: {
          TableName: tableName(),
          Key: groupCountersKey(group.id),
          UpdateExpression: 'ADD #c :minus',
          ExpressionAttributeNames: { '#c': LIMIT[role].counter },
          ExpressionAttributeValues: { ':minus': -1 },
        },
      },
      // Sem `newToken` é a saída (GRP-42): o link não muda.
      ...(newToken ? tokenSwap(group, role, newToken) : []),
      ...(attendance ? attendanceDeletes(attendance) : []),
    ]);
    if (result.ok) return 'removed';
    if (!result.failed.includes(0)) return 'stale';
    // A membership sumiu (outra remoção) ou mudou de papel (promoção no meio).
    return (await readMembership(group.id, userId)) ? 'stale' : 'not_member';
  },
};
