import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { Group } from '@scorely/contracts';
import { dbItem, isTransactionConflict, LOOKUP_ENTITY, queryLookupRows, stripKeys } from '../../lib/db';
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
  }): Promise<void>;
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
    await dynamo().send(
      new TransactWriteCommand({
        TransactItems: [
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
        ],
      }),
    );
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
    try {
      await dynamo().send(
        new TransactWriteCommand({ TransactItems: memberPuts(groupId, userId, new Date().toISOString()) }),
      );
    } catch (err) {
      // Já era membro (aceitou o convite de novo): idempotente.
      if (!isTransactionConflict(err)) throw err;
    }
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
    await dynamo().send(new TransactWriteCommand({ TransactItems: inviteSwap(group, newToken) }));
  },

  async removeMember({ group, userId, newToken, attendance }) {
    await dynamo().send(
      new TransactWriteCommand({
        TransactItems: [
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
        ],
      }),
    );
  },
};
