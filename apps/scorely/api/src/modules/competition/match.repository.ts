import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  batchGetOrdered,
  dbItem,
  LOOKUP_ENTITY,
  queryLookupRows,
  setCreatedAtIfNew,
  stripKeys,
  touch,
  transactWrite,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import {
  MATCH_COUNTERS_ENTITY,
  MATCH_ENTITY,
  matchCountersKey,
  matchKey,
  matchLookupKey,
  matchLookupPk,
} from '@scorely/api/src/modules/competition/match.table';
import { COMPETITION_MATCH_LIMIT, type MatchWinner } from '@scorely/contracts';

/** A partida como fica no banco (CMP-20), com os ids do sistema (ou do avulso). */
export interface StoredMatch {
  id: string;
  gameId: string;
  groupId: string;
  teams: [string[], string[]];
  winner: MatchWinner;
  createdAt: string;
  updatedAt: string;
}

export interface MatchRepository {
  /** As partidas do jogo, na ordem em que foram registradas. */
  list(gameId: string): Promise<StoredMatch[]>;
  get(id: string): Promise<StoredMatch | undefined>;
  /** Entidade, lookup e contagem numa transação. `full` = o jogo já tem o máximo (CMP-20). */
  create(match: StoredMatch): Promise<'created' | 'full'>;
  update(
    id: string,
    patch: { teams: [string[], string[]]; winner: MatchWinner; updatedAt: string },
  ): Promise<void>;
  /** Entidade, lookup e contagem numa transação. */
  delete(match: StoredMatch): Promise<void>;
}

export const dynamoMatchRepository: MatchRepository = {
  async list(gameId) {
    const rows = await queryLookupRows(matchLookupPk(gameId));
    const items = await batchGetOrdered(rows.map((r) => matchKey(r.id)));
    return items.map((row) => stripKeys<StoredMatch>(row));
  },

  async get(id) {
    const { Item } = await dynamo().send(new GetCommand({ TableName: tableName(), Key: matchKey(id) }));
    return Item ? stripKeys<StoredMatch>(Item) : undefined;
  },

  async create(match) {
    const created = setCreatedAtIfNew(new Date(match.createdAt));
    const outcome = await transactWrite([
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(matchKey(match.id), MATCH_ENTITY, match, match.createdAt),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(
            matchLookupKey(match.gameId, match.createdAt, match.id),
            LOOKUP_ENTITY,
            { id: match.id },
            match.createdAt,
          ),
        },
      },
      {
        Update: {
          TableName: tableName(),
          Key: matchCountersKey(match.gameId),
          UpdateExpression: `SET ${created.expression}, entity = :entity ADD matchCount :one`,
          ConditionExpression: 'attribute_not_exists(matchCount) OR matchCount < :max',
          ExpressionAttributeValues: {
            ...created.values,
            ':entity': MATCH_COUNTERS_ENTITY,
            ':one': 1,
            ':max': COMPETITION_MATCH_LIMIT,
          },
        },
      },
    ]);
    if (outcome.ok) return 'created';
    if (outcome.failed.includes(2)) return 'full';
    throw new Error('Match create failed: the match already exists');
  },

  async update(id, patch) {
    await dynamo().send(
      new UpdateCommand(
        touch({
          TableName: tableName(),
          Key: matchKey(id),
          UpdateExpression: 'SET teams = :teams, winner = :winner, updatedAt = :updatedAt',
          ConditionExpression: 'attribute_exists(PK)',
          ExpressionAttributeValues: {
            ':teams': patch.teams,
            ':winner': patch.winner,
            ':updatedAt': patch.updatedAt,
          },
        }),
      ),
    );
  },

  async delete(match) {
    const outcome = await transactWrite([
      {
        Delete: {
          TableName: tableName(),
          Key: matchKey(match.id),
          ConditionExpression: 'attribute_exists(PK)',
        },
      },
      { Delete: { TableName: tableName(), Key: matchLookupKey(match.gameId, match.createdAt, match.id) } },
      {
        Update: {
          TableName: tableName(),
          Key: matchCountersKey(match.gameId),
          UpdateExpression: 'ADD matchCount :minus',
          ExpressionAttributeValues: { ':minus': -1 },
        },
      },
    ]);
    if (!outcome.ok) throw new Error('Match delete failed: the match no longer exists');
  },
};
