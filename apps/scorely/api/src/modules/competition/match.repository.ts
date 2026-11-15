import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  batchGetOrdered,
  currentVersion,
  dbItem,
  LOOKUP_ENTITY,
  queryLookupRows,
  sendVersioned,
  setCreatedAtIfNew,
  stripKeys,
  touch,
  transactWrite,
  versionConflict,
  withVersion,
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
  /** CMP-42 (ADR 0013, 0016). */
  version: number;
}

export interface MatchRepository {
  /** As partidas do jogo, na ordem em que foram registradas. */
  list(gameId: string): Promise<StoredMatch[]>;
  get(id: string): Promise<StoredMatch | undefined>;
  /** Entidade, lookup e contagem numa transação. `full` = o jogo já tem o máximo (CMP-20). */
  create(match: Omit<StoredMatch, 'version'>): Promise<'created' | 'full'>;
  /** Só na versão esperada (CMP-42); senão, `VERSION_CONFLICT`. */
  update(
    id: string,
    patch: { teams: [string[], string[]]; winner: MatchWinner; updatedAt: string },
    expectedVersion: number,
  ): Promise<void>;
  /** Entidade, lookup e contagem numa transação, só na versão esperada (CMP-42). */
  delete(match: StoredMatch, expectedVersion: number): Promise<void>;
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

  async update(id, patch, expectedVersion) {
    await sendVersioned(matchKey(id), () =>
      dynamo().send(
        new UpdateCommand(
          withVersion(
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
            expectedVersion,
          ),
        ),
      ),
    );
  },

  async delete(match, expectedVersion) {
    const outcome = await transactWrite([
      {
        Delete: withVersion(
          { TableName: tableName(), Key: matchKey(match.id), ConditionExpression: 'attribute_exists(PK)' },
          expectedVersion,
        ),
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
    if (!outcome.ok) throw await versionConflict(() => currentVersion(matchKey(match.id)));
  },
};
