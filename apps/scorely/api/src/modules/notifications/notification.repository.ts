import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  batchGetOrdered,
  dbItem,
  LOOKUP_ENTITY,
  type Page,
  queryLookupIds,
  setCreatedAtIfNew,
  stripKeys,
  transactWrite,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import type { UserId } from '@scorely/api/src/lib/ids';
import {
  INBOX_ENTITY,
  inboxKey,
  NOTIFICATION_ENTITY,
  notificationKey,
  notificationListLookupKey,
  notificationListLookupPk,
  type StoredNotification,
} from '@scorely/api/src/modules/notifications/notification.table';

export interface NotificationRepository {
  create(notification: StoredNotification): Promise<void>;
  get(id: string): Promise<StoredNotification | undefined>;
  list(
    userId: UserId,
    opts: { limit: number; cursor?: string | undefined },
  ): Promise<Page<StoredNotification>>;
  unreadCount(userId: UserId): Promise<number>;
  /** Marca como lida e decrementa o contador. `false` se já estava lida (ou não é do usuário). */
  markRead(userId: UserId, id: string, readAt: string): Promise<boolean>;
  /**
   * Apaga a notificação, o lookup da lista e (se não estava lida) decrementa o contador, numa transação.
   * `false` se ela mudou desde a leitura (sumiu ou foi marcada como lida): o service relê.
   */
  remove(n: StoredNotification): Promise<boolean>;
}

function inboxDelta(userId: UserId, delta: 1 | -1) {
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
    const result = await transactWrite([
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
    ]);
    // Id novo: a condição só falha por bug.
    if (!result.ok) throw new Error('Notification already exists');
  },

  async get(id) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: notificationKey(id) }),
    );
    return Item ? stripKeys<StoredNotification>(Item) : undefined;
  },

  async list(userId, opts) {
    const page = await queryLookupIds(notificationListLookupPk(userId), opts);
    const rows = await batchGetOrdered(page.items.map(notificationKey));
    return { ...page, items: rows.map((row) => stripKeys<StoredNotification>(row)) };
  },

  async unreadCount(userId) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: inboxKey(userId), ProjectionExpression: 'unread' }),
    );
    return Math.max(0, (Item?.unread as number | undefined) ?? 0);
  },

  async markRead(userId, id, readAt) {
    const result = await transactWrite([
      {
        Update: {
          TableName: tableName(),
          Key: notificationKey(id),
          UpdateExpression: 'SET readAt = :readAt',
          ConditionExpression: 'attribute_exists(PK) AND userId = :userId AND attribute_not_exists(readAt)',
          ExpressionAttributeValues: { ':readAt': readAt, ':userId': userId },
        },
      },
      inboxDelta(userId, -1),
    ]);
    return result.ok;
  },

  async remove(n) {
    // A condição fixa o estado lido como o service viu: o contador nunca cai duas vezes.
    const readCondition = n.readAt ? 'attribute_exists(readAt)' : 'attribute_not_exists(readAt)';
    const result = await transactWrite([
      {
        Delete: {
          TableName: tableName(),
          Key: notificationKey(n.id),
          ConditionExpression: `attribute_exists(PK) AND userId = :userId AND ${readCondition}`,
          ExpressionAttributeValues: { ':userId': n.userId },
        },
      },
      { Delete: { TableName: tableName(), Key: notificationListLookupKey(n) } },
      ...(n.readAt ? [] : [inboxDelta(n.userId, -1)]),
    ]);
    return result.ok;
  },
};
