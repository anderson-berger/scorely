import { addDays, type LocalDate, zonedToUtc } from '@scorely/api/src/lib/zoned';
import { COMPETITION_LIMITS, type CompetitionRef, type CompetitionStatus } from '@scorely/contracts';

// O período e a situação da competição (COM-02, 11), calculados pelas datas locais e pelo fuso dela.

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
