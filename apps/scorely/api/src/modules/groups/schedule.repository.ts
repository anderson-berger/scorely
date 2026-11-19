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
  SCHEDULE_ENTITY,
  SCHEDULE_SK_PREFIX,
  scheduleKey,
} from '@scorely/api/src/modules/groups/group.table';
import { minutesOf, type Schedule, type ScheduleInput } from '@scorely/contracts';

/** O horário como fica no banco (GRP-64): o `Schedule` do contrato, com o grupo e as datas. */
export type StoredSchedule = Schedule & { groupId: string; createdAt: string; updatedAt: string };

export interface ScheduleRepository {
  /** Ativos e arquivados, por dia e início, com a revisão dos horários (o `scheduleRevision` do COUNTERS). */
  list(groupId: string): Promise<{ schedules: StoredSchedule[]; revision: number }>;
  get(groupId: string, scheduleId: string): Promise<StoredSchedule | undefined>;
  /** GRP-64: com o limite e a revisão lida. `stale` = outra escrita mudou os horários (relê e confere de novo). */
  create(
    schedule: Omit<StoredSchedule, 'version'>,
    revision: number,
    max: number,
  ): Promise<'created' | 'stale'>;
  /** GRP-67: o horário inteiro, na versão esperada e na revisão lida. */
  update(
    groupId: string,
    scheduleId: string,
    fields: ScheduleInput,
    expectedVersion: number,
    revision: number,
  ): Promise<StoredSchedule | 'stale'>;
  /** GRP-67: o último ativo não é arquivado (`SCHEDULE_LAST`); já arquivado → como está. */
  archive(groupId: string, scheduleId: string, expectedVersion: number, at: string): Promise<StoredSchedule>;
  /** GRP-67: volta, com o limite e a revisão lida; já ativo → como está. */
  unarchive(
    groupId: string,
    scheduleId: string,
    expectedVersion: number,
    revision: number,
    max: number,
  ): Promise<StoredSchedule | 'stale'>;
}

/** Os campos do horário que a gravação substitui (GRP-67: o horário é salvo inteiro). */
const OPTIONAL = ['placeId', 'slots', 'minPlayers'] as const;

/**
 * A revisão dos horários no COUNTERS (GRP-65): confere a lida e soma 1; com `delta`, mexe também na contagem dos
 * ativos (com o limite, ao somar; com "fica pelo menos 1", ao tirar).
 */
export function revisionItem(
  groupId: string,
  revision: number,
  delta: -1 | 0 | 1,
  max?: number,
): TransactItem {
  const conditions = [
    revision === 0
      ? '(attribute_not_exists(scheduleRevision) OR scheduleRevision = :rev)'
      : 'scheduleRevision = :rev',
    ...(delta === 1 ? ['(attribute_not_exists(scheduleCount) OR scheduleCount < :max)'] : []),
  ];
  return {
    Update: {
      TableName: tableName(),
      Key: groupCountersKey(groupId),
      UpdateExpression:
        delta === 0 ? 'ADD scheduleRevision :one' : 'ADD scheduleRevision :one, scheduleCount :delta',
      ConditionExpression: conditions.join(' AND '),
      ExpressionAttributeValues: {
        ':rev': revision,
        ':one': 1,
        ...(delta !== 0 && { ':delta': delta }),
        ...(delta === 1 && { ':max': max }),
      },
    },
  };
}

async function read(groupId: string, scheduleId: string): Promise<StoredSchedule | undefined> {
  const { Item } = await dynamo().send(
    new GetCommand({ TableName: tableName(), Key: scheduleKey(groupId, scheduleId), ConsistentRead: true }),
  );
  return Item ? stripKeys<StoredSchedule>(Item) : undefined;
}

async function mustRead(groupId: string, scheduleId: string): Promise<StoredSchedule> {
  const found = await read(groupId, scheduleId);
  if (!found) throw appError('SCHEDULE_NOT_FOUND');
  return found;
}

async function counters(groupId: string): Promise<{ revision: number; count: number }> {
  const { Item } = await dynamo().send(
    new GetCommand({ TableName: tableName(), Key: groupCountersKey(groupId), ConsistentRead: true }),
  );
  return { revision: Number(Item?.scheduleRevision ?? 0), count: Number(Item?.scheduleCount ?? 0) };
}

/** A transação falhou: a versão (conflito), a revisão (`stale`) ou o limite. */
async function failureOf(
  groupId: string,
  scheduleId: string,
  expectedVersion: number,
  revision: number,
  max?: number,
): Promise<'stale'> {
  const current = await currentVersion(scheduleKey(groupId, scheduleId));
  if (current === 0) throw appError('SCHEDULE_NOT_FOUND');
  if (current !== expectedVersion) throw await versionConflict(async () => current);
  const c = await counters(groupId);
  if (c.revision !== revision) return 'stale';
  if (max !== undefined && c.count >= max) throw appError('SCHEDULE_LIMIT_REACHED', { max });
  return 'stale';
}

async function querySchedules(
  groupId: string,
  startKey?: Record<string, unknown>,
): Promise<StoredSchedule[]> {
  const { Items = [], LastEvaluatedKey } = await dynamo().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': groupPk(groupId), ':prefix': SCHEDULE_SK_PREFIX },
      ConsistentRead: true,
      ...(startKey && { ExclusiveStartKey: startKey }),
    }),
  );
  const page = Items.map((row) => stripKeys<StoredSchedule>(row));
  return LastEvaluatedKey ? [...page, ...(await querySchedules(groupId, LastEvaluatedKey))] : page;
}

/** Por dia da semana e início. */
export function byWeekdayAndStart(
  a: Pick<Schedule, 'weekday' | 'start'>,
  b: Pick<Schedule, 'weekday' | 'start'>,
) {
  return a.weekday - b.weekday || minutesOf(a.start) - minutesOf(b.start);
}

export const dynamoScheduleRepository: ScheduleRepository = {
  async list(groupId) {
    const [schedules, c] = await Promise.all([querySchedules(groupId), counters(groupId)]);
    return { schedules: schedules.sort(byWeekdayAndStart), revision: c.revision };
  },

  get: read,

  async create(schedule, revision, max) {
    const result = await transactWrite([
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(
            scheduleKey(schedule.groupId, schedule.id),
            SCHEDULE_ENTITY,
            schedule,
            schedule.createdAt,
          ),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      revisionItem(schedule.groupId, revision, 1, max),
    ]);
    if (result.ok) return 'created';
    const c = await counters(schedule.groupId);
    if (c.revision === revision && c.count >= max) throw appError('SCHEDULE_LIMIT_REACHED', { max });
    return 'stale';
  },

  async update(groupId, scheduleId, fields, expectedVersion, revision) {
    const key = scheduleKey(groupId, scheduleId);
    const set = Object.entries(fields).filter(([, v]) => v !== undefined);
    const remove = OPTIONAL.filter((k) => fields[k] === undefined);
    const update = withVersion(
      touch({
        TableName: tableName(),
        Key: key,
        UpdateExpression: [
          `SET ${set.map(([k]) => `#${k} = :${k}`).join(', ')}`,
          ...(remove.length > 0 ? [`REMOVE ${remove.map((k) => `#${k}`).join(', ')}`] : []),
        ].join(' '),
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: Object.fromEntries(
          [...set.map(([k]) => k), ...remove].map((k) => [`#${k}`, k]),
        ),
        ExpressionAttributeValues: Object.fromEntries(set.map(([k, v]) => [`:${k}`, v])),
      }),
      expectedVersion,
    );
    const result = await transactWrite([{ Update: update }, revisionItem(groupId, revision, 0)]);
    if (result.ok) return mustRead(groupId, scheduleId);
    return failureOf(groupId, scheduleId, expectedVersion, revision);
  },

  async archive(groupId, scheduleId, expectedVersion, at) {
    const found = await mustRead(groupId, scheduleId);
    if (found.archivedAt) return found;
    // [0] o horário (ativo, na versão), [1] fica pelo menos um ativo (GRP-67), soma a revisão.
    const result = await transactWrite([
      {
        Update: withVersion(
          touch({
            TableName: tableName(),
            Key: scheduleKey(groupId, scheduleId),
            UpdateExpression: 'SET archivedAt = :at',
            ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(archivedAt)',
            ExpressionAttributeValues: { ':at': at },
          }),
          expectedVersion,
        ),
      },
      {
        Update: {
          TableName: tableName(),
          Key: groupCountersKey(groupId),
          UpdateExpression: 'ADD scheduleRevision :one, scheduleCount :minus',
          ConditionExpression: 'scheduleCount > :one',
          ExpressionAttributeValues: { ':one': 1, ':minus': -1 },
        },
      },
    ]);
    if (result.ok) return mustRead(groupId, scheduleId);
    if (result.failed.includes(1) && !result.failed.includes(0)) throw appError('SCHEDULE_LAST');
    const current = await currentVersion(scheduleKey(groupId, scheduleId));
    throw await versionConflict(async () => current);
  },

  async unarchive(groupId, scheduleId, expectedVersion, revision, max) {
    const found = await mustRead(groupId, scheduleId);
    if (!found.archivedAt) return found;
    const result = await transactWrite([
      {
        Update: withVersion(
          touch({
            TableName: tableName(),
            Key: scheduleKey(groupId, scheduleId),
            UpdateExpression: 'REMOVE archivedAt',
            ConditionExpression: 'attribute_exists(archivedAt)',
          }),
          expectedVersion,
        ),
      },
      revisionItem(groupId, revision, 1, max),
    ]);
    if (result.ok) return mustRead(groupId, scheduleId);
    return failureOf(groupId, scheduleId, expectedVersion, revision, max);
  },
};
