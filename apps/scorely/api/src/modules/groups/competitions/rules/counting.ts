import { addDays, type LocalDate, zonedToUtc } from '@scorely/api/src/lib/zoned';
import type { CompetitionContext } from '@scorely/api/src/modules/groups/competitions/competitions.service';
import type { StoredCompetition } from '@scorely/api/src/modules/groups/competitions/data/competitions.repository';
import type {
  StoredMatch,
  StoredResult,
} from '@scorely/api/src/modules/groups/matches/data/matches.repository';
import { COMPETITION_LIMITS, type CompetitionRef, type CompetitionStatus } from '@scorely/contracts';

// Quais partidas contam (COM-05): o período e a situação da competição (COM-02, 11), pelas datas locais e pelo
// fuso dela, e os resultados que somam.

type Dated = { startDate: LocalDate; endDate: LocalDate; timeZone: string; lockedAt?: string | undefined };

/** COM-02, 05: do início do primeiro dia ao fim do último, no fuso da competição (`to` é exclusivo). */
export function periodOf(c: Dated): { from: Date; to: Date } {
  return {
    from: zonedToUtc(c.startDate, '00:00', c.timeZone),
    to: zonedToUtc(addDays(c.endDate, 1), '00:00', c.timeZone),
  };
}

/** COM-11: o fim do prazo, 3 dias depois do fim. */
export function lockAtOf(c: Dated): Date {
  return zonedToUtc(addDays(c.endDate, 1 + COMPETITION_LIMITS.graceDays), '00:00', c.timeZone);
}

/** COM-11: aberta até o fim do último dia, no prazo nos 3 dias seguintes, travada depois (ou já travada). */
export function competitionStatus(c: Dated, at: Date): CompetitionStatus {
  if (c.lockedAt !== undefined) return 'locked';
  if (at < periodOf(c).to) return 'open';
  return at < lockAtOf(c) ? 'grace' : 'locked';
}

/** COM-05, PAR-40: o período tem este início. */
export function startsWithin(c: Dated, startsAt: string): boolean {
  const { from, to } = periodOf(c);
  const start = new Date(startsAt);
  return start >= from && start < to;
}

/** Os dias de `a` a `b` (`b - a`), datas locais. */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** PAR-16, 40: a competição no "Vale para". */
export function competitionRef(c: { id: string; name?: string | undefined; number: number }): CompetitionRef {
  return { id: c.id, ...(c.name !== undefined && { name: c.name }), number: c.number };
}

// ---- Quais partidas contam (COM-05) ----

const DAY_MS = 86_400_000;

/** COM-05: as partidas que somam: valem para ela, começaram no período, têm resultado e não foram canceladas. */
function counted(
  c: StoredCompetition,
  entries: readonly { match: StoredMatch; result?: StoredResult | undefined }[],
) {
  return entries.flatMap(({ match, result }) =>
    result !== undefined &&
    match.cancelledAt === undefined &&
    (match.competitionIds ?? []).includes(c.id) &&
    startsWithin(c, match.startsAt)
      ? [result]
      : [],
  );
}

export function createCountingRules({ deps }: CompetitionContext) {
  /** COM-05: os resultados que somam agora. */
  async function results(c: StoredCompetition): Promise<StoredResult[]> {
    const { from, to } = periodOf(c);
    // As partidas terminam depois de começar (até 24 h, PAR-01): o índice do fim vai até o fim do período + 24 h.
    const entries = await deps.matches.listByEnd(c.groupId, from, new Date(to.getTime() + DAY_MS));
    return counted(c, entries);
  }

  return { results };
}

export type CountingRules = ReturnType<typeof createCountingRules>;
