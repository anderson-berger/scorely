import { appError } from '@scorely/api/src/lib/errors';
import type {
  MatchRepository,
  StoredAttendance,
  StoredGuest,
  StoredMatch,
} from '@scorely/api/src/modules/matches/match.repository';

/** O repositório de partidas em memória, com o mesmo contrato do Dynamo (suíte de contrato, ADR 0019). */
export function memoryMatches() {
  const matches = new Map<string, StoredMatch>();
  const attendances = new Map<string, StoredAttendance>();
  const guests = new Map<string, StoredGuest>();
  const names = new Map<string, string>();
  const counters = new Map<string, number>();
  const key = (...parts: string[]) => parts.join('#');
  const copy = <T extends object>(value: T): T => ({ ...value });

  const isPending = (g: StoredGuest) =>
    g.approvedAt === undefined && g.declinedAt === undefined && g.cancelledAt === undefined;
  const isApproved = (g: StoredGuest) => g.approvedAt !== undefined && g.removedAt === undefined;

  const repo: MatchRepository = {
    async createMatch(match) {
      const k = key(match.groupId, match.id);
      if (matches.has(k)) throw new Error('Match create failed');
      matches.set(k, copy(match));
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
    async updateMatch(match, expectedVersion, at) {
      const k = key(match.groupId, match.id);
      const current = matches.get(k);
      if (!current || current.version !== expectedVersion) {
        throw appError('VERSION_CONFLICT', { currentVersion: current?.version ?? 0 });
      }
      const next: StoredMatch = {
        ...match,
        createdAt: current.createdAt,
        updatedAt: at.toISOString(),
        version: current.version + 1,
      };
      matches.set(k, next);
      return copy(next);
    },
    async advanceMatch(groupId, matchId, wave, at) {
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
  };
  return { repo, counters };
}
