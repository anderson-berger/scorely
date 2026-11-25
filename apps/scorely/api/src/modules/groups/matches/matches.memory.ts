import { decodeCursor, encodeCursor } from '@scorely/api/src/lib/db';
import { appError } from '@scorely/api/src/lib/errors';
import type { GroupId } from '@scorely/api/src/lib/ids';
import type {
  AgendaEntry,
  MatchRepository,
  NextMatch,
  StoredAttendance,
  StoredGuest,
  StoredMatch,
  StoredResult,
  StoredSeries,
  StoredTeams,
} from '@scorely/api/src/modules/groups/matches/match.repository';
import { matchEndKey } from '@scorely/api/src/modules/groups/matches/match.table';

/** O repositório de partidas em memória, com o mesmo contrato do Dynamo (suíte de contrato, ADR 0019). */
export function memoryMatches() {
  const matches = new Map<string, StoredMatch>();
  const attendances = new Map<string, StoredAttendance>();
  const guests = new Map<string, StoredGuest>();
  const names = new Map<string, string>();
  const counters = new Map<string, number>();
  const series = new Map<string, StoredSeries>();
  const agenda = new Map<string, AgendaEntry & { createdAt: string }>();
  const teamsByMatch = new Map<string, StoredTeams>();
  const results = new Map<string, StoredResult>();
  const cursor = { lastRunAt: undefined as string | undefined };
  const key = (...parts: string[]) => parts.join('#');
  const copy = <T extends object>(value: T): T => ({ ...value });

  const isPending = (g: StoredGuest) =>
    g.approvedAt === undefined && g.declinedAt === undefined && g.cancelledAt === undefined;
  const isApproved = (g: StoredGuest) => g.approvedAt !== undefined && g.removedAt === undefined;

  /** Grava itens da agenda (um repetido só se regrava, mantendo o `createdAt`); só as escritas da partida chamam. */
  const putAgenda = (entries: readonly AgendaEntry[], at: Date) => {
    for (const entry of entries) {
      const k = key(entry.at, entry.groupId, entry.matchId);
      agenda.set(k, { ...entry, createdAt: agenda.get(k)?.createdAt ?? at.toISOString() });
    }
  };

  /** PAR-21: a partida seguinte e a repetição apontando para ela; `false` = outro já criou (ou encerrou). */
  const insertNext = ({ match, previousMatchId, agenda: entries }: NextMatch, at: Date): boolean => {
    if (match.seriesId === undefined || match.seriesDate === undefined)
      throw new Error('Next match without a series');
    const k = key(match.groupId, match.seriesId);
    const current = series.get(k);
    if (!current || current.currentMatchId !== previousMatchId || current.endedAt !== undefined) return false;
    if (matches.has(key(match.groupId, match.id))) throw new Error('Next match create failed');
    const iso = at.toISOString();
    series.set(k, {
      ...current,
      currentMatchId: match.id,
      currentDate: match.seriesDate,
      updatedAt: iso,
      version: current.version + 1,
    });
    matches.set(key(match.groupId, match.id), copy(match));
    putAgenda(entries, at);
    return true;
  };

  /** PAR-07, 41–43: muda a situação se a condição vale, soma a `version` e, com `next`, cria a seguinte junto. */
  const change = (
    groupId: GroupId,
    matchId: string,
    at: Date,
    allowed: (m: StoredMatch) => boolean,
    apply: (m: StoredMatch) => StoredMatch,
    next?: NextMatch,
  ): boolean => {
    const k = key(groupId, matchId);
    const current = matches.get(k);
    if (!current || !allowed(current)) return false;
    if (next !== undefined && !insertNext(next, at)) throw new Error('Match change failed');
    matches.set(k, { ...apply(current), updatedAt: at.toISOString(), version: current.version + 1 });
    return true;
  };

  const repo: MatchRepository = {
    async createMatch(match, extras = {}) {
      const k = key(match.groupId, match.id);
      if (matches.has(k)) throw new Error('Match create failed');
      if (extras.series && series.has(key(extras.series.groupId, extras.series.id))) {
        throw new Error('Match create failed');
      }
      matches.set(k, copy(match));
      if (extras.series) series.set(key(extras.series.groupId, extras.series.id), copy(extras.series));
      putAgenda(extras.agenda ?? [], new Date(match.createdAt));
    },
    async getMatch(groupId, matchId) {
      const match = matches.get(key(groupId, matchId));
      return match && copy(match);
    },
    async listMatches(groupId, at) {
      const after = at.toISOString();
      return [...matches.values()]
        .filter(
          (m) =>
            m.groupId === groupId &&
            m.finishedAt === undefined &&
            (m.cancelledAt === undefined || m.endsAt > after),
        )
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(copy);
    },
    async updateMatch(match, expectedVersion, at, opts = {}) {
      const k = key(match.groupId, match.id);
      const current = matches.get(k);
      if (!current || current.version !== expectedVersion) {
        throw appError('VERSION_CONFLICT', { currentVersion: current?.version ?? 0 });
      }
      const next: StoredMatch = {
        ...match,
        notifiedWave: opts.resetNotified ? match.notifiedWave : current.notifiedWave,
        createdAt: current.createdAt,
        updatedAt: at.toISOString(),
        version: current.version + 1,
      };
      matches.set(k, next);
      putAgenda(opts.agenda ?? [], at);
      return copy(next);
    },
    async advanceMatch(groupId, matchId, wave, openedAt, at) {
      const k = key(groupId, matchId);
      const current = matches.get(k);
      if (!current) return false;
      const allowed =
        wave === 'reserves'
          ? current.advancedTo === undefined || current.advancedTo === 'members'
          : current.advancedTo !== 'guests';
      if (!allowed) return false;
      matches.set(k, {
        ...current,
        advancedTo: wave,
        openedAt: { ...openedAt },
        updatedAt: at.toISOString(),
        version: current.version + 1,
      });
      return true;
    },
    async cancelMatch(groupId, matchId, at, next) {
      return change(
        groupId,
        matchId,
        at,
        (m) => m.cancelledAt === undefined && m.startedAt === undefined,
        (m) => ({ ...m, cancelledAt: at.toISOString() }),
        next,
      );
    },
    async startMatch(groupId, matchId, by, at) {
      return change(
        groupId,
        matchId,
        at,
        (m) => m.startedAt === undefined && m.finishedAt === undefined && m.cancelledAt === undefined,
        (m) => ({ ...m, startedAt: at.toISOString(), startedBy: by }),
      );
    },
    async unstartMatch(groupId, matchId, at) {
      return change(
        groupId,
        matchId,
        at,
        // PAR-42: só sem resultado.
        (m) => m.startedAt !== undefined && m.finishedAt === undefined && !results.has(key(groupId, m.id)),
        ({ startedAt: _s, startedBy: _b, ...m }) => m,
      );
    },
    async finishMatch(groupId, matchId, by, at, next) {
      return change(
        groupId,
        matchId,
        at,
        (m) => m.startedAt !== undefined && m.finishedAt === undefined,
        (m) => ({ ...m, finishedAt: at.toISOString(), finishedBy: by }),
        next,
      );
    },
    async markNotified(groupId, matchId, from, to) {
      const k = key(groupId, matchId);
      const current = matches.get(k);
      if (!current || current.notifiedWave !== from) return false;
      matches.set(k, { ...current, notifiedWave: to });
      return true;
    },
    async getSeries(groupId, seriesId) {
      const found = series.get(key(groupId, seriesId));
      return found && copy(found);
    },
    async listSeries(groupId) {
      return [...series.values()]
        .filter((x) => x.groupId === groupId)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(copy);
    },
    async updateSeries(next, expectedVersion, at) {
      const k = key(next.groupId, next.id);
      const current = series.get(k);
      if (!current || current.version !== expectedVersion) {
        throw appError('VERSION_CONFLICT', { currentVersion: current?.version ?? 0 });
      }
      const saved: StoredSeries = {
        ...next,
        createdAt: current.createdAt,
        updatedAt: at.toISOString(),
        version: current.version + 1,
      };
      series.set(k, saved);
      return copy(saved);
    },
    async endSeries(groupId, seriesId, at) {
      const k = key(groupId, seriesId);
      const current = series.get(k);
      if (!current || current.endedAt !== undefined) return false;
      const iso = at.toISOString();
      series.set(k, { ...current, endedAt: iso, updatedAt: iso, version: current.version + 1 });
      return true;
    },
    async createNextMatch({ at, ...next }) {
      return insertNext(next, at);
    },
    async listAgenda(from, to) {
      const firstHour = from.toISOString().slice(0, 13);
      const until = to.toISOString();
      return [...agenda.values()]
        .filter((e) => e.at.slice(0, 13) >= firstHour && e.at <= until)
        .sort((a, b) => key(a.at, a.groupId, a.matchId).localeCompare(key(b.at, b.groupId, b.matchId)))
        .map(({ createdAt: _c, ...entry }) => entry);
    },
    async deleteAgenda(entry) {
      agenda.delete(key(entry.at, entry.groupId, entry.matchId));
    },
    async getAgendaCursor() {
      return cursor.lastRunAt;
    },
    async setAgendaCursor(at) {
      cursor.lastRunAt = at.toISOString();
    },
    async listAttendances(groupId, matchId) {
      return [...attendances.values()]
        .filter((a) => a.groupId === groupId && a.matchId === matchId)
        .sort((a, b) => a.userId.localeCompare(b.userId))
        .map(copy);
    },
    async putAttendance(attendance) {
      const k = key(attendance.groupId, attendance.matchId, attendance.userId);
      const current = attendances.get(k);
      attendances.set(k, { ...attendance, createdAt: current?.createdAt ?? attendance.createdAt });
    },
    async listGuests(groupId, matchId) {
      return [...guests.values()]
        .filter((g) => g.groupId === groupId && g.matchId === matchId)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(copy);
    },
    async getGuest(groupId, matchId, guestId) {
      const guest = guests.get(key(groupId, matchId, guestId));
      return guest && copy(guest);
    },
    async requestGuest(guest, max) {
      const nameKey = key(guest.groupId, guest.matchId, guest.normalizedName);
      const counterKey = key(guest.groupId, guest.matchId);
      if (names.has(nameKey)) return 'duplicate';
      if ((counters.get(counterKey) ?? 0) >= max) return 'limit';
      guests.set(key(guest.groupId, guest.matchId, guest.id), copy(guest));
      names.set(nameKey, guest.id);
      counters.set(counterKey, (counters.get(counterKey) ?? 0) + 1);
      return 'ok';
    },
    async transitionGuest({ guest, transition, by, at }) {
      const k = key(guest.groupId, guest.matchId, guest.id);
      const current = guests.get(k);
      if (!current) return false;
      const fromOk = transition === 'remove' ? isApproved(current) : isPending(current);
      if (!fromOk) return false;
      const iso = at.toISOString();
      const step: Partial<StoredGuest> =
        transition === 'approve'
          ? { approvedAt: iso, approvedBy: by }
          : transition === 'decline'
            ? { declinedAt: iso, declinedBy: by }
            : transition === 'cancel'
              ? { cancelledAt: iso }
              : { removedAt: iso, removedBy: by };
      guests.set(k, { ...current, ...step, updatedAt: iso, version: current.version + 1 });
      if (transition !== 'approve') {
        names.delete(key(guest.groupId, guest.matchId, current.normalizedName));
        const counterKey = key(guest.groupId, guest.matchId);
        counters.set(counterKey, (counters.get(counterKey) ?? 0) - 1);
      }
      return true;
    },
    async getTeams(groupId, matchId) {
      const current = teamsByMatch.get(key(groupId, matchId));
      return current && structuredClone(current);
    },
    async saveTeams({ groupId, matchId, teams, by, at, expectedVersion }) {
      const k = key(groupId, matchId);
      const current = teamsByMatch.get(k);
      if ((current?.version ?? 0) !== expectedVersion) {
        throw appError('VERSION_CONFLICT', { currentVersion: current?.version ?? 0 });
      }
      const iso = at.toISOString();
      const next: StoredTeams = {
        groupId,
        matchId,
        teams: structuredClone(teams),
        createdAt: current?.createdAt ?? iso,
        createdBy: current?.createdBy ?? by,
        updatedAt: iso,
        updatedBy: by,
        version: expectedVersion + 1,
      };
      teamsByMatch.set(k, next);
      return { teams: structuredClone(next), created: current === undefined };
    },
    async getResult(groupId, matchId) {
      const current = results.get(key(groupId, matchId));
      return current && structuredClone(current);
    },
    async saveResult({ groupId, matchId, result, by, at, expectedVersion }) {
      const k = key(groupId, matchId);
      const current = results.get(k);
      if ((current?.version ?? 0) !== expectedVersion) {
        throw appError('VERSION_CONFLICT', { currentVersion: current?.version ?? 0 });
      }
      const iso = at.toISOString();
      const next: StoredResult = {
        ...structuredClone(result),
        groupId,
        matchId,
        createdAt: current?.createdAt ?? iso,
        createdBy: current?.createdBy ?? by,
        updatedAt: iso,
        updatedBy: by,
        version: expectedVersion + 1,
      };
      results.set(k, next);
      return structuredClone(next);
    },
    async listHistory(groupId, endedBy, { limit, cursor }) {
      // A mesma ordem e o mesmo cursor do índice `MATCHEND#` do Dynamo.
      const pk = matchEndKey(groupId, '', '').PK;
      const after = cursor === undefined ? undefined : decodeCursor(cursor, pk).SK;
      const until = endedBy.toISOString();
      const ended = [...matches.values()]
        .filter(
          (m) =>
            m.groupId === groupId &&
            (m.finishedAt !== undefined || (m.cancelledAt !== undefined && m.endsAt <= until)),
        )
        .map((m) => ({ m, sk: matchEndKey(groupId, m.endsAt, m.id).SK }))
        .sort((a, b) => (a.sk < b.sk ? 1 : a.sk > b.sk ? -1 : 0))
        .filter((x) => after === undefined || x.sk < after);
      const page = ended.slice(0, limit);
      const last = page[page.length - 1];
      return {
        items: page.map(({ m }) => {
          const result = results.get(key(groupId, m.id));
          return { match: copy(m), result: result && structuredClone(result) };
        }),
        ...(ended.length > limit && last && { nextCursor: encodeCursor({ PK: pk, SK: last.sk }) }),
      };
    },
    async listByEnd(groupId, from, to) {
      const since = from.toISOString();
      const until = to.toISOString();
      return [...matches.values()]
        .filter((m) => m.groupId === groupId && m.endsAt >= since && m.endsAt <= until)
        .sort((a, b) => (a.endsAt === b.endsAt ? a.id.localeCompare(b.id) : a.endsAt < b.endsAt ? -1 : 1))
        .map((m) => {
          const result = results.get(key(groupId, m.id));
          return { match: copy(m), result: result && structuredClone(result) };
        });
    },
  };
  // `matches` e `series` saem para o repositório das competições gravar o "Vale para" junto (COM-01, PAR-40).
  return { repo, counters, agenda, matches, series };
}
