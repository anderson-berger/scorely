import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  currentVersion,
  dbItem,
  stripKeys,
  type TransactItem,
  touch,
  transactWrite,
  versionConflict,
  withVersion,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import { appError } from '@scorely/api/src/lib/errors';
import {
  groupCountersKey,
  groupPk,
  groupSettingsKey,
  PLACE_ENTITY,
  PLACE_SK_PREFIX,
  placeKey,
} from '@scorely/api/src/modules/groups/group.table';
import { PLACE_LIMITS, type Place, type PlaceInput, PlaceInputSchema } from '@scorely/contracts';

/** O lugar como fica no banco (GRP-60): o `Place` do contrato, com o grupo e as datas. */
export type StoredPlace = Place & { groupId: string; createdAt: string; updatedAt: string };

export interface PlaceRepository {
  /** Ativos e arquivados, na ordem de criação (GRP-60, 61). */
  list(groupId: string): Promise<StoredPlace[]>;
  get(groupId: string, placeId: string): Promise<StoredPlace | undefined>;
  /** GRP-60: com o limite de ativos conferido no contador; cheio → `PLACE_LIMIT_REACHED`. */
  create(place: Omit<StoredPlace, 'version'>): Promise<void>;
  /** GRP-60: na versão esperada (ADR 0016). Inexistente → `PLACE_NOT_FOUND`; versão velha → `VERSION_CONFLICT`. */
  update(groupId: string, placeId: string, input: PlaceInput, expectedVersion: number): Promise<StoredPlace>;
  /** GRP-61: o padrão não é arquivado (`PLACE_IS_DEFAULT`); já arquivado → como está. */
  archive(groupId: string, placeId: string, expectedVersion: number, at: string): Promise<StoredPlace>;
  /** GRP-61: volta à escolha, se houver espaço no limite; já ativo → como está. */
  unarchive(groupId: string, placeId: string, expectedVersion: number): Promise<StoredPlace>;
}

/** O contador dos lugares ativos (GRP-60): `+1` com a condição do limite, ou `-1`. */
function countItem(groupId: string, delta: 1 | -1): TransactItem {
  return {
    Update: {
      TableName: tableName(),
      Key: groupCountersKey(groupId),
      UpdateExpression: 'ADD placeCount :delta',
      ...(delta === 1
        ? {
            ConditionExpression: 'attribute_not_exists(placeCount) OR placeCount < :max',
            ExpressionAttributeValues: { ':delta': 1, ':max': PLACE_LIMITS.perGroup },
          }
        : { ExpressionAttributeValues: { ':delta': -1 } }),
    },
  };
}

const limitReached = () => appError('PLACE_LIMIT_REACHED', { max: PLACE_LIMITS.perGroup });

async function read(groupId: string, placeId: string): Promise<StoredPlace | undefined> {
  const { Item } = await dynamo().send(
    new GetCommand({ TableName: tableName(), Key: placeKey(groupId, placeId), ConsistentRead: true }),
  );
  return Item ? stripKeys<StoredPlace>(Item) : undefined;
}

async function mustRead(groupId: string, placeId: string): Promise<StoredPlace> {
  const place = await read(groupId, placeId);
  if (!place) throw appError('PLACE_NOT_FOUND');
  return place;
}

/** A versão não bateu: some o lugar → `PLACE_NOT_FOUND`; senão, `VERSION_CONFLICT` com a atual. */
async function conflictOf(groupId: string, placeId: string) {
  const current = await currentVersion(placeKey(groupId, placeId));
  return current === 0 ? appError('PLACE_NOT_FOUND') : versionConflict(async () => current);
}

async function queryPlaces(groupId: string, startKey?: Record<string, unknown>): Promise<StoredPlace[]> {
  const { Items = [], LastEvaluatedKey } = await dynamo().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': groupPk(groupId), ':prefix': PLACE_SK_PREFIX },
      ...(startKey && { ExclusiveStartKey: startKey }),
    }),
  );
  const page = Items.map((row) => stripKeys<StoredPlace>(row));
  return LastEvaluatedKey ? [...page, ...(await queryPlaces(groupId, LastEvaluatedKey))] : page;
}

export const dynamoPlaceRepository: PlaceRepository = {
  async list(groupId) {
    return (await queryPlaces(groupId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  get: read,

  async create(place) {
    const result = await transactWrite([
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(placeKey(place.groupId, place.id), PLACE_ENTITY, place, place.createdAt),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      countItem(place.groupId, 1),
    ]);
    if (result.ok) return;
    if (result.failed.includes(1)) throw limitReached();
    throw new Error('Place create failed: the place already exists');
  },

  async update(groupId, placeId, input, expectedVersion) {
    const { name, address, lat, lng } = PlaceInputSchema.parse(input);
    const result = await transactWrite([
      {
        Update: withVersion(
          touch({
            TableName: tableName(),
            Key: placeKey(groupId, placeId),
            UpdateExpression: 'SET #name = :name, address = :address, lat = :lat, lng = :lng',
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeNames: { '#name': 'name' },
            ExpressionAttributeValues: { ':name': name, ':address': address, ':lat': lat, ':lng': lng },
          }),
          expectedVersion,
        ),
      },
    ]);
    if (!result.ok) throw await conflictOf(groupId, placeId);
    return mustRead(groupId, placeId);
  },

  async archive(groupId, placeId, expectedVersion, at) {
    const place = await mustRead(groupId, placeId);
    if (place.archivedAt) return place;
    // [0] o lugar (ativo, na versão), [1] não é o padrão do grupo (GRP-61), [2] sai do limite.
    const result = await transactWrite([
      {
        Update: withVersion(
          touch({
            TableName: tableName(),
            Key: placeKey(groupId, placeId),
            UpdateExpression: 'SET archivedAt = :at',
            ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(archivedAt)',
            ExpressionAttributeValues: { ':at': at },
          }),
          expectedVersion,
        ),
      },
      {
        ConditionCheck: {
          TableName: tableName(),
          Key: groupSettingsKey(groupId),
          ConditionExpression: 'attribute_not_exists(defaultPlaceId) OR defaultPlaceId <> :id',
          ExpressionAttributeValues: { ':id': placeId },
        },
      },
      countItem(groupId, -1),
    ]);
    if (result.ok) return mustRead(groupId, placeId);
    if (result.failed.includes(1)) throw appError('PLACE_IS_DEFAULT');
    throw await conflictOf(groupId, placeId);
  },

  async unarchive(groupId, placeId, expectedVersion) {
    const place = await mustRead(groupId, placeId);
    if (!place.archivedAt) return place;
    // [0] o lugar (arquivado, na versão), [1] volta ao limite, com a condição.
    const result = await transactWrite([
      {
        Update: withVersion(
          touch({
            TableName: tableName(),
            Key: placeKey(groupId, placeId),
            UpdateExpression: 'REMOVE archivedAt',
            ConditionExpression: 'attribute_exists(archivedAt)',
          }),
          expectedVersion,
        ),
      },
      countItem(groupId, 1),
    ]);
    if (result.ok) return mustRead(groupId, placeId);
    if (result.failed.includes(1)) throw limitReached();
    throw await conflictOf(groupId, placeId);
  },
};
