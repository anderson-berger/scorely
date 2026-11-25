import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  batchGetOrdered,
  COUNTERS_ENTITY,
  currentVersion,
  dbItem,
  decodeCursor,
  encodeCursor,
  isConditionFailed,
  LOOKUP_ENTITY,
  type Page,
  replaceItem,
  sendVersioned,
  setCreatedAtIfNew,
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
  MATCH_AGENDA_CURSOR_KEY,
  MATCH_ATTENDANCE_ENTITY,
  MATCH_END_PREFIX,
  MATCH_ENTITY,
  MATCH_GUEST_ENTITY,
  MATCH_PREFIX,
  MATCH_RESULT_ENTITY,
  MATCH_SERIES_ENTITY,
  MATCH_SERIES_PREFIX,
  MATCH_TEAMS_ENTITY,
  matchAgendaKey,
  matchAgendaPk,
  matchAttendanceKey,
  matchAttendancePrefix,
  matchEndKey,
  matchGuestKey,
  matchGuestNameKey,
  matchGuestPrefix,
  matchGuestsCounterKey,
  matchKey,
  matchResultKey,
  matchSeriesKey,
  matchTeamsKey,
  ROUTINE_ENTITY,
} from '@scorely/api/src/modules/matches/match.table';
import type {
  AdvanceMatchWave,
  AttendanceStatus,
  MatchDayWinner,
  MatchGameWinner,
  MatchResultMode,
  MatchWave,
  PublicGroupId,
} from '@scorely/contracts';

/** PAR-16: a hora (ISO) em que cada onda abriu antes da hora configurada. */
export type MatchOpenedAt = Partial<Record<MatchWave, string>>;

/** A partida como fica no banco (PAR-01, seção 3 do doc). Interna da api. */
export interface StoredMatch {
  id: string;
  groupId: GroupId;
  createdAt: string;
  updatedAt: string;
  version: number;
  startsAt: string;
  endsAt: string;
  /** O formato, os dois ou nenhum (sem formato = sem limite, PAR-02). */
  teams?: number | undefined;
  playersPerTeam?: number | undefined;
  /** As horas da abertura (PAR-03); ausente = não configurada. */
  membersHours?: number | undefined;
  reservesHours?: number | undefined;
  guestsHours?: number | undefined;
  /** "Sem convidados" (PAR-03, 12). */
  noGuests: boolean;
  closeHours: number;
  /** A maior onda já aberta à mão ou guardada por uma edição (PAR-05, 06): a onda nunca volta. */
  advancedTo?: MatchWave | undefined;
  /**
   * A hora em que cada onda abriu antes da hora configurada (PAR-16): gravada junto com o `advancedTo`, só para as
   * ondas que ele abriu, e nunca regravada.
   */
  openedAt?: MatchOpenedAt | undefined;
  /** A maior onda já avisada (PAR-24); ausente = nenhuma. */
  notifiedWave?: MatchWave | undefined;
  /** A repetição de onde a partida saiu e o dia previsto dela, no fuso da repetição (PAR-21). */
  seriesId?: string | undefined;
  seriesDate?: string | undefined;
  /** Como a tela do resultado abre (PAR-31). */
  resultMode: MatchResultMode;
  cancelledAt?: string | undefined;
  createdBy: UserId;
}

/** A repetição (PAR-20), `GROUP#<g> / MATCHSERIES#<seriesId>`. */
export interface StoredSeries {
  id: string;
  groupId: GroupId;
  createdAt: string;
  updatedAt: string;
  version: number;
  /** 1 a 7, de segunda a domingo. */
  weekday: number;
  /** `HH:mm`, no fuso. */
  time: string;
  durationMinutes: number;
  timeZone: string;
  teams?: number | undefined;
  playersPerTeam?: number | undefined;
  membersHours?: number | undefined;
  reservesHours?: number | undefined;
  guestsHours?: number | undefined;
  noGuests: boolean;
  closeHours: number;
  /** O jeito do resultado das partidas que ela cria (PAR-21, 31). */
  resultMode: MatchResultMode;
  /** A próxima partida e o dia previsto dela (PAR-21). */
  currentMatchId: string;
  currentDate: string;
  endedAt?: string | undefined;
  createdBy: UserId;
}

/**
 * Um item da agenda (PAR-21, 24): "olhe esta partida neste instante". Leva o id público e o nome do grupo para a
 * rotina montar o aviso sem ler o grupo (o nome não muda, GRV-01).
 */
export interface AgendaEntry {
  at: string;
  groupId: GroupId;
  matchId: string;
  publicId: PublicGroupId;
  groupName: string;
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

/** Uma pessoa num time (PAR-25): o `UserId` do sistema, ou o id do convidado. */
export interface StoredTeamPlayer {
  kind: 'user' | 'guest';
  id: string;
}

/**
 * Os times da partida (PAR-25), `GROUP#<g> / MATCHTEAMS#<matchId>`. Um item por partida. Não guarda "sem time" nem
 * "saiu da lista": os dois são calculados ao ler (PAR-28).
 */
export interface StoredTeams {
  groupId: GroupId;
  matchId: string;
  teams: StoredTeamPlayer[][];
  createdAt: string;
  createdBy: UserId;
  updatedAt: string;
  updatedBy: UserId;
  version: number;
}

/** O que o resultado registra (PAR-33, 34), com as pessoas como nos times (`StoredTeamPlayer`). */
export type StoredResultData =
  | { mode: 'day'; teams: StoredTeamPlayer[][]; winner: MatchDayWinner }
  | {
      mode: 'games';
      games: { teams: [StoredTeamPlayer[], StoredTeamPlayer[]]; winner: MatchGameWinner }[];
    };

/**
 * O resultado da partida (PAR-31–35), `GROUP#<g> / MATCHRESULT#<matchId>`. Um item por partida; registrar de novo
 * troca o item inteiro, inclusive o jeito. A contagem e quem venceu o dia são calculados ao ler.
 */
export type StoredResult = StoredResultData & {
  groupId: GroupId;
  matchId: string;
  createdAt: string;
  createdBy: UserId;
  updatedAt: string;
  updatedBy: UserId;
  version: number;
};

/** Uma partida do histórico (PAR-36), com o resultado dela, se houver. */
export interface HistoryEntry {
  match: StoredMatch;
  result?: StoredResult | undefined;
}

/** PAR-11: de `pending` para `approve`, `decline` ou `cancel`; de `approved` para `remove`. */
export type GuestTransition = 'approve' | 'decline' | 'cancel' | 'remove';

export type RequestGuestResult = 'ok' | 'duplicate' | 'limit';

export interface MatchRepository {
  /** PAR-01, 20: a partida e, juntos, a repetição dela e os itens da agenda. */
  createMatch(
    match: StoredMatch,
    extras?: { series?: StoredSeries; agenda?: readonly AgendaEntry[] },
  ): Promise<void>;
  getMatch(
    groupId: GroupId,
    matchId: string,
    opts?: { consistent?: boolean },
  ): Promise<StoredMatch | undefined>;
  /** PAR-15: as que não terminaram (`endsAt` depois de `endsAfter`). */
  listMatches(groupId: GroupId, endsAfter: Date): Promise<StoredMatch[]>;
  /**
   * PAR-06: grava a partida inteira se a `version` for a esperada; senão `VERSION_CONFLICT`. O `notifiedWave` fica
   * como está no banco, a não ser com `resetNotified` (a primeira configuração da abertura, PAR-24). Com `agenda`, os
   * itens da agenda vão na mesma transação (PAR-21, 24): conflito não grava nada; regravar mantém o `createdAt`.
   * `previousEndsAt` é o fim que a partida tinha: se mudou, o índice do histórico (PAR-36) troca na mesma transação.
   */
  updateMatch(
    match: StoredMatch,
    expectedVersion: number,
    at: Date,
    opts?: { resetNotified?: boolean; agenda?: readonly AgendaEntry[]; previousEndsAt?: string },
  ): Promise<StoredMatch>;
  /**
   * PAR-05, 16: grava a onda aberta e, junto, o `openedAt` inteiro. `false` = já estava nessa onda ou numa maior (a
   * onda nunca volta), e nada muda.
   */
  advanceMatch(
    groupId: GroupId,
    matchId: string,
    wave: AdvanceMatchWave,
    openedAt: MatchOpenedAt,
    at: Date,
  ): Promise<boolean>;
  /** PAR-07: `false` = já cancelada. */
  cancelMatch(groupId: GroupId, matchId: string, at: Date): Promise<boolean>;
  /**
   * PAR-24: grava `notifiedWave = to` se ele ainda é `from`; `false` = outro já gravou (e avisou). Não soma a
   * `version`: é controle interno, e quem tem a partida aberta não mudou nada.
   */
  markNotified(
    groupId: GroupId,
    matchId: string,
    from: MatchWave | undefined,
    to: MatchWave,
  ): Promise<boolean>;
  getSeries(
    groupId: GroupId,
    seriesId: string,
    opts?: { consistent?: boolean },
  ): Promise<StoredSeries | undefined>;
  /** PAR-20, 21: as repetições do grupo, encerradas incluídas. */
  listSeries(groupId: GroupId): Promise<StoredSeries[]>;
  /** PAR-22: grava a repetição inteira se a `version` for a esperada; senão `VERSION_CONFLICT`. */
  updateSeries(series: StoredSeries, expectedVersion: number, at: Date): Promise<StoredSeries>;
  /** PAR-23: `false` = já encerrada. */
  endSeries(groupId: GroupId, seriesId: string, at: Date): Promise<boolean>;
  /**
   * PAR-21: numa transação, a partida nova, a agenda dela e a repetição apontando para ela, se a repetição ainda
   * aponta para `previousMatchId` e não foi encerrada. `false` = outro já criou (ou encerrou).
   */
  createNextMatch(input: {
    match: StoredMatch;
    previousMatchId: string;
    agenda: readonly AgendaEntry[];
    at: Date;
  }): Promise<boolean>;
  /** Os itens com instante até `to`, das partições da hora de `from` à de `to` (UTC). */
  listAgenda(from: Date, to: Date): Promise<AgendaEntry[]>;
  deleteAgenda(entry: AgendaEntry): Promise<void>;
  /** Até onde a rotina já leu a agenda. */
  getAgendaCursor(): Promise<string | undefined>;
  setAgendaCursor(at: Date): Promise<void>;
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
  getTeams(
    groupId: GroupId,
    matchId: string,
    opts?: { consistent?: boolean },
  ): Promise<StoredTeams | undefined>;
  /**
   * PAR-25, 29: troca a divisão inteira se a `version` for a esperada (0 = ainda não há times: cria); senão
   * `VERSION_CONFLICT`. `created` = este salvar criou o item (quem ganha a criação avisa).
   */
  saveTeams(input: {
    groupId: GroupId;
    matchId: string;
    teams: StoredTeamPlayer[][];
    by: UserId;
    at: Date;
    expectedVersion: number;
  }): Promise<{ teams: StoredTeams; created: boolean }>;
  getResult(
    groupId: GroupId,
    matchId: string,
    opts?: { consistent?: boolean },
  ): Promise<StoredResult | undefined>;
  /**
   * PAR-32: troca o resultado inteiro se a `version` for a esperada (0 = ainda não há resultado: cria); senão
   * `VERSION_CONFLICT`.
   */
  saveResult(input: {
    groupId: GroupId;
    matchId: string;
    result: StoredResultData;
    by: UserId;
    at: Date;
    expectedVersion: number;
  }): Promise<StoredResult>;
  /**
   * PAR-36: as partidas que terminaram até `endedBy` (o fim em ou antes dele), da que terminou por último para a
   * primeira, com o resultado de cada uma, em páginas de `limit`. O cursor é opaco; um inválido é `INVALID_CURSOR`.
   */
  listHistory(
    groupId: GroupId,
    endedBy: Date,
    opts: { limit: number; cursor?: string | undefined },
  ): Promise<Page<HistoryEntry>>;
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
const MATCH_OPTIONAL = [
  'teams',
  'playersPerTeam',
  'membersHours',
  'reservesHours',
  'guestsHours',
  'advancedTo',
  'openedAt',
  'cancelledAt',
] as const;

/** Os campos que a edição da repetição pode deixar ausentes (PAR-22). */
const SERIES_OPTIONAL = ['teams', 'playersPerTeam', 'membersHours', 'reservesHours', 'guestsHours'] as const;

const HOUR_MS = 3_600_000;
/** PAR-21, 24: o item da agenda some sozinho 7 dias depois do instante, se a rotina não apagou (ADR 0004). */
const AGENDA_TTL_MS = 7 * 24 * HOUR_MS;

/** `createdAt`: quando o item foi gravado (o da partida, na mesma transação), não o instante dele. */
function agendaPut(entry: AgendaEntry, createdAt: string) {
  return {
    TableName: tableName(),
    Item: {
      ...dbItem(matchAgendaKey(entry.at, entry.groupId, entry.matchId), LOOKUP_ENTITY, entry, createdAt),
      ttl: ttlFrom(new Date(Date.parse(entry.at) + AGENDA_TTL_MS)),
    },
  };
}

function agendaUpsert(entry: AgendaEntry, at: Date) {
  const created = setCreatedAtIfNew(at);
  const fields: Record<string, unknown> = {
    ...entry,
    entity: LOOKUP_ENTITY,
    ttl: ttlFrom(new Date(Date.parse(entry.at) + AGENDA_TTL_MS)),
  };
  const names = Object.keys(fields);
  return {
    TableName: tableName(),
    Key: matchAgendaKey(entry.at, entry.groupId, entry.matchId),
    UpdateExpression: `SET ${[...names.map((name) => `#${name} = :${name}`), created.expression].join(', ')}`,
    ExpressionAttributeNames: Object.fromEntries(names.map((name) => [`#${name}`, name])),
    ExpressionAttributeValues: {
      ...Object.fromEntries(names.map((name) => [`:${name}`, fields[name]])),
      ...created.values,
    },
  };
}

const seriesPut = (series: StoredSeries) => ({
  TableName: tableName(),
  Item: dbItem(matchSeriesKey(series.groupId, series.id), MATCH_SERIES_ENTITY, series),
  ConditionExpression: 'attribute_not_exists(PK)',
});

const matchPut = (match: StoredMatch) => ({
  TableName: tableName(),
  Item: dbItem(matchKey(match.groupId, match.id), MATCH_ENTITY, match),
  ConditionExpression: 'attribute_not_exists(PK)',
});

/** PAR-36: o índice do histórico, gravado com a partida (o `createdAt` é o dela). */
const endPut = (match: Pick<StoredMatch, 'groupId' | 'id' | 'endsAt' | 'createdAt'>) => ({
  TableName: tableName(),
  Item: dbItem(
    matchEndKey(match.groupId, match.endsAt, match.id),
    LOOKUP_ENTITY,
    { matchId: match.id },
    match.createdAt,
  ),
});

/** Os campos do resultado que um jeito tem e o outro não (registrar de outro jeito apaga os do anterior). */
const RESULT_OPTIONAL = ['teams', 'winner', 'games'] as const;

/** As horas (`AAAA-MM-DDTHH`, UTC) de `from` até `to`. */
function hoursBetween(from: Date, to: Date): string[] {
  const first = Math.floor(from.getTime() / HOUR_MS);
  const last = Math.floor(to.getTime() / HOUR_MS);
  return last < first
    ? []
    : Array.from({ length: last - first + 1 }, (_, i) => new Date((first + i) * HOUR_MS).toISOString());
}

/** Os itens de uma partição da agenda com instante até `to`. */
async function agendaHour(
  hour: string,
  to: string,
  startKey?: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const { Items = [], LastEvaluatedKey } = await dynamo().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND SK <= :to',
      ExpressionAttributeValues: { ':pk': matchAgendaPk(hour), ':to': `${to}#~` },
      ...(startKey && { ExclusiveStartKey: startKey }),
    }),
  );
  return LastEvaluatedKey ? [...Items, ...(await agendaHour(hour, to, LastEvaluatedKey))] : Items;
}

export const dynamoMatchRepository: MatchRepository = {
  async createMatch(match, extras = {}) {
    const agenda = extras.agenda ?? [];
    const result = await transactWrite([
      { Put: matchPut(match) },
      { Put: endPut(match) },
      ...(extras.series ? [{ Put: seriesPut(extras.series) }] : []),
      ...agenda.map((entry) => ({ Put: agendaPut(entry, match.createdAt) })),
    ]);
    if (!result.ok) throw new Error('Match create failed');
  },

  async getMatch(groupId, matchId, opts) {
    const item = await getItem(matchKey(groupId, matchId), opts?.consistent);
    return item ? stripKeys<StoredMatch>(item) : undefined;
  },

  async listMatches(groupId, endsAfter) {
    const rows = await queryByPrefix(groupPk(groupId), MATCH_PREFIX, { endsAfter: endsAfter.toISOString() });
    return rows.map((row) => stripKeys<StoredMatch>(row));
  },

  async updateMatch(match, expectedVersion, at, opts = {}) {
    const key = matchKey(match.groupId, match.id);
    const { version: _v, updatedAt: _u, notifiedWave, ...data } = match;
    const update = opts.resetNotified
      ? replaceItem(key, MATCH_ENTITY, { ...data, notifiedWave, updatedAt: at.toISOString() }, [
          ...MATCH_OPTIONAL,
          'notifiedWave',
        ])
      : replaceItem(key, MATCH_ENTITY, { ...data, updatedAt: at.toISOString() }, MATCH_OPTIONAL);
    const agenda = opts.agenda ?? [];
    // PAR-36: o fim mudou, o índice do histórico troca (o antigo sai, o novo entra).
    const ends =
      opts.previousEndsAt !== undefined && opts.previousEndsAt !== match.endsAt
        ? [
            {
              Delete: {
                TableName: tableName(),
                Key: matchEndKey(match.groupId, opts.previousEndsAt, match.id),
              },
            },
            { Put: endPut(match) },
          ]
        : [];
    if (agenda.length > 0 || ends.length > 0) {
      const tx = await transactWrite([
        {
          Update: {
            TableName: tableName(),
            ...withVersion({ ...update, ConditionExpression: 'attribute_exists(PK)' }, expectedVersion),
          },
        },
        ...ends,
        ...agenda.map((entry) => ({ Update: agendaUpsert(entry, at) })),
      ]);
      if (!tx.ok) {
        if (tx.failed.includes(0)) throw await versionConflict(() => currentVersion(key));
        throw new Error('Match update failed');
      }
      const saved = await getItem(key, true);
      if (!saved) throw new Error('Match update failed');
      return stripKeys<StoredMatch>(saved);
    }
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

  async advanceMatch(groupId, matchId, wave, openedAt, at) {
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
              UpdateExpression: 'SET advancedTo = :wave, openedAt = :openedAt',
              ConditionExpression: condition,
              ExpressionAttributeValues: {
                ':wave': wave,
                ':openedAt': openedAt,
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

  async markNotified(groupId, matchId, from, to) {
    try {
      await dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          Key: matchKey(groupId, matchId),
          UpdateExpression: 'SET notifiedWave = :to',
          ConditionExpression:
            from === undefined
              ? 'attribute_exists(PK) AND attribute_not_exists(notifiedWave)'
              : 'attribute_exists(PK) AND notifiedWave = :from',
          ExpressionAttributeValues: { ':to': to, ...(from !== undefined && { ':from': from }) },
        }),
      );
      return true;
    } catch (err) {
      if (isConditionFailed(err)) return false;
      throw err;
    }
  },

  async getSeries(groupId, seriesId, opts) {
    const item = await getItem(matchSeriesKey(groupId, seriesId), opts?.consistent);
    return item ? stripKeys<StoredSeries>(item) : undefined;
  },

  async listSeries(groupId) {
    const rows = await queryByPrefix(groupPk(groupId), MATCH_SERIES_PREFIX);
    return rows.map((row) => stripKeys<StoredSeries>(row));
  },

  async updateSeries(series, expectedVersion, at) {
    const key = matchSeriesKey(series.groupId, series.id);
    const { version: _v, updatedAt: _u, ...data } = series;
    const update = replaceItem(
      key,
      MATCH_SERIES_ENTITY,
      { ...data, updatedAt: at.toISOString() },
      SERIES_OPTIONAL,
    );
    const result = await sendVersioned(key, () =>
      dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          ...withVersion({ ...update, ConditionExpression: 'attribute_exists(PK)' }, expectedVersion),
          ReturnValues: 'ALL_NEW',
        }),
      ),
    );
    return stripKeys<StoredSeries>(result.Attributes ?? {});
  },

  async endSeries(groupId, seriesId, at) {
    try {
      await dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          ...touch(
            {
              Key: matchSeriesKey(groupId, seriesId),
              UpdateExpression: 'SET endedAt = :at',
              ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(endedAt)',
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

  async createNextMatch({ match, previousMatchId, agenda, at }) {
    if (match.seriesId === undefined || match.seriesDate === undefined)
      throw new Error('Next match without a series');
    const result = await transactWrite([
      {
        Update: {
          TableName: tableName(),
          ...touch(
            {
              Key: matchSeriesKey(match.groupId, match.seriesId),
              UpdateExpression: 'SET currentMatchId = :next, currentDate = :date',
              ConditionExpression:
                'attribute_exists(PK) AND currentMatchId = :previous AND attribute_not_exists(endedAt)',
              ExpressionAttributeValues: {
                ':next': match.id,
                ':date': match.seriesDate,
                ':previous': previousMatchId,
              },
            },
            at,
          ),
        },
      },
      { Put: matchPut(match) },
      { Put: endPut(match) },
      ...agenda.map((entry) => ({ Put: agendaPut(entry, match.createdAt) })),
    ]);
    if (result.ok) return true;
    if (result.failed.includes(0)) return false;
    throw new Error('Next match create failed');
  },

  async listAgenda(from, to) {
    const until = to.toISOString();
    const pages = await Promise.all(hoursBetween(from, to).map((hour) => agendaHour(hour, until)));
    return pages
      .flat()
      .map((row) => stripKeys<AgendaEntry & { createdAt?: string }>(row))
      .filter((entry) => entry.at <= until)
      .map(({ createdAt: _c, ...entry }) => entry);
  },

  async deleteAgenda(entry) {
    await dynamo().send(
      new DeleteCommand({
        TableName: tableName(),
        Key: matchAgendaKey(entry.at, entry.groupId, entry.matchId),
      }),
    );
  },

  async getAgendaCursor() {
    const item = await getItem(MATCH_AGENDA_CURSOR_KEY, true);
    return item?.lastRunAt as string | undefined;
  },

  async setAgendaCursor(at) {
    await dynamo().send(
      new UpdateCommand({
        TableName: tableName(),
        Key: MATCH_AGENDA_CURSOR_KEY,
        UpdateExpression: 'SET #entity = :entity, lastRunAt = :at, createdAt = if_not_exists(createdAt, :at)',
        ExpressionAttributeNames: { '#entity': 'entity' },
        ExpressionAttributeValues: { ':entity': ROUTINE_ENTITY, ':at': at.toISOString() },
      }),
    );
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

  async getTeams(groupId, matchId, opts) {
    const item = await getItem(matchTeamsKey(groupId, matchId), opts?.consistent);
    return item ? stripKeys<StoredTeams>(item) : undefined;
  },

  async saveTeams({ groupId, matchId, teams, by, at, expectedVersion }) {
    const key = matchTeamsKey(groupId, matchId);
    if (expectedVersion === 0) {
      // PAR-29: o primeiro salvar cria com a condição de ainda não existir; quem ganha avisa.
      const data = { groupId, matchId, teams, createdBy: by, updatedBy: by };
      const item = dbItem(key, MATCH_TEAMS_ENTITY, data, at.toISOString());
      await sendVersioned(key, () =>
        dynamo().send(
          new PutCommand({
            TableName: tableName(),
            Item: item,
            ConditionExpression: 'attribute_not_exists(PK)',
          }),
        ),
      );
      return { teams: stripKeys<StoredTeams>(item), created: true };
    }
    const result = await sendVersioned(key, () =>
      dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          ...withVersion(
            touch(
              {
                Key: key,
                UpdateExpression: 'SET teams = :teams, updatedBy = :by',
                ExpressionAttributeValues: { ':teams': teams, ':by': by },
              },
              at,
            ),
            expectedVersion,
          ),
          ReturnValues: 'ALL_NEW',
        }),
      ),
    );
    return { teams: stripKeys<StoredTeams>(result.Attributes ?? {}), created: false };
  },

  async getResult(groupId, matchId, opts) {
    const item = await getItem(matchResultKey(groupId, matchId), opts?.consistent);
    return item ? stripKeys<StoredResult>(item) : undefined;
  },

  async saveResult({ groupId, matchId, result, by, at, expectedVersion }) {
    const key = matchResultKey(groupId, matchId);
    if (expectedVersion === 0) {
      // O primeiro registro cria com a condição de ainda não existir.
      const item = dbItem(
        key,
        MATCH_RESULT_ENTITY,
        { groupId, matchId, ...result, createdBy: by, updatedBy: by },
        at.toISOString(),
      );
      await sendVersioned(key, () =>
        dynamo().send(
          new PutCommand({
            TableName: tableName(),
            Item: item,
            ConditionExpression: 'attribute_not_exists(PK)',
          }),
        ),
      );
      return stripKeys<StoredResult>(item);
    }
    // Troca o resultado inteiro: os campos do outro jeito saem; `createdBy` fica.
    const update = replaceItem(
      key,
      MATCH_RESULT_ENTITY,
      { groupId, matchId, ...result, updatedBy: by, updatedAt: at.toISOString() },
      RESULT_OPTIONAL,
    );
    const saved = await sendVersioned(key, () =>
      dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          ...withVersion({ ...update, ConditionExpression: 'attribute_exists(PK)' }, expectedVersion),
          ReturnValues: 'ALL_NEW',
        }),
      ),
    );
    return stripKeys<StoredResult>(saved.Attributes ?? {});
  },

  async listHistory(groupId, endedBy, { limit, cursor }) {
    const pk = groupPk(groupId);
    // Um a mais que a página diz se há a próxima, sem devolver um cursor para uma página vazia.
    const { Items = [] } = await dynamo().send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: 'PK = :pk AND SK BETWEEN :from AND :to',
        ExpressionAttributeValues: {
          ':pk': pk,
          ':from': MATCH_END_PREFIX,
          ':to': `${MATCH_END_PREFIX}${endedBy.toISOString()}#~`,
        },
        ScanIndexForward: false,
        Limit: limit + 1,
        ...(cursor && { ExclusiveStartKey: decodeCursor(cursor, pk) }),
      }),
    );
    const page = Items.slice(0, limit);
    const ids = page.map((row) => row.matchId as string);
    const [matches, results] = await Promise.all([
      batchGetOrdered(ids.map((id) => matchKey(groupId, id))),
      batchGetOrdered(ids.map((id) => matchResultKey(groupId, id))),
    ]);
    const byMatch = new Map(
      results.map((row) => stripKeys<StoredResult>(row)).map((r) => [r.matchId, r] as const),
    );
    const last = page[page.length - 1];
    return {
      items: matches
        .map((row) => stripKeys<StoredMatch>(row))
        .map((match) => ({ match, result: byMatch.get(match.id) })),
      ...(Items.length > limit && last && { nextCursor: encodeCursor({ PK: last.PK, SK: last.SK }) }),
    };
  },
};
