import { appError } from '@scorely/api/src/lib/errors';
import { zonedToUtc } from '@scorely/api/src/lib/zoned';
import { SEASON_LIMITS, type SeasonState } from '@scorely/contracts';

/** O que as contas das temporadas precisam: as datas locais e o encerramento antes da data (CMP-29, 32). */
export interface SeasonDates {
  startDate: string;
  endDate: string;
  closedAt?: string | undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A data local `n` dias depois (ou antes, com `n` negativo). */
export function addLocalDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Dias entre duas datas locais (`b − a`). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** O início do dia local, no fuso do grupo. */
function startOfDay(date: string, timeZone: string): number {
  return zonedToUtc(date, '00:00', timeZone).getTime();
}

/** CMP-32: até quando dá para fechar e corrigir: o fim do dia `fim + 3`, ou o encerramento antes da data. */
export function graceUntil(season: SeasonDates, timeZone: string): string {
  if (season.closedAt) return season.closedAt;
  return new Date(
    startOfDay(addLocalDays(season.endDate, SEASON_LIMITS.graceDays + 1), timeZone),
  ).toISOString();
}

/** CMP-29, 32: programada, aberta (até o fim do dia de fim), no prazo ou encerrada, no fuso do grupo. */
export function seasonState(season: SeasonDates, now: Date, timeZone: string): SeasonState {
  const t = now.getTime();
  if (season.closedAt && t >= Date.parse(season.closedAt)) return 'closed';
  if (t < startOfDay(season.startDate, timeZone)) return 'scheduled';
  if (t < startOfDay(addLocalDays(season.endDate, 1), timeZone)) return 'open';
  if (t < Date.parse(graceUntil(season, timeZone))) return 'grace';
  return 'closed';
}

/** CMP-32: travada = encerrada (passado o prazo, ou encerrada antes da data). */
export function isLocked(season: SeasonDates, now: Date, timeZone: string): boolean {
  return seasonState(season, now, timeZone) === 'closed';
}

/** CMP-29: a temporada do dia, se houver (as datas são inclusive). */
export function seasonOfDate<S extends SeasonDates>(seasons: readonly S[], date: string): S | undefined {
  return seasons.find((s) => s.startDate <= date && date <= s.endDate);
}

/**
 * CMP-29, 30: as datas valem? Duração de 7 a 366 dias (contando os dois), início a partir de hoje e até 1 ano à frente,
 * e sem cruzar com outra temporada. Senão, `SEASON_INVALID` com o motivo.
 */
export function checkSeasonDates(
  input: { startDate: string; endDate: string },
  today: string,
  others: readonly SeasonDates[],
): void {
  const length = daysBetween(input.startDate, input.endDate) + 1;
  if (length < SEASON_LIMITS.days.min || length > SEASON_LIMITS.days.max) {
    throw appError('SEASON_INVALID', { reason: 'duration' });
  }
  if (input.startDate < today) throw appError('SEASON_INVALID', { reason: 'past_start' });
  if (daysBetween(today, input.startDate) > SEASON_LIMITS.aheadDays) {
    throw appError('SEASON_INVALID', { reason: 'too_far' });
  }
  if (others.some((s) => !(input.endDate < s.startDate || input.startDate > s.endDate))) {
    throw appError('SEASON_INVALID', { reason: 'overlap' });
  }
}
