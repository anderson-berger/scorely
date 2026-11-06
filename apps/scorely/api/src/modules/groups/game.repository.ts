import { GetCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Entity } from '@scorely/contracts';
import {
  batchGetOrdered,
  dbItem,
  isTransactionConflict,
  LOOKUP_ENTITY,
  queryLookupRows,
  stripKeys,
} from '../../lib/db';
import { dynamo, tableName } from '../../lib/dynamo';
import {
  ATTENDANCE_ENTITY,
  attendanceKey,
  attendanceOrderLookupKey,
  attendanceOrderLookupPk,
  attendanceUserLookupKey,
  GAME_ENTITY,
  gameDateLookupKey,
  gameKey,
} from './game.table';

/** Jogo materializado (D1): só existe depois da 1ª confirmação ou do cancelamento. */
export type GameRecord = Entity & { groupId: string; date: string; cancelledAt?: string };

/** Presença de um jogador num jogo (D5). */
export type AttendanceRecord = Entity & { gameId: string; userId: string; confirmedAt: string };

export interface ReadOptions {
  consistent?: boolean;
}

export interface GameRepository {
  findByDate(groupId: string, date: string, opts?: ReadOptions): Promise<GameRecord | undefined>;
  /** Jogo + lookup da data numa transação. `false` = outro request criou o jogo dessa data antes. */
  create(game: GameRecord): Promise<boolean>;
  /** Marca como cancelado (a primeira data de cancelamento fica). */
  cancel(gameId: string, cancelledAt: string): Promise<void>;
  /** Lista inteira, na ordem de confirmação (D4). */
  listAttendance(gameId: string, opts?: ReadOptions): Promise<AttendanceRecord[]>;
  getAttendance(gameId: string, userId: string): Promise<AttendanceRecord | undefined>;
  /** Presença + 2 lookups numa transação. `false` = o usuário já tinha presença. */
  addAttendance(a: AttendanceRecord): Promise<boolean>;
  /** Apaga a presença e os 2 lookups numa transação. Já apagada → nada a fazer. */
  removeAttendance(a: AttendanceRecord): Promise<void>;
}

/** Os 3 Deletes da presença, para esta transação ou para a de remover membro (D12). */
export function attendanceDeletes(a: AttendanceRecord) {
  return [
    {
      Delete: {
        TableName: tableName(),
        Key: attendanceKey(a.id),
        ConditionExpression: 'attribute_exists(PK)',
      },
    },
    { Delete: { TableName: tableName(), Key: attendanceOrderLookupKey(a) } },
    { Delete: { TableName: tableName(), Key: attendanceUserLookupKey(a.gameId, a.userId) } },
  ];
}

async function getItem<T>(key: { PK: string; SK: string }, consistent = false): Promise<T | undefined> {
  const { Item } = await dynamo().send(
    new GetCommand({ TableName: tableName(), Key: key, ConsistentRead: consistent }),
  );
  return Item ? stripKeys<T>(Item) : undefined;
}

export const dynamoGameRepository: GameRepository = {
  async findByDate(groupId, date, opts) {
    const pointer = await getItem<{ id: string }>(gameDateLookupKey(groupId, date), opts?.consistent);
    return pointer ? getItem<GameRecord>(gameKey(pointer.id), opts?.consistent) : undefined;
  },

  async create(game) {
    try {
      await dynamo().send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: tableName(),
                Item: dbItem(gameKey(game.id), GAME_ENTITY, game),
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Put: {
                TableName: tableName(),
                Item: dbItem(
                  gameDateLookupKey(game.groupId, game.date),
                  LOOKUP_ENTITY,
                  { id: game.id },
                  game.createdAt,
                ),
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      );
      return true;
    } catch (err) {
      if (isTransactionConflict(err)) return false;
      throw err;
    }
  },

  async cancel(gameId, cancelledAt) {
    await dynamo().send(
      new UpdateCommand({
        TableName: tableName(),
        Key: gameKey(gameId),
        UpdateExpression: 'SET cancelledAt = if_not_exists(cancelledAt, :at)',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeValues: { ':at': cancelledAt },
      }),
    );
  },

  async listAttendance(gameId, opts) {
    const pointers = await queryLookupRows(attendanceOrderLookupPk(gameId), opts);
    const rows = await batchGetOrdered(
      pointers.map((p) => attendanceKey(p.id)),
      opts,
    );
    return rows.map((row) => stripKeys<AttendanceRecord>(row));
  },

  async getAttendance(gameId, userId) {
    const pointer = await getItem<{ id: string }>(attendanceUserLookupKey(gameId, userId), true);
    return pointer ? getItem<AttendanceRecord>(attendanceKey(pointer.id), true) : undefined;
  },

  async addAttendance(a) {
    try {
      await dynamo().send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: tableName(),
                Item: dbItem(attendanceKey(a.id), ATTENDANCE_ENTITY, a),
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Put: {
                TableName: tableName(),
                Item: dbItem(attendanceOrderLookupKey(a), LOOKUP_ENTITY, { id: a.id }, a.createdAt),
              },
            },
            {
              Put: {
                TableName: tableName(),
                Item: dbItem(
                  attendanceUserLookupKey(a.gameId, a.userId),
                  LOOKUP_ENTITY,
                  { id: a.id },
                  a.createdAt,
                ),
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      );
      return true;
    } catch (err) {
      if (isTransactionConflict(err)) return false;
      throw err;
    }
  },

  async removeAttendance(a) {
    try {
      await dynamo().send(new TransactWriteCommand({ TransactItems: attendanceDeletes(a) }));
    } catch (err) {
      // Outra desistência (ou remoção) apagou antes: o resultado é o mesmo.
      if (!isTransactionConflict(err)) throw err;
    }
  },
};
