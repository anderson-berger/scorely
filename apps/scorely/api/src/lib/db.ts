import { BatchGetCommand, type BatchGetCommandOutput, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { dynamo, tableName } from './dynamo';
import { appError } from './errors';
import { chunk } from './fn';

export interface Key {
  PK: string;
  SK: string;
}

/** `entity` de todo item ponteiro. As chaves de cada lookup ficam no `<mod>.table.ts` do módulo. */
export const LOOKUP_ENTITY = 'Lookup';

/** Remove os atributos de infraestrutura antes de devolver a entidade. */
export function stripKeys<T>(row: Record<string, unknown>): T {
  const { PK: _pk, SK: _sk, entity: _e, ttl: _t, ...rest } = row;
  return rest as T;
}

/**
 * Monta o item que vai para o banco: chaves, `entity` e `createdAt` (ISO em UTC). Todo `Put` passa por aqui.
 * Se `data` já tem `createdAt` (entidade criada com `newEntity`), ele vale; senão usa `createdAt`
 * (passe o da entidade nos lookups da mesma transação, para gravarem o mesmo instante).
 */
export function dbItem(
  keys: Key,
  entity: string,
  data: object,
  createdAt: string = new Date().toISOString(),
): Record<string, unknown> {
  return { createdAt, ...data, ...keys, entity };
}

/** Para item criado por `Update` (upsert, ex.: contador): grava `createdAt` só na primeira escrita. */
export function setCreatedAtIfNew(at: Date = new Date()) {
  return {
    expression: 'createdAt = if_not_exists(createdAt, :createdAt)',
    values: { ':createdAt': at.toISOString() },
  };
}

/** Epoch em segundos para o atributo `ttl`. */
export function ttlFrom(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

const BATCH_GET_LIMIT = 100;
const keyId = (k: Key) => `${k.PK}\0${k.SK}`;

type BatchRow = NonNullable<BatchGetCommandOutput['Responses']>[string][number];

/** Um BatchGet (até 100 chaves); chama de novo com as UnprocessedKeys até não sobrar nenhuma. */
async function batchGetAll(keys: Record<string, unknown>[], consistent = false): Promise<BatchRow[]> {
  if (!keys.length) return [];
  const { Responses, UnprocessedKeys }: BatchGetCommandOutput = await dynamo().send(
    new BatchGetCommand({ RequestItems: { [tableName()]: { Keys: keys, ConsistentRead: consistent } } }),
  );
  const rows = Responses?.[tableName()] ?? [];
  return [...rows, ...(await batchGetAll(UnprocessedKeys?.[tableName()]?.Keys ?? [], consistent))];
}

/**
 * BatchGet em lotes de 100, repetindo UnprocessedKeys, mantendo a ordem das chaves (itens ausentes somem).
 * `consistent`: leitura fortemente consistente (ex.: reler a lista logo depois de uma escrita).
 */
export async function batchGetOrdered(
  keys: Key[],
  opts: { consistent?: boolean } = {},
): Promise<Record<string, unknown>[]> {
  const found = new Map<string, Record<string, unknown>>();
  for (const part of chunk(keys, BATCH_GET_LIMIT)) {
    const rows = await batchGetAll(
      part.map((k) => ({ ...k })),
      opts.consistent,
    );
    for (const row of rows) found.set(keyId(row as Key), row);
  }
  return keys.flatMap((k) => {
    const row = found.get(keyId(k));
    return row ? [row] : [];
  });
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

const CursorSchema = z.object({ PK: z.string(), SK: z.string() });

function decodeCursor(cursor: string, pk: string): Key {
  try {
    const key = CursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    if (key.PK === pk) return key;
  } catch {
    // cai no erro abaixo
  }
  throw appError('INVALID_CURSOR');
}

/**
 * Lê uma página de ponteiros de um lookup de listagem (`PK=<lookup>`, `SK=<ordem>`, `{ id }`).
 * O cursor é opaco para o cliente e só vale para o mesmo lookup.
 */
export async function queryLookupIds(
  pk: string,
  {
    limit,
    cursor,
    newestFirst = true,
  }: { limit: number; cursor?: string | undefined; newestFirst?: boolean },
): Promise<Page<string>> {
  const { Items = [], LastEvaluatedKey } = await dynamo().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': pk },
      ProjectionExpression: 'PK, SK, id',
      ScanIndexForward: !newestFirst,
      Limit: limit,
      ...(cursor && { ExclusiveStartKey: decodeCursor(cursor, pk) }),
    }),
  );
  return {
    items: Items.map((row) => row.id as string),
    ...(LastEvaluatedKey && {
      nextCursor: Buffer.from(JSON.stringify(LastEvaluatedKey)).toString('base64url'),
    }),
  };
}

/** Reconhece a falha de condição de uma TransactWriteItems. */
export function isTransactionConflict(err: unknown) {
  return err instanceof Error && err.name === 'TransactionCanceledException';
}

export function isConditionFailed(err: unknown) {
  return err instanceof Error && err.name === 'ConditionalCheckFailedException';
}

/** Linha de um lookup de listagem: a ordem (`SK`) e o ponteiro (`id`). */
export interface LookupRow {
  SK: string;
  id: string;
  createdAt: string;
}

/**
 * Lê todas as linhas de um lookup de listagem (`PK=<lookup>`), em ordem crescente de `SK`, seguindo as páginas.
 * Para listas pequenas e limitadas (membros, presença); listagem longa usa `queryLookupIds` com cursor.
 */
export async function queryLookupRows(
  pk: string,
  opts: { consistent?: boolean } = {},
  startKey?: Record<string, unknown>,
): Promise<LookupRow[]> {
  const { Items = [], LastEvaluatedKey } = await dynamo().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': pk },
      ProjectionExpression: 'SK, id, createdAt',
      ConsistentRead: opts.consistent,
      ...(startKey && { ExclusiveStartKey: startKey }),
    }),
  );
  const rows = Items.map((row) => ({
    SK: row.SK as string,
    id: row.id as string,
    createdAt: row.createdAt as string,
  }));
  return LastEvaluatedKey ? [...rows, ...(await queryLookupRows(pk, opts, LastEvaluatedKey))] : rows;
}
