import { appError } from '@scorely/api/src/lib/errors';
import type {
  AgendaEntry,
  MatchRepository,
  StoredAttendance,
  StoredGuest,
  StoredMatch,
  StoredSeries,
  StoredTeams,
} from '@scorely/api/src/modules/matches/match.repository';

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
  const cursor = { lastRunAt: undefined as string | undefined };
  const key = (...parts: string[]) => parts.join('#');
  const copy = <T extends object>(value: T): T => ({ ...value });

  const isPending = (g: StoredGuest) =>
    g.approvedAt === undefined && g.declinedAt === undefined && g.cancelledAt === undefined;
  const isApproved = (g: StoredGuest) => g.approvedAt !== undefined && g.removedAt === undefined;

  const repo: MatchRepository = {
    async createMatch(match, extras = {}) {
      const k = key(match.groupId, match.id);
      if (matches.has(k)) throw new Error('Match create failed');
      if (extras.series && series.has(key(extras.series.groupId, extras.series.id))) {
        throw new Error('Match create failed');
      }
      matches.set(k, copy(match));
      if (extras.series) series.set(key(extras.series.groupId, extras.series.id), copy(extras.series));
      await repo.putAgenda(extras.agenda ?? [], new Date(match.createdAt));
    },
    async getMatch(groupId, matchId) {
      const match = matches.get(key(groupId, matchId));
      return match && copy(match);
    },
    async listMatches(groupId, endsAfter) {
      const after = endsAfter.toISOString();
      return [...matches.values()]
        .filter((m) => m.groupId === groupId && m.endsAt > after)
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
    async cancelMatch(groupId, matchId, at) {
      const k = key(groupId, matchId);
      const current = matches.get(k);
      if (!current || current.cancelledAt !== undefined) return false;
      matches.set(k, {
        ...current,
        cancelledAt: at.toISOString(),
        updatedAt: at.toISOString(),
        version: current.version + 1,
      });
      return true;
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
    async createNextMatch({ match, previousMatchId, agenda: entries, at }) {
      if (match.seriesId === undefined || match.seriesDate === undefined)
        throw new Error('Next match without a series');
      const k = key(match.groupId, match.seriesId);
      const current = series.get(k);
      if (!current || current.currentMatchId !== previousMatchId || current.endedAt !== undefined)
        return false;
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
      await repo.putAgenda(entries, at);
      return true;
    },
    async putAgenda(entries, at) {
      for (const entry of entries) {
        const k = key(entry.at, entry.groupId, entry.matchId);
        agenda.set(k, { ...entry, createdAt: agenda.get(k)?.createdAt ?? at.toISOString() });
      }
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
  };
  return { repo, counters, agenda };
}
