import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  COUNTERS_ENTITY,
  dbItem,
  isConditionFailed,
  LOOKUP_ENTITY,
  replaceItem,
  sendVersioned,
  stripKeys,
  type TransactItem,
  touch,
  transactWrite,
  withVersion,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import type { GroupId, UserId } from '@scorely/api/src/lib/ids';
import {
  MATCH_ATTENDANCE_ENTITY,
  MATCH_ENTITY,
  MATCH_GUEST_ENTITY,
  MATCH_PREFIX,
  matchAttendanceKey,
  matchAttendancePrefix,
  matchGuestKey,
  matchGuestNameKey,
  matchGuestPrefix,
  matchGuestsCounterKey,
  matchKey,
} from '@scorely/api/src/modules/matches/match.table';
import type { AdvanceMatchWave, AttendanceStatus, MatchWave } from '@scorely/contracts';

/** A partida como fica no banco (PAR-01, seção 3 do doc). Interna da api. */
export interface StoredMatch {
  id: string;
  groupId: GroupId;
  createdAt: string;
  updatedAt: string;
  version: number;
  startsAt: string;
  endsAt: string;
  note?: string | undefined;
  teams: number;
  playersPerTeam: number;
  membersHours: number;
  reservesHours: number;
  /** Ausente = a onda de convidados desligada (PAR-03). */
  guestsHours?: number | undefined;
  closeHours: number;
  /** A maior onda já aberta à mão ou guardada por uma edição (PAR-05, 06): a onda nunca volta. */
  advancedTo?: MatchWave | undefined;
  cancelledAt?: string | undefined;
  createdBy: UserId;
}

/** A resposta (PAR-08), `GROUP#<g> / MATCHATT#<matchId>#<userId>`. Entidade de relação. */
export interface StoredAttendance {
  groupId: GroupId;
  matchId: string;
  userId: UserId;
  status: AttendanceStatus;
  /** A hora da resposta atual, que dá a ordem (PAR-09). */
  respondedAt: string;
  createdAt: string;
}

/** O convidado (PAR-11), `GROUP#<g> / MATCHGUEST#<matchId>#<guestId>`. A situação sai dos campos de cada passo. */
export interface StoredGuest {
  id: string;
  groupId: GroupId;
  matchId: string;
  name: string;
  normalizedName: string;
  requestedBy: UserId;
  createdAt: string;
  updatedAt: string;
  version: number;
  approvedAt?: string | undefined;
  approvedBy?: UserId | undefined;
  declinedAt?: string | undefined;
  declinedBy?: UserId | undefined;
  cancelledAt?: string | undefined;
  removedAt?: string | undefined;
  removedBy?: UserId | undefined;
}

/** PAR-11: de `pending` para `approve`, `decline` ou `cancel`; de `approved` para `remove`. */
export type GuestTransition = 'approve' | 'decline' | 'cancel' | 'remove';

export type RequestGuestResult = 'ok' | 'duplicate' | 'limit';

export interface MatchRepository {
  createMatch(match: StoredMatch): Promise<void>;
  getMatch(
    groupId: GroupId,
    matchId: string,
    opts?: { consistent?: boolean },
  ): Promise<StoredMatch | undefined>;
  /** PAR-15: as que não terminaram (`endsAt` depois de `endsAfter`). */
  listMatches(groupId: GroupId, endsAfter: Date): Promise<StoredMatch[]>;
  /** PAR-06: grava a partida inteira se a `version` for a esperada; senão `VERSION_CONFLICT`. */
  updateMatch(match: StoredMatch, expectedVersion: number, at: Date): Promise<StoredMatch>;
  /** PAR-05: `false` = já estava nessa onda ou numa maior (a onda nunca volta). */
  advanceMatch(groupId: GroupId, matchId: string, wave: AdvanceMatchWave, at: Date): Promise<boolean>;
  /** PAR-07: `false` = já cancelada. */
  cancelMatch(groupId: GroupId, matchId: string, at: Date): Promise<boolean>;
  listAttendances(
    groupId: GroupId,
    matchId: string,
    opts?: { consistent?: boolean },
  ): Promise<StoredAttendance[]>;
  putAttendance(attendance: StoredAttendance): Promise<void>;
  listGuests(groupId: GroupId, matchId: string, opts?: { consistent?: boolean }): Promise<StoredGuest[]>;
  getGuest(
    groupId: GroupId,
    matchId: string,
    guestId: string,
    opts?: { consistent?: boolean },
  ): Promise<StoredGuest | undefined>;
  /** PAR-12: numa transação, o convidado, o nome (único entre os ativos) e o contador (`active < max`). */
  requestGuest(guest: StoredGuest, max: number): Promise<RequestGuestResult>;
  /** PAR-11, 13, 14: `false` = a situação de origem mudou. Recusar, cancelar e remover liberam o nome e o contador. */
  transitionGuest(input: {
    guest: StoredGuest;
    transition: GuestTransition;
    by: UserId;
    at: Date;
  }): Promise<boolean>;
}

const PENDING_CONDITION =
  'attribute_exists(PK) AND attribute_not_exists(approvedAt) AND attribute_not_exists(declinedAt) AND attribute_not_exists(cancelledAt)';
const APPROVED_CONDITION = 'attribute_exists(approvedAt) AND attribute_not_exists(removedAt)';

/** O que cada passo grava no convidado (PAR-11). */
function transitionSet(transition: GuestTransition): { set: string; withBy: boolean; condition: string } {
  switch (transition) {
    case 'approve':
      return { set: 'approvedAt = :at, approvedBy = :by', withBy: true, condition: PENDING_CONDITION };
    case 'decline':
      return { set: 'declinedAt = :at, declinedBy = :by', withBy: true, condition: PENDING_CONDITION };
    case 'cancel':
      return { set: 'cancelledAt = :at', withBy: false, condition: PENDING_CONDITION };
    case 'remove':
      return { set: 'removedAt = :at, removedBy = :by', withBy: true, condition: APPROVED_CONDITION };
  }
}

async function getItem(
  Key: Record<string, string>,
  consistent = false,
): Promise<Record<string, unknown> | undefined> {
  const { Item } = await dynamo().send(
    new GetCommand({ TableName: tableName(), Key, ConsistentRead: consistent }),
  );
  return Item;
}

async function queryByPrefix(
  pk: string,
  prefix: string,
  opts: { consistent?: boolean; endsAfter?: string } = {},
  startKey?: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const { Items = [], LastEvaluatedKey } = await dynamo().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': pk,
        ':prefix': prefix,
        ...(opts.endsAfter !== undefined && { ':endsAfter': opts.endsAfter }),
      },
      ...(opts.endsAfter !== undefined && { FilterExpression: 'endsAt > :endsAfter' }),
      ConsistentRead: opts.consistent,
      ...(startKey && { ExclusiveStartKey: startKey }),
    }),
  );
  return LastEvaluatedKey ? [...Items, ...(await queryByPrefix(pk, prefix, opts, LastEvaluatedKey))] : Items;
}

const groupPk = (groupId: GroupId) => matchKey(groupId, '').PK;

/** Os campos que a edição pode deixar ausentes (o `replaceItem` apaga). */
const MATCH_OPTIONAL = ['note', 'guestsHours', 'advancedTo', 'cancelledAt'] as const;

export const dynamoMatchRepository: MatchRepository = {
  async createMatch(match) {
    await dynamo().send(
      new PutCommand({
        TableName: tableName(),
        Item: dbItem(matchKey(match.groupId, match.id), MATCH_ENTITY, match),
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
  },

  async getMatch(groupId, matchId, opts) {
    const item = await getItem(matchKey(groupId, matchId), opts?.consistent);
    return item ? stripKeys<StoredMatch>(item) : undefined;
  },

  async listMatches(groupId, endsAfter) {
    const rows = await queryByPrefix(groupPk(groupId), MATCH_PREFIX, { endsAfter: endsAfter.toISOString() });
    return rows.map((row) => stripKeys<StoredMatch>(row));
  },

  async updateMatch(match, expectedVersion, at) {
    const key = matchKey(match.groupId, match.id);
    const { version: _v, updatedAt: _u, ...data } = match;
    const update = replaceItem(key, MATCH_ENTITY, { ...data, updatedAt: at.toISOString() }, MATCH_OPTIONAL);
    const result = await sendVersioned(key, () =>
      dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          ...withVersion({ ...update, ConditionExpression: 'attribute_exists(PK)' }, expectedVersion),
          ReturnValues: 'ALL_NEW',
        }),
      ),
    );
    return stripKeys<StoredMatch>(result.Attributes ?? {});
  },

  async advanceMatch(groupId, matchId, wave, at) {
    // A onda só sobe: `reserves` sobre nada ou `members`; `guests` sobre tudo menos ela mesma.
    const condition =
      wave === 'reserves'
        ? 'attribute_exists(PK) AND (attribute_not_exists(advancedTo) OR advancedTo = :lower)'
        : 'attribute_exists(PK) AND (attribute_not_exists(advancedTo) OR advancedTo <> :wave)';
    try {
      await dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          ...touch(
            {
              Key: matchKey(groupId, matchId),
              UpdateExpression: 'SET advancedTo = :wave',
              ConditionExpression: condition,
              ExpressionAttributeValues: {
                ':wave': wave,
                ...(wave === 'reserves' && { ':lower': 'members' }),
              },
            },
            at,
          ),
        }),
      );
      return true;
    } catch (err) {
      if (isConditionFailed(err)) return false;
      throw err;
    }
  },

  async cancelMatch(groupId, matchId, at) {
    try {
      await dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          ...touch(
            {
              Key: matchKey(groupId, matchId),
              UpdateExpression: 'SET cancelledAt = :at',
              ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(cancelledAt)',
              ExpressionAttributeValues: { ':at': at.toISOString() },
            },
            at,
          ),
        }),
      );
      return true;
    } catch (err) {
      if (isConditionFailed(err)) return false;
      throw err;
    }
  },

  async listAttendances(groupId, matchId, opts) {
    const rows = await queryByPrefix(groupPk(groupId), matchAttendancePrefix(matchId), opts);
    return rows.map((row) => stripKeys<StoredAttendance>(row));
  },

  async putAttendance(attendance) {
    // Entidade de relação que muda: `replaceItem` mantém o `createdAt` da primeira resposta e soma a `version`.
    const key = matchAttendanceKey(attendance.groupId, attendance.matchId, attendance.userId);
    await dynamo().send(
      new UpdateCommand({
        TableName: tableName(),
        ...replaceItem(key, MATCH_ATTENDANCE_ENTITY, {
          ...attendance,
          updatedAt: attendance.respondedAt,
        }),
      }),
    );
  },

  async listGuests(groupId, matchId, opts) {
    const rows = await queryByPrefix(groupPk(groupId), matchGuestPrefix(matchId), opts);
    return rows.map((row) => stripKeys<StoredGuest>(row));
  },

  async getGuest(groupId, matchId, guestId, opts) {
    const item = await getItem(matchGuestKey(groupId, matchId, guestId), opts?.consistent);
    return item ? stripKeys<StoredGuest>(item) : undefined;
  },

  async requestGuest(guest, max) {
    const { groupId, matchId } = guest;
    // Índice 1: o nome repetido; índice 2: o limite.
    const result = await transactWrite([
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(matchGuestKey(groupId, matchId, guest.id), MATCH_GUEST_ENTITY, guest),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(
            matchGuestNameKey(groupId, matchId, guest.normalizedName),
            LOOKUP_ENTITY,
            { id: guest.id },
            guest.createdAt,
          ),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Update: {
          TableName: tableName(),
          Key: matchGuestsCounterKey(groupId, matchId),
          UpdateExpression:
            'SET #entity = :entity, createdAt = if_not_exists(createdAt, :createdAt) ADD active :one',
          ConditionExpression: 'attribute_not_exists(active) OR active < :max',
          ExpressionAttributeNames: { '#entity': 'entity' },
          ExpressionAttributeValues: {
            ':entity': COUNTERS_ENTITY,
            ':createdAt': guest.createdAt,
            ':one': 1,
            ':max': max,
          },
        },
      },
    ]);
    if (result.ok) return 'ok';
    if (result.failed.includes(1)) return 'duplicate';
    if (result.failed.includes(2)) return 'limit';
    throw new Error('Guest request failed');
  },

  async transitionGuest({ guest, transition, by, at }) {
    const { groupId, matchId } = guest;
    const step = transitionSet(transition);
    const frees = transition !== 'approve';
    const items: TransactItem[] = [
      {
        Update: {
          TableName: tableName(),
          ...touch(
            {
              Key: matchGuestKey(groupId, matchId, guest.id),
              UpdateExpression: `SET ${step.set}`,
              ConditionExpression: step.condition,
              ExpressionAttributeValues: {
                ':at': at.toISOString(),
                ...(step.withBy && { ':by': by }),
              },
            },
            at,
          ),
        },
      },
      ...(frees
        ? [
            {
              Delete: {
                TableName: tableName(),
                Key: matchGuestNameKey(groupId, matchId, guest.normalizedName),
              },
            },
            {
              Update: {
                TableName: tableName(),
                Key: matchGuestsCounterKey(groupId, matchId),
                UpdateExpression: 'ADD active :minus',
                ConditionExpression: 'attribute_exists(PK)',
                ExpressionAttributeValues: { ':minus': -1 },
              },
            },
          ]
        : []),
    ];
    const result = await transactWrite(items);
    if (result.ok) return true;
    if (result.failed.includes(0)) return false;
    throw new Error('Guest transition failed');
  },
};
