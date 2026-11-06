/**
 * Datas no fuso do grupo (plano 003, D11; ADR 0006). Funções puras: `now` sempre vem de fora.
 * Datas locais em `YYYY-MM-DD`, horas em `HH:mm`, instantes em ISO UTC (`...Z`).
 */

/** Janela do `in_progress`: do início até 3 h depois (D3). */
export const GAME_DURATION_HOURS = 3;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface WeeklySchedule {
  /** 0 = domingo ... 6 = sábado, no fuso do grupo. */
  weekday: number;
  time: string;
  timeZone: string;
  listOpensHoursBefore: number;
}

export interface Occurrence {
  date: string;
  startsAt: string;
  opensAt: string;
  endsAt: string;
}

export type TimeStatus = 'scheduled' | 'open' | 'in_progress';

/** Data e hora de parede do instante no fuso, como se fosse UTC (ms). */
function wallClockMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instantMs));
  const n = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
}

/** Diferença (ms) entre a hora de parede no fuso e o UTC, naquele instante. */
function offsetMs(instantMs: number, timeZone: string): number {
  return wallClockMs(instantMs, timeZone) - Math.floor(instantMs / 1000) * 1000;
}

/**
 * Instante da hora local `time` do dia `date` no fuso. Testa os offsets de antes e de depois
 * (no máximo uma troca de horário por dia): hora que existe duas vezes → a primeira;
 * hora que não existe (pulo) → o offset de antes, que avança o tamanho do pulo.
 */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const wall = Date.parse(`${date}T${time}:00Z`);
  const before = wall - offsetMs(wall - DAY_MS, timeZone);
  const after = wall - offsetMs(wall + DAY_MS, timeZone);
  const valid = [before, after].filter((t) => wallClockMs(t, timeZone) === wall);
  return new Date(valid.length > 0 ? Math.min(...valid) : before);
}

/** Data local (`YYYY-MM-DD`) do instante no fuso. */
export function localDate(instant: Date, timeZone: string): string {
  return new Date(wallClockMs(instant.getTime(), timeZone)).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function occurrenceOn(schedule: WeeklySchedule, date: string): Occurrence {
  const startsAt = zonedToUtc(date, schedule.time, schedule.timeZone).getTime();
  return {
    date,
    startsAt: new Date(startsAt).toISOString(),
    opensAt: new Date(startsAt - schedule.listOpensHoursBefore * HOUR_MS).toISOString(),
    endsAt: new Date(startsAt + GAME_DURATION_HOURS * HOUR_MS).toISOString(),
  };
}

/** Jogo atual: a primeira ocorrência semanal com `endsAt > now` (D1). */
export function currentOccurrence(schedule: WeeklySchedule, now: Date): Occurrence {
  const today = localDate(now, schedule.timeZone);
  const todayWeekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const nextOnWeekday = addDays(today, (schedule.weekday - todayWeekday + 7) % 7);
  // A da semana passada ainda pode estar em andamento (jogo de 23h visto às 01h).
  const candidates = [-7, 0, 7].map((d) => occurrenceOn(schedule, addDays(nextOnWeekday, d)));
  const current = candidates.find((o) => Date.parse(o.endsAt) > now.getTime());
  if (!current) throw new Error('No current occurrence found');
  return current;
}

/** Status pelo relógio (D3). O `cancelled` fica por conta do service. */
export function timeStatus(occurrence: Occurrence, now: Date): TimeStatus {
  const t = now.getTime();
  if (t < Date.parse(occurrence.opensAt)) return 'scheduled';
  if (t < Date.parse(occurrence.startsAt)) return 'open';
  return 'in_progress';
}

/** Abertura de uma camada da lista (plano 007, D2): `hoursBefore` horas antes do início, em UTC. */
export function layerOpensAt(startsAt: string, hoursBefore: number): string {
  return new Date(new Date(startsAt).getTime() - hoursBefore * HOUR_MS).toISOString();
}
