import {
  COMPETITION_LIMITS,
  type CompetitionRankingRow,
  type CompetitionRef,
  type CompetitionSummary,
} from '@scorely/contracts';
import { t } from '@scorely/web/src/i18n';
import { formatDateTime } from '@scorely/web/src/lib/datetime';

// Textos da competição na tela (COM-12, 13). A situação e as posições vêm da api.

/** COM-02: o nome, ou "Temporada N". */
export function competitionName(c: Pick<CompetitionRef, 'name' | 'number'>): string {
  return c.name ?? t('competitions.defaultName', { n: c.number });
}

const DAY_MS = 86_400_000;

/** Uma data local (`AAAA-MM-DD`) como "30/06", sem fuso (é um dia do calendário). */
export function dayLabel(date: string, plusDays = 0): string {
  const at = new Date(Date.parse(`${date}T12:00:00Z`) + plusDays * DAY_MS).toISOString();
  return formatDateTime(at, 'dayMonth', { timeZone: 'UTC' });
}

/** COM-12: "até 30/06", "Resultados até 03/07" no prazo, ou "Encerrada em 30/06". */
export function periodLine(c: Pick<CompetitionSummary, 'status' | 'endDate'>): string {
  if (c.status === 'open') return t('competitions.until', { day: dayLabel(c.endDate) });
  if (c.status === 'grace') {
    return t('competitions.graceUntil', { day: dayLabel(c.endDate, COMPETITION_LIMITS.graceDays) });
  }
  return t('competitions.closedOn', { day: dayLabel(c.endDate) });
}

/** COM-13: "12 jogos · 8 V · 1 E · 3 D · 67%". */
export function rowLine(row: CompetitionRankingRow): string {
  return [
    t('competitions.games', row.played),
    t('competitions.wins', { n: row.wins }),
    t('competitions.draws', { n: row.draws }),
    t('competitions.losses', { n: row.losses }),
    `${Math.round(row.winRate * 100)}%`,
  ].join(' · ');
}

/** COM-12: a competição aceita partidas cujo dia (no fuso dela) está no período (PAR-40). A api confere. */
export function coversDay(c: Pick<CompetitionSummary, 'startDate' | 'endDate'>, day: string): boolean {
  return day >= c.startDate && day <= c.endDate;
}

/** Uma data local (`AAAA-MM-DD`) mais `n` dias. */
export function addLocalDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * COM-02, 04: a faixa do fim no seletor de data: de 7 a 366 dias contando o início e o fim, e não antes de hoje. A
 * api confere de novo.
 */
export function endDateRange(startDate: string, today: string): { min: string; max: string } {
  const { min, max } = COMPETITION_LIMITS.durationDays;
  const first = addLocalDays(startDate, min - 1);
  return { min: first > today ? first : today, max: addLocalDays(startDate, max - 1) };
}
