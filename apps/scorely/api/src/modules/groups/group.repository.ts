import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { Group } from '@scorely/contracts';
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
  groupInviteLookupKey,
  groupKey,
  groupMemberLookupKey,
  groupMembersLookupPk,
  userGroupLookupKey,
  userGroupsLookupPk,
} from './group.table';

/** O grupo como fica no banco: sempre com o `inviteToken` (o service tira para quem não é dono). */
export type StoredGroup = Group & { inviteToken: string };

/**
 * Resultado da remoção (plano 006, D4): `not_member` = outra requisição já tirou o membro;
 * `stale` = o convite ou a presença mudaram depois da leitura (releia e tente de novo).
 */
export type RemoveMemberResult = 'removed' | 'not_member' | 'stale';

export interface GroupRepository {
  get(id: string, opts?: { consistent?: boolean }): Promise<StoredGroup | undefined>;
  getByInvite(token: string): Promise<StoredGroup | undefined>;
  /** Grupo + lookup do convite + dono como membro (2 lookups), numa transação. */
  create(group: StoredGroup): Promise<void>;
  isMember(groupId: string, userId: string): Promise<boolean>;
  /** Idempotente: já membro → nada muda. */
  addMember(groupId: string, userId: string): Promise<void>;
  listMembers(groupId: string): Promise<string[]>;
  listGroupsOf(userId: string): Promise<string[]>;
  /** Troca o convite (D9): o antigo deixa de valer na mesma transação. */
  rotateInvite(group: StoredGroup, newToken: string): Promise<void>;
  /** D12: tira o membro, troca o convite e (se vier) apaga a presença dele, numa transação. */
  removeMember(input: {
    group: StoredGroup;
    userId: string;
    newToken: string;
    attendance?: AttendanceRecord;
  }): Promise<RemoveMemberResult>;
}

function memberPuts(groupId: string, userId: string, createdAt: string) {
  return [
    {
      Put: {
        TableName: tableName(),
        Item: dbItem(groupMemberLookupKey(groupId, userId), LOOKUP_ENTITY, { id: userId }, createdAt),
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

/** Delete do lookup antigo + Put do novo + Update do grupo, com a condição de que ninguém trocou antes. */
function inviteSwap(group: StoredGroup, newToken: string) {
  return [
    { Delete: { TableName: tableName(), Key: groupInviteLookupKey(group.inviteToken) } },
    {
      Put: {
        TableName: tableName(),
        Item: dbItem(groupInviteLookupKey(newToken), LOOKUP_ENTITY, { id: group.id }),
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
    {
      Update: {
        TableName: tableName(),
        Key: groupKey(group.id),
        UpdateExpression: 'SET inviteToken = :new',
        ConditionExpression: 'inviteToken = :old',
        ExpressionAttributeValues: { ':new': newToken, ':old': group.inviteToken },
      },
    },
  ];
}

/** Transação em que nenhuma condição deveria falhar (ids e tokens novos, token conferido): falhou → bug ou corrida, 500. */
async function mustWrite(items: TransactItem[]): Promise<void> {
  const result = await transactWrite(items);
  if (!result.ok) throw new Error(`Transaction condition failed at items ${result.failed.join(',')}`);
}

export const dynamoGroupRepository: GroupRepository = {
  async get(id, opts) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: groupKey(id), ConsistentRead: opts?.consistent }),
    );
    return Item ? stripKeys<StoredGroup>(Item) : undefined;
  },

  async getByInvite(token) {
    const { Item: pointer } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: groupInviteLookupKey(token), ConsistentRead: true }),
    );
    return pointer ? this.get(pointer.id as string, { consistent: true }) : undefined;
  },

  async create(group) {
    await mustWrite([
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(groupKey(group.id), GROUP_ENTITY, group),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(
            groupInviteLookupKey(group.inviteToken),
            LOOKUP_ENTITY,
            { id: group.id },
            group.createdAt,
          ),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      ...memberPuts(group.id, group.ownerId, group.createdAt),
    ]);
  },

  async isMember(groupId, userId) {
    // Consistente: quem acabou de ser removido não pode mais ler o grupo (D12).
    const { Item } = await dynamo().send(
      new GetCommand({
        TableName: tableName(),
        Key: groupMemberLookupKey(groupId, userId),
        ConsistentRead: true,
        ProjectionExpression: 'PK',
      }),
    );
    return Item !== undefined;
  },

  async addMember(groupId, userId) {
    // Condição falhou = já era membro (aceitou o convite de novo): idempotente.
    await transactWrite(memberPuts(groupId, userId, new Date().toISOString()));
  },

  async listMembers(groupId) {
    const rows = await queryLookupRows(groupMembersLookupPk(groupId), { consistent: true });
    return rows.map((row) => row.id);
  },

  async listGroupsOf(userId) {
    const rows = await queryLookupRows(userGroupsLookupPk(userId), { consistent: true });
    return rows.map((row) => row.id);
  },

  async rotateInvite(group, newToken) {
    await mustWrite(inviteSwap(group, newToken));
  },

  async removeMember({ group, userId, newToken, attendance }) {
    // O índice 0 é o lookup do membro: a condição dele falhar = já não é membro.
    const result = await transactWrite([
      {
        Delete: {
          TableName: tableName(),
          Key: groupMemberLookupKey(group.id, userId),
          ConditionExpression: 'attribute_exists(PK)',
        },
      },
      { Delete: { TableName: tableName(), Key: userGroupLookupKey(userId, group.id) } },
      ...inviteSwap(group, newToken),
      ...(attendance ? attendanceDeletes(attendance) : []),
    ]);
    if (result.ok) return 'removed';
    return result.failed.includes(0) ? 'not_member' : 'stale';
  },
};
