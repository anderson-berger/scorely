import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { Notification } from '@scorely/contracts';
import {
  batchGetOrdered,
  dbItem,
  isTransactionConflict,
  LOOKUP_ENTITY,
  type Page,
  queryLookupIds,
  setCreatedAtIfNew,
  stripKeys,
} from '../../lib/db';
import { dynamo, tableName } from '../../lib/dynamo';
import {
  INBOX_ENTITY,
  inboxKey,
  NOTIFICATION_ENTITY,
  notificationKey,
  notificationListLookupKey,
  notificationListLookupPk,
} from './notification.table';

export interface NotificationRepository {
  create(notification: Notification): Promise<void>;
  get(id: string): Promise<Notification | undefined>;
  list(userId: string, opts: { limit: number; cursor?: string | undefined }): Promise<Page<Notification>>;
  unreadCount(userId: string): Promise<number>;
  /** Marca como lida e decrementa o contador. `false` se já estava lida (ou não é do usuário). */
  markRead(userId: string, id: string, readAt: string): Promise<boolean>;
}

function inboxDelta(userId: string, delta: 1 | -1) {
  const createdAt = setCreatedAtIfNew();
  return {
    Update: {
      TableName: tableName(),
      Key: inboxKey(userId),
      UpdateExpression: `SET entity = :entity, ${createdAt.expression} ADD unread :delta`,
      ExpressionAttributeValues: { ':entity': INBOX_ENTITY, ':delta': delta, ...createdAt.values },
    },
  };
}

export const dynamoNotificationRepository: NotificationRepository = {
  async create(n) {
    await dynamo().send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tableName(),
              Item: dbItem(notificationKey(n.id), NOTIFICATION_ENTITY, n),
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Put: {
              TableName: tableName(),
              Item: dbItem(notificationListLookupKey(n), LOOKUP_ENTITY, { id: n.id }, n.createdAt),
            },
          },
          inboxDelta(n.userId, 1),
        ],
      }),
    );
  },

  async get(id) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: notificationKey(id) }),
    );
    return Item ? stripKeys<Notification>(Item) : undefined;
  },

  async list(userId, opts) {
    const page = await queryLookupIds(notificationListLookupPk(userId), opts);
    const rows = await batchGetOrdered(page.items.map(notificationKey));
    return { ...page, items: rows.map((row) => stripKeys<Notification>(row)) };
  },

  async unreadCount(userId) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: inboxKey(userId), ProjectionExpression: 'unread' }),
    );
    return Math.max(0, (Item?.unread as number | undefined) ?? 0);
  },

  async markRead(userId, id, readAt) {
    try {
      await dynamo().send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: tableName(),
                Key: notificationKey(id),
                UpdateExpression: 'SET readAt = :readAt',
                ConditionExpression:
                  'attribute_exists(PK) AND userId = :userId AND attribute_not_exists(readAt)',
                ExpressionAttributeValues: { ':readAt': readAt, ':userId': userId },
              },
            },
            inboxDelta(userId, -1),
          ],
        }),
      );
      return true;
    } catch (err) {
      if (isTransactionConflict(err)) return false;
      throw err;
    }
  },
};
