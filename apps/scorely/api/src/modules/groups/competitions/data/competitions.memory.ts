import { appError } from '@scorely/api/src/lib/errors';
import type {
  CompetitionRepository,
  LockEntry,
  StoredCompetition,
  StoredFinal,
} from '@scorely/api/src/modules/groups/competitions/data/competitions.repository';
import type { memoryMatches } from '@scorely/api/src/modules/groups/matches/data/matches.memory';

/**
 * O repositório de competições em memória, com o mesmo contrato do Dynamo. Recebe o armazenamento das partidas
 * porque abrir a temporada grava o "Vale para" das repetições e das partidas na mesma transação (COM-01, PAR-40).
 */
export function memoryCompetitions(store: Pick<ReturnType<typeof memoryMatches>, 'matches' | 'series'>) {
  const competitions = new Map<string, StoredCompetition>();
  const finals = new Map<string, StoredFinal>();
  const sequences = new Map<string, number>();
  const locks = new Map<string, LockEntry>();
  const key = (...parts: string[]) => parts.join('#');
  const lockKey = (e: LockEntry) => key(e.at, e.groupId, e.competitionId);

  const repo: CompetitionRepository = {
    async getSequence(groupId) {
      return sequences.get(groupId) ?? 0;
    },
    async createCompetition({ competition, previousNumber, lockAt, series, matches }) {
      const { groupId } = competition;
      if ((sequences.get(groupId) ?? 0) !== previousNumber) return false;
      const seriesOk = series.every(
        (s) => store.series.get(key(groupId, s.item.id))?.version === s.expectedVersion,
      );
      const matchesOk = matches.every(
        (m) => store.matches.get(key(groupId, m.item.id))?.version === m.expectedVersion,
      );
      if (!seriesOk || !matchesOk) return false;
      if (competitions.has(key(groupId, competition.id))) throw new Error('Competition create failed');
      competitions.set(key(groupId, competition.id), { ...competition });
      sequences.set(groupId, competition.number);
      const entry = { at: lockAt, groupId, competitionId: competition.id };
      locks.set(lockKey(entry), entry);
      for (const s of series) {
        const k = key(groupId, s.item.id);
        const current = store.series.get(k);
        if (current) {
          store.series.set(k, {
            ...current,
            competitionIds: [...s.competitionIds],
            updatedAt: competition.createdAt,
            version: current.version + 1,
          });
        }
      }
      for (const m of matches) {
        const k = key(groupId, m.item.id);
        const current = store.matches.get(k);
        if (current) {
          store.matches.set(k, {
            ...current,
            competitionIds: [...m.competitionIds],
            updatedAt: competition.createdAt,
            version: current.version + 1,
          });
        }
      }
      return true;
    },
    async getCompetition(groupId, competitionId) {
      const found = competitions.get(key(groupId, competitionId));
      return found && { ...found };
    },
    async getCompetitions(groupId, ids) {
      return ids.flatMap((id) => {
        const found = competitions.get(key(groupId, id));
        return found ? [{ ...found }] : [];
      });
    },
    async listCompetitions(groupId) {
      return [...competitions.values()]
        .filter((c) => c.groupId === groupId)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((c) => ({ ...c }));
    },
    async updateCompetition(competition, expectedVersion, at, lock) {
      const k = key(competition.groupId, competition.id);
      const current = competitions.get(k);
      if (!current || current.version !== expectedVersion) {
        throw appError('VERSION_CONFLICT', { currentVersion: current?.version ?? 0 });
      }
      const saved: StoredCompetition = {
        ...competition,
        createdAt: current.createdAt,
        updatedAt: at.toISOString(),
        version: current.version + 1,
      };
      competitions.set(k, saved);
      if (lock.lockAt !== lock.previousLockAt) {
        locks.delete(key(lock.previousLockAt, competition.groupId, competition.id));
        const entry = { at: lock.lockAt, groupId: competition.groupId, competitionId: competition.id };
        locks.set(lockKey(entry), entry);
      }
      return { ...saved };
    },
    async lockCompetition({ competition, final, at }) {
      const k = key(competition.groupId, competition.id);
      const current = competitions.get(k);
      if (!current || current.lockedAt !== undefined || finals.has(k)) return false;
      const iso = at.toISOString();
      competitions.set(k, { ...current, lockedAt: iso, updatedAt: iso, version: current.version + 1 });
      finals.set(k, structuredClone(final));
      return true;
    },
    async getFinal(groupId, competitionId) {
      const found = finals.get(key(groupId, competitionId));
      return found && structuredClone(found);
    },
    async listLockEntries(from, to) {
      const since = from.toISOString();
      const until = to.toISOString();
      return [...locks.values()]
        .filter((e) => e.at >= since && e.at <= until)
        .sort((a, b) => lockKey(a).localeCompare(lockKey(b)))
        .map((e) => ({ ...e }));
    },
    async deleteLockEntry(entry) {
      locks.delete(lockKey(entry));
    },
  };
  return { repo };
}
