import {
  BatchGetCommand,
  type BatchGetCommandOutput,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamo, tableName } from '@base/api/src/lib/dynamo';
import { chunk } from '@base/api/src/lib/fn';
import type { Item } from '@base/api/src/modules/items/item.schema';
import {
  ITEM_ENTITY,
  ITEM_LIST_LOOKUP_PK,
  itemKey,
  itemListLookupKey,
  LOOKUP_ENTITY,
} from '@base/api/src/modules/items/item.table';

export interface ItemRepository {
  put(item: Item): Promise<void>;
  get(id: string): Promise<Item | undefined>;
  list(): Promise<Item[]>;
}

const BATCH_GET_LIMIT = 100;

function toItem(row: Record<string, unknown>): Item {
  const { PK: _pk, SK: _sk, entity: _e, ...item } = row;
  return item as Item;
}

/** Um BatchGet (até 100 chaves); chama de novo com as UnprocessedKeys até não sobrar nenhuma. */
async function batchGetAll(pending: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (!pending.length) return [];
  const { Responses, UnprocessedKeys }: BatchGetCommandOutput = await dynamo().send(
    new BatchGetCommand({ RequestItems: { [tableName()]: { Keys: pending } } }),
  );
  const rows = Responses?.[tableName()] ?? [];
  return [...rows, ...(await batchGetAll(UnprocessedKeys?.[tableName()]?.Keys ?? []))];
}

/** Busca as entidades pelos ids (ponteiros dos lookups) mantendo a ordem recebida. */
async function batchGetByIds(ids: string[]): Promise<Item[]> {
  const found = new Map<string, Item>();
  for (const part of chunk(ids, BATCH_GET_LIMIT)) {
    for (const row of await batchGetAll(part.map(itemKey))) {
      const item = toItem(row);
      found.set(item.id, item);
    }
  }
  return ids.flatMap((id) => found.get(id) ?? []);
}

export const dynamoItemRepository: ItemRepository = {
  async put(item) {
    await dynamo().send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tableName(),
              Item: { ...itemKey(item.id), entity: ITEM_ENTITY, ...item },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Put: {
              TableName: tableName(),
              Item: { ...itemListLookupKey(item), entity: LOOKUP_ENTITY, id: item.id },
            },
          },
        ],
      }),
    );
  },
  async get(id) {
    const { Item: row } = await dynamo().send(new GetCommand({ TableName: tableName(), Key: itemKey(id) }));
    return row ? toItem(row) : undefined;
  },
  async list() {
    const { Items: pointers = [] } = await dynamo().send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': ITEM_LIST_LOOKUP_PK },
        ProjectionExpression: 'id',
        ScanIndexForward: false,
      }),
    );
    return batchGetByIds(pointers.map((p) => p.id as string));
  },
};
