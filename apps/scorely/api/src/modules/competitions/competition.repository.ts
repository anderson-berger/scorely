import { DeleteCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  batchGetOrdered,
  COUNTERS_ENTITY,
  currentVersion,
  dbItem,
  LOOKUP_ENTITY,
  replaceItem,
  sendVersioned,
  stripKeys,
  type TransactItem,
  touch,
  transactWrite,
  ttlFrom,
  versionConflict,
  withVersion,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import type { GroupId, UserId } from '@scorely/api/src/lib/ids';
import {
  COMPETITION_ENTITY,
  COMPETITION_FINAL_ENTITY,
  COMPETITION_PREFIX,
  competitionFinalKey,
  competitionKey,
  competitionLockKey,
  competitionLockPk,
  competitionSeqKey,
} from '@scorely/api/src/modules/competitions/competition.table';
import type { StoredMatch, StoredSeries } from '@scorely/api/src/modules/matches/match.repository';
import { matchKey, matchSeriesKey } from '@scorely/api/src/modules/matches/match.table';
import type { CompetitionCut, CompetitionPoints, CompetitionType } from '@scorely/contracts';

/** A competição como fica no banco (COM-01, seção 3 do doc). Interna da api. */
export interface StoredCompetition {
  id: string;
  groupId: GroupId;
  createdAt: string;
  updatedAt: string;
  version: number;
  type: CompetitionType;
  /** Ausente = "Temporada `number`" (COM-02). */
  name?: string | undefined;
  number: number;
  /** Datas locais, no `timeZone` (COM-02). */
  startDate: string;
  endDate: string;
  timeZone: string;
  points: CompetitionPoints;
  /** COM-11: quando travou. */
  lockedAt?: string | undefined;
  createdBy: UserId;
}

/** Uma linha do ranking final (COM-11), com o id do sistema. */
export interface FinalLine {
  position: number;
  userId: UserId;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
}

/** O ranking final (COM-11), `GROUP#<g> / COMPETITIONFINAL#<competitionId>`: as linhas dos três recortes. */
export interface StoredFinal {
  groupId: GroupId;
  competitionId: string;
  cuts: Record<CompetitionCut, FinalLine[]>;
  createdAt: string;
}

/** Um item da agenda da trava (COM-11): "olhe esta competição neste instante". */
export interface LockEntry {
  at: string;
  groupId: GroupId;
  competitionId: string;
}

/** O "Vale para" novo de uma repetição ou partida, gravado junto com a competição (COM-01, PAR-40). */
export interface TaggedItem<T> {
  item: T;
  competitionIds: string[];
  expectedVersion: number;
}

export interface CompetitionRepository {
  /** COM-02: o último N do grupo (0 sem nenhuma). */
  getSequence(groupId: GroupId): Promise<number>;
  /**
   * COM-01, PAR-40: numa transação, a competição, o contador (que precisa ainda estar em `previousNumber`), o item da
   * agenda da trava e o "Vale para" das repetições e das partidas (cada uma na `version` esperada). `false` = outro
   * gravou antes (o contador ou um dos itens mudou): nada foi gravado.
   */
  createCompetition(input: {
    competition: StoredCompetition;
    previousNumber: number;
    lockAt: string;
    series: readonly TaggedItem<StoredSeries>[];
    matches: readonly TaggedItem<StoredMatch>[];
  }): Promise<boolean>;
  getCompetition(
    groupId: GroupId,
    competitionId: string,
    opts?: { consistent?: boolean },
  ): Promise<StoredCompetition | undefined>;
  /** As competições destes ids, na ordem; as que não existem somem. */
  getCompetitions(groupId: GroupId, ids: readonly string[]): Promise<StoredCompetition[]>;
  listCompetitions(groupId: GroupId): Promise<StoredCompetition[]>;
  /**
   * COM-04, 10: grava a competição inteira se a `version` for a esperada; senão `VERSION_CONFLICT`. Com o prazo
   * mudado (`previousLockAt` diferente de `lockAt`), o item da agenda da trava troca na mesma transação.
   */
  updateCompetition(
    competition: StoredCompetition,
    expectedVersion: number,
    at: Date,
    lock: { lockAt: string; previousLockAt: string },
  ): Promise<StoredCompetition>;
  /** COM-11: numa transação, o `lockedAt` (só se ainda não travou) e o ranking final. `false` = já travada. */
  lockCompetition(input: { competition: StoredCompetition; final: StoredFinal; at: Date }): Promise<boolean>;
  getFinal(groupId: GroupId, competitionId: string): Promise<StoredFinal | undefined>;
  /** Os itens da agenda da trava com instante de `from` a `to`. */
  listLockEntries(from: Date, to: Date): Promise<LockEntry[]>;
  deleteLockEntry(entry: LockEntry): Promise<void>;
}

const DAY_MS = 86_400_000;
/** COM-11: o item da agenda da trava some sozinho 31 dias depois do instante, se a rotina não apagou (ADR 0004). */
const LOCK_TTL_MS = 31 * DAY_MS;

const lockPut = (entry: LockEntry, createdAt: string): TransactItem => ({
  Put: {
    TableName: tableName(),
    Item: {
      ...dbItem(
        competitionLockKey(entry.at, entry.groupId, entry.competitionId),
        LOOKUP_ENTITY,
        entry,
        createdAt,
      ),
      ttl: ttlFrom(new Date(Date.parse(entry.at) + LOCK_TTL_MS)),
    },
  },
});

/** O "Vale para" novo na repetição ou na partida, na `version` esperada (PAR-40). */
function tagUpdate(key: { PK: string; SK: string }, tagged: TaggedItem<unknown>, at: Date): TransactItem {
  return {
    Update: {
      TableName: tableName(),
      ...withVersion(
        touch(
          {
            Key: key,
            UpdateExpression: 'SET competitionIds = :ids',
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeValues: { ':ids': tagged.competitionIds },
          },
          at,
        ),
        tagged.expectedVersion,
      ),
    },
  };
}

async function getItem(Key: Record<string, string>, consistent = false) {
  const { Item } = await dynamo().send(
    new GetCommand({ TableName: tableName(), Key, ConsistentRead: consistent }),
  );
  return Item;
}

async function queryPrefix(
  pk: string,
  prefix: string,
  startKey?: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const { Items = [], LastEvaluatedKey } = await dynamo().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
      ...(startKey && { ExclusiveStartKey: startKey }),
    }),
  );
  return LastEvaluatedKey ? [...Items, ...(await queryPrefix(pk, prefix, LastEvaluatedKey))] : Items;
}

/** Os dias (`AAAA-MM-DD`, UTC) de `from` até `to`. */
function daysBetween(from: Date, to: Date): string[] {
  const first = Math.floor(from.getTime() / DAY_MS);
  const last = Math.floor(to.getTime() / DAY_MS);
  return last < first
    ? []
    : Array.from({ length: last - first + 1 }, (_, i) => new Date((first + i) * DAY_MS).toISOString());
}

async function lockDay(
  day: string,
  to: string,
  startKey?: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const { Items = [], LastEvaluatedKey } = await dynamo().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND SK <= :to',
      ExpressionAttributeValues: { ':pk': competitionLockPk(day), ':to': `${to}#~` },
      ...(startKey && { ExclusiveStartKey: startKey }),
    }),
  );
  return LastEvaluatedKey ? [...Items, ...(await lockDay(day, to, LastEvaluatedKey))] : Items;
}

export const dynamoCompetitionRepository: CompetitionRepository = {
  async getSequence(groupId) {
    const item = await getItem(competitionSeqKey(groupId), true);
    return Number(item?.last ?? 0);
  },

  async createCompetition({ competition, previousNumber, lockAt, series, matches }) {
    const { groupId } = competition;
    const result = await transactWrite([
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(competitionKey(groupId, competition.id), COMPETITION_ENTITY, competition),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Update: {
          TableName: tableName(),
          Key: competitionSeqKey(groupId),
          UpdateExpression:
            'SET #entity = :entity, #last = :next, createdAt = if_not_exists(createdAt, :createdAt)',
          ConditionExpression:
            previousNumber === 0 ? 'attribute_not_exists(#last) OR #last = :previous' : '#last = :previous',
          ExpressionAttributeNames: { '#entity': 'entity', '#last': 'last' },
          ExpressionAttributeValues: {
            ':entity': COUNTERS_ENTITY,
            ':next': competition.number,
            ':previous': previousNumber,
            ':createdAt': competition.createdAt,
          },
        },
      },
      lockPut({ at: lockAt, groupId, competitionId: competition.id }, competition.createdAt),
      ...series.map((s) => tagUpdate(matchSeriesKey(groupId, s.item.id), s, new Date(competition.createdAt))),
      ...matches.map((m) => tagUpdate(matchKey(groupId, m.item.id), m, new Date(competition.createdAt))),
    ]);
    if (result.ok) return true;
    if (result.failed.some((i) => i > 0)) return false;
    throw new Error('Competition create failed');
  },

  async getCompetition(groupId, competitionId, opts) {
    const item = await getItem(competitionKey(groupId, competitionId), opts?.consistent);
    return item ? stripKeys<StoredCompetition>(item) : undefined;
  },

  async getCompetitions(groupId, ids) {
    const rows = await batchGetOrdered(ids.map((id) => competitionKey(groupId, id)));
    return rows.map((row) => stripKeys<StoredCompetition>(row));
  },

  async listCompetitions(groupId) {
    const rows = await queryPrefix(competitionKey(groupId, '').PK, COMPETITION_PREFIX);
    return rows.map((row) => stripKeys<StoredCompetition>(row));
  },

  async updateCompetition(competition, expectedVersion, at, lock) {
    const key = competitionKey(competition.groupId, competition.id);
    const { version: _v, updatedAt: _u, ...data } = competition;
    const update = replaceItem(key, COMPETITION_ENTITY, { ...data, updatedAt: at.toISOString() }, ['name']);
    const versioned = withVersion(
      { ...update, ConditionExpression: 'attribute_exists(PK)' },
      expectedVersion,
    );
    if (lock.lockAt !== lock.previousLockAt) {
      const tx = await transactWrite([
        { Update: { TableName: tableName(), ...versioned } },
        {
          Delete: {
            TableName: tableName(),
            Key: competitionLockKey(lock.previousLockAt, competition.groupId, competition.id),
          },
        },
        lockPut(
          { at: lock.lockAt, groupId: competition.groupId, competitionId: competition.id },
          at.toISOString(),
        ),
      ]);
      if (!tx.ok) {
        if (tx.failed.includes(0)) throw await versionConflict(() => currentVersion(key));
        throw new Error('Competition update failed');
      }
      const saved = await getItem(key, true);
      if (!saved) throw new Error('Competition update failed');
      return stripKeys<StoredCompetition>(saved);
    }
    const result = await sendVersioned(key, () =>
      dynamo().send(new UpdateCommand({ TableName: tableName(), ...versioned, ReturnValues: 'ALL_NEW' })),
    );
    return stripKeys<StoredCompetition>(result.Attributes ?? {});
  },

  async lockCompetition({ competition, final, at }) {
    const result = await transactWrite([
      {
        Update: {
          TableName: tableName(),
          ...touch(
            {
              Key: competitionKey(competition.groupId, competition.id),
              UpdateExpression: 'SET lockedAt = :at',
              ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(lockedAt)',
              ExpressionAttributeValues: { ':at': at.toISOString() },
            },
            at,
          ),
        },
      },
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(
            competitionFinalKey(final.groupId, final.competitionId),
            COMPETITION_FINAL_ENTITY,
            final,
            final.createdAt,
          ),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ]);
    if (result.ok) return true;
    if (result.failed.length > 0) return false;
    throw new Error('Competition lock failed');
  },

  async getFinal(groupId, competitionId) {
    const item = await getItem(competitionFinalKey(groupId, competitionId));
    return item ? stripKeys<StoredFinal>(item) : undefined;
  },

  async listLockEntries(from, to) {
    const until = to.toISOString();
    const since = from.toISOString();
    const pages = await Promise.all(daysBetween(from, to).map((day) => lockDay(day, until)));
    return pages
      .flat()
      .map((row) => stripKeys<LockEntry & { createdAt?: string }>(row))
      .filter((entry) => entry.at >= since && entry.at <= until)
      .map(({ createdAt: _c, ...entry }) => entry);
  },

  async deleteLockEntry(entry) {
    await dynamo().send(
      new DeleteCommand({
        TableName: tableName(),
        Key: competitionLockKey(entry.at, entry.groupId, entry.competitionId),
      }),
    );
  },
};
