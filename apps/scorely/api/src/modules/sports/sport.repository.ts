import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  batchGetOrdered,
  dbItem,
  LOOKUP_ENTITY,
  replaceItem,
  stripKeys,
  transactWrite,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import {
  SPORT_CATALOG_LOOKUP,
  SPORT_ENTITY,
  sportCatalogLookupKey,
  sportKey,
} from '@scorely/api/src/modules/sports/sport.table';
import type { Sport } from '@scorely/contracts';

/** O esporte como fica no banco: o do contrato mais a posição no catálogo (ESP-06). */
export type StoredSport = Sport & { order: number };

export interface SportRepository {
  /** O catálogo inteiro, ativos e desativados, na ordem da `order` (ESP-06). */
  list(): Promise<StoredSport[]>;
  get(id: string): Promise<StoredSport | undefined>;
  /** Grava o esporte inteiro (cria ou substitui, sem voltar a `version`) e o lookup do catálogo. */
  save(sport: StoredSport): Promise<void>;
}

async function catalogIds(): Promise<string[]> {
  const { Items = [] } = await dynamo().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': SPORT_CATALOG_LOOKUP },
      ProjectionExpression: 'id',
    }),
  );
  return Items.map((row) => row.id as string);
}

export const dynamoSportRepository: SportRepository = {
  async list() {
    const rows = await batchGetOrdered((await catalogIds()).map(sportKey));
    return rows.map((row) => stripKeys<StoredSport>(row)).sort((a, b) => a.order - b.order);
  },

  async get(id) {
    const { Item } = await dynamo().send(new GetCommand({ TableName: tableName(), Key: sportKey(id) }));
    return Item ? stripKeys<StoredSport>(Item) : undefined;
  },

  async save(sport) {
    const { id, name, positions, active, order } = sport;
    const result = await transactWrite([
      {
        Update: {
          TableName: tableName(),
          ...replaceItem(sportKey(id), SPORT_ENTITY, { id, name, positions, active, order }),
        },
      },
      { Put: { TableName: tableName(), Item: dbItem(sportCatalogLookupKey(id), LOOKUP_ENTITY, { id }) } },
    ]);
    if (!result.ok) throw new Error(`Sport ${id} was not saved`);
  },
};
