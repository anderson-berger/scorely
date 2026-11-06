import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Group, InviteKind, MemberRole } from '@scorely/contracts';
import {
  dbItem,
  LOOKUP_ENTITY,
  queryLookupRows,
  stripKeys,
  type TransactItem,
  transactWrite,
} from '../../lib/db';
import { dynamo, tableName } from '../../lib/dynamo';
import { type AttendanceRecord, attendanceDeletes } from './game.repository';
import {
  GROUP_ENTITY,
  groupGuestLookupKey,
  groupInviteLookupKey,
  groupKey,
  groupMemberLookupKey,
  groupMembersLookupPk,
  groupReserveInviteLookupKey,
  groupReserveLookupKey,
  groupReservesLookupPk,
  userGroupLookupKey,
  userGroupsLookupPk,
} from './group.table';

/**
 * O grupo como fica no banco: sempre com o `inviteToken` (o service tira os tokens para quem não é dono).
 * Grupo de antes da E2 não tem `reservesOpenHoursBefore` nem os 2 tokens novos (plano 007, D3/D6).
 */
export type StoredGroup = Omit<Group, 'myRole' | 'reservesOpenHoursBefore'> & {
  inviteToken: string;
  reservesOpenHoursBefore?: number | undefined;
};

/**
 * Resultado da remoção (plano 006, D4): `not_member` = outra requisição já tirou o membro;
 * `stale` = o convite ou a presença mudaram depois da leitura (releia e tente de novo).
 */
export type RemoveMemberResult = 'removed' | 'not_member' | 'stale';

/** Mudança das camadas (plano 007, D11). `guestsOpenHoursBefore: null` remove o campo (convidados desligados). */
export interface GroupPatch {
  listOpensHoursBefore?: number | undefined;
  reservesOpenHoursBefore?: number | undefined;
  guestsOpenHoursBefore?: number | null | undefined;
}

export interface GroupRepository {
  get(id: string, opts?: { consistent?: boolean }): Promise<StoredGroup | undefined>;
  /** Grupo e tipo do link pelo token (membro, reserva ou convidado). */
  getByToken(token: string): Promise<{ group: StoredGroup; kind: InviteKind } | undefined>;
  /** Grupo + lookups dos tokens + dono como membro (2 lookups), numa transação. */
  create(group: StoredGroup): Promise<void>;
  /** Papel no grupo (leitura consistente); `undefined` = não participa. */
  roleOf(groupId: string, userId: string): Promise<MemberRole | undefined>;
  /** D5: entra com o papel; reserva entrando como membro troca de papel; membro continua membro. */
  addMember(groupId: string, userId: string, role: MemberRole): Promise<void>;
  /** Membros e depois reservas. */
  listMembers(groupId: string): Promise<{ userId: string; role: MemberRole }[]>;
  listGroupsOf(userId: string): Promise<string[]>;
  /** Troca o token daquele tipo; o antigo deixa de valer na mesma transação. Sem token antigo → só cria (D6). */
  rotateToken(group: StoredGroup, kind: InviteKind, newToken: string): Promise<void>;
  update(groupId: string, patch: GroupPatch): Promise<StoredGroup>;
  /** D12 do 003 / D10 do 007: tira o papel, troca o link daquele papel e (se vier) apaga a presença, numa transação. */
  removeMember(input: {
    group: StoredGroup;
    userId: string;
    role: MemberRole;
    newToken: string;
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

function roleLookupKey(groupId: string, userId: string, role: MemberRole) {
  return role === 'member' ? groupMemberLookupKey(groupId, userId) : groupReserveLookupKey(groupId, userId);
}

function memberPuts(groupId: string, userId: string, role: MemberRole, createdAt: string): TransactItem[] {
  return [
    {
      Put: {
        TableName: tableName(),
        Item: dbItem(roleLookupKey(groupId, userId, role), LOOKUP_ENTITY, { id: userId }, createdAt),
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
        ConditionExpression: old ? '#token = :old' : 'attribute_not_exists(#token)',
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

async function exists(key: { PK: string; SK: string }): Promise<boolean> {
  const { Item } = await dynamo().send(
    new GetCommand({ TableName: tableName(), Key: key, ConsistentRead: true, ProjectionExpression: 'PK' }),
  );
  return Item !== undefined;
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
      ...memberPuts(group.id, group.ownerId, 'member', group.createdAt),
    ]);
  },

  async roleOf(groupId, userId) {
    // Consistente: quem acabou de ser removido não pode mais ler o grupo (D12 do 003).
    const [member, reserve] = await Promise.all([
      exists(groupMemberLookupKey(groupId, userId)),
      exists(groupReserveLookupKey(groupId, userId)),
    ]);
    if (member) return 'member';
    return reserve ? 'reserve' : undefined;
  },

  async addMember(groupId, userId, role) {
    const current = await this.roleOf(groupId, userId);
    if (current === 'member' || current === role) return;
    const now = new Date().toISOString();
    // Condição falhou = outra requisição fez a mesma entrada antes: idempotente.
    if (!current) {
      await transactWrite(memberPuts(groupId, userId, role, now));
      return;
    }
    // Reserva aceitando o link de membro (D5): troca o lookup do papel; o de "meus grupos" fica.
    await transactWrite([
      {
        Delete: {
          TableName: tableName(),
          Key: groupReserveLookupKey(groupId, userId),
          ConditionExpression: 'attribute_exists(PK)',
        },
      },
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(groupMemberLookupKey(groupId, userId), LOOKUP_ENTITY, { id: userId }, now),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ]);
  },

  async listMembers(groupId) {
    const [members, reserves] = await Promise.all([
      queryLookupRows(groupMembersLookupPk(groupId), { consistent: true }),
      queryLookupRows(groupReservesLookupPk(groupId), { consistent: true }),
    ]);
    return [
      ...members.map((row) => ({ userId: row.id, role: 'member' as const })),
      ...reserves.map((row) => ({ userId: row.id, role: 'reserve' as const })),
    ];
  },

  async listGroupsOf(userId) {
    const rows = await queryLookupRows(userGroupsLookupPk(userId), { consistent: true });
    return rows.map((row) => row.id);
  },

  async rotateToken(group, kind, newToken) {
    await mustWrite(tokenSwap(group, kind, newToken));
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
    // O índice 0 é o lookup do papel: a condição dele falhar = já não participa.
    const result = await transactWrite([
      {
        Delete: {
          TableName: tableName(),
          Key: roleLookupKey(group.id, userId, role),
          ConditionExpression: 'attribute_exists(PK)',
        },
      },
      { Delete: { TableName: tableName(), Key: userGroupLookupKey(userId, group.id) } },
      ...tokenSwap(group, role, newToken),
      ...(attendance ? attendanceDeletes(attendance) : []),
    ]);
    if (result.ok) return 'removed';
    return result.failed.includes(0) ? 'not_member' : 'stale';
  },
};
