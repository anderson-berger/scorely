import { occurrenceOnDate } from '@scorely/api/src/lib/zoned';
import type { Schedule } from '@scorely/contracts';

/** Um intervalo de jogo, em instantes ISO UTC. */
export interface Span {
  startsAt: string;
  endsAt: string;
}

/** GRP-70: dois jogos se sobrepõem se um começa antes de o outro acabar (o fim é exclusivo). */
export function overlaps(a: Span, b: Span): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

/** GRP-70: o id do primeiro jogo de `others` que bate com o candidato. O próprio jogo (`gameId`) não conta. */
export function findOverlap(
  candidate: Span & { gameId?: string },
  others: Array<Span & { id: string }>,
): string | undefined {
  return others.find((o) => o.id !== candidate.gameId && overlaps(candidate, o))?.id;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * GRP-69: o início (UTC) da próxima ocorrência do horário depois da data (a do jogo que se remarca), no fuso do grupo.
 * Um remarcado não passa desse instante.
 */
export function nextOccurrenceStart(
  schedule: Pick<Schedule, 'weekday' | 'start' | 'end'>,
  timeZone: string,
  afterDate: string,
): string {
  const weekly = { ...schedule, timeZone, listOpensHoursBefore: 0 };
  const found = [1, 2, 3, 4, 5, 6, 7]
    .map((d) => occurrenceOnDate(weekly, addDays(afterDate, d)))
    .find((o) => o !== undefined);
  if (!found) throw new Error('No occurrence found in the next week');
  return found.startsAt;
}
