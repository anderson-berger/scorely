import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  batchGetOrdered,
  dbItem,
  LOOKUP_ENTITY,
  queryLookupRows,
  stripKeys,
  type TransactItem,
  touch,
  transactWrite,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import {
  SEASON_ENTITY,
  seasonKey,
  seasonLookupKey,
  seasonLookupPk,
  seasonOpenKey,
} from '@scorely/api/src/modules/competition/season.table';
import type { StoredTrophy } from '@scorely/api/src/modules/competition/trophy.repository';

export type { StoredTrophy };

import {
  TROPHY_ENTITY,
  trophyId,
  trophyKey,
  trophyLookupKey,
} from '@scorely/api/src/modules/competition/trophy.table';
import type { CompetitionRules } from '@scorely/contracts';

/** Uma linha do ranking final guardado ao travar (CMP-32), com o id do sistema. */
export interface StoredFinalRow {
  id: string;
  position: number;
  points: number;
  attendance: number;
  streak: number;
  record: { wins: number; draws: number; losses: number };
}

/** O ranking final da temporada travada (CMP-32). */
export interface StoredFinal {
  rows: StoredFinalRow[];
  games: number;
  savedAt: string;
  /** Um valor único de quem gravou: relendo, quem achar o seu sabe que travou e avisa (CMP-39). */
  token?: string;
}

/** A temporada como fica no banco (CMP-29). */
export interface StoredSeason {
  id: string;
  groupId: string;
  /** A ordem de criação no grupo. */
  number: number;
  name?: string;
  startDate: string;
  endDate: string;
  rules: CompetitionRules;
  closedAt?: string;
  final?: StoredFinal;
  createdAt: string;
  updatedAt: string;
}

/** O que muda numa temporada (CMP-30, 32). */
export type SeasonPatch = Partial<
  Pick<StoredSeason, 'name' | 'startDate' | 'endDate' | 'rules' | 'closedAt'>
> & {
  updatedAt: string;
};

export interface SeasonRepository {
  /** As temporadas do grupo, pelo lookup (pela data de início). */
  list(groupId: string): Promise<StoredSeason[]>;
  get(id: string): Promise<StoredSeason | undefined>;
  create(season: StoredSeason): Promise<void>;
  /** Com `oldStartDate`, o início mudou: o lookup antigo sai e o novo entra na mesma transação. */
  update(id: string, patch: SeasonPatch, oldStartDate?: string): Promise<void>;
  delete(season: StoredSeason): Promise<void>;
  /**
   * CMP-32, 36: grava o ranking final só se ainda não houver um (o primeiro que trava vale), com os troféus e a saída da
   * lista das que vão travar, numa transação.
   */
  saveFinal(id: string, final: StoredFinal, trophies?: StoredTrophy[]): Promise<void>;
}

function updateItem(id: string, patch: SeasonPatch): NonNullable<TransactItem['Update']> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  return touch({
    TableName: tableName(),
    Key: seasonKey(id),
    UpdateExpression: `SET ${entries.map(([k]) => `#${k} = :${k}`).join(', ')}`,
    ConditionExpression: 'attribute_exists(PK)',
    ExpressionAttributeNames: Object.fromEntries(entries.map(([k]) => [`#${k}`, k])),
    ExpressionAttributeValues: Object.fromEntries(entries.map(([k, v]) => [`:${k}`, v])),
  });
}

export const dynamoSeasonRepository: SeasonRepository = {
  async list(groupId) {
    const rows = await queryLookupRows(seasonLookupPk(groupId));
    const items = await batchGetOrdered(rows.map((r) => seasonKey(r.id)));
    return items.map((row) => stripKeys<StoredSeason>(row));
  },

  async get(id) {
    const { Item } = await dynamo().send(new GetCommand({ TableName: tableName(), Key: seasonKey(id) }));
    return Item ? stripKeys<StoredSeason>(Item) : undefined;
  },

  async create(season) {
    const outcome = await transactWrite([
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(seasonKey(season.id), SEASON_ENTITY, season, season.createdAt),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      lookupPut(seasonLookupKey(season.groupId, season.startDate, season.id), season.id, season.createdAt),
      lookupPut(seasonOpenKey(season.endDate, season.id), season.id, season.createdAt),
    ]);
    if (!outcome.ok) throw new Error('Season create failed: the season already exists');
  },

  async update(id, patch, oldStartDate) {
    const datesChange = patch.startDate !== undefined || patch.endDate !== undefined;
    if (!datesChange && oldStartDate === undefined) {
      await dynamo().send(new UpdateCommand(updateItem(id, patch)));
      return;
    }
    const current = await this.get(id);
    if (!current) throw new Error('Season update failed: the season no longer exists');
    const startMoved = patch.startDate !== undefined && patch.startDate !== current.startDate;
    const endMoved = patch.endDate !== undefined && patch.endDate !== current.endDate && !current.final;
    const items: TransactItem[] = [
      { Update: updateItem(id, patch) },
      ...(startMoved && patch.startDate
        ? [
            {
              Delete: {
                TableName: tableName(),
                Key: seasonLookupKey(current.groupId, current.startDate, id),
              },
            },
            lookupPut(seasonLookupKey(current.groupId, patch.startDate, id), id, current.createdAt),
          ]
        : []),
      ...(endMoved && patch.endDate
        ? [
            { Delete: { TableName: tableName(), Key: seasonOpenKey(current.endDate, id) } },
            lookupPut(seasonOpenKey(patch.endDate, id), id, current.createdAt),
          ]
        : []),
    ];
    const outcome = await transactWrite(items);
    if (!outcome.ok) throw new Error('Season update failed: the season no longer exists');
  },

  async delete(season) {
    const outcome = await transactWrite([
      {
        Delete: {
          TableName: tableName(),
          Key: seasonKey(season.id),
          ConditionExpression: 'attribute_exists(PK)',
        },
      },
      {
        Delete: { TableName: tableName(), Key: seasonLookupKey(season.groupId, season.startDate, season.id) },
      },
      { Delete: { TableName: tableName(), Key: seasonOpenKey(season.endDate, season.id) } },
    ]);
    if (!outcome.ok) throw new Error('Season delete failed: the season no longer exists');
  },

  async saveFinal(id, final, trophies = []) {
    const current = await this.get(id);
    if (!current || current.final) return;
    // CMP-36, 39: o ranking final, os troféus e a saída da lista das que vão travar, numa transação só.
    const outcome = await transactWrite([
      {
        Update: touch({
          TableName: tableName(),
          Key: seasonKey(id),
          UpdateExpression: 'SET #final = :final',
          ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(#final)',
          ExpressionAttributeNames: { '#final': 'final' },
          ExpressionAttributeValues: { ':final': final },
        }),
      },
      { Delete: { TableName: tableName(), Key: seasonOpenKey(current.endDate, id) } },
      ...trophies.flatMap((t): TransactItem[] => {
        const tid = trophyId(t.seasonId, t.userId, t.kind);
        return [
          { Put: { TableName: tableName(), Item: dbItem(trophyKey(tid), TROPHY_ENTITY, t, t.awardedAt) } },
          lookupPut(trophyLookupKey(t.userId, t.awardedAt, t.seasonId, t.kind), tid, t.awardedAt),
        ];
      }),
    ]);
    // A condição falhou: outro leitor travou antes, e o dele vale (quem chamou relê o `token`).
    if (!outcome.ok) return;
  },
};

function lookupPut(key: { PK: string; SK: string }, id: string, createdAt: string): TransactItem {
  return { Put: { TableName: tableName(), Item: dbItem(key, LOOKUP_ENTITY, { id }, createdAt) } };
}
