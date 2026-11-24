// Data e hora num fuso IANA (ADR 0006): a repetição da partida guarda "sexta, 19:00" no fuso de quem criou (PAR-20) e
// converte em UTC a cada semana, então a hora local se mantém na troca do horário de verão.

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD`, o dia no calendário (sem fuso). */
export type LocalDate = string;

interface LocalParts {
  date: LocalDate;
  /** 1 a 7, de segunda a domingo (ISO 8601). */
  weekday: number;
  /** `HH:mm`. */
  time: string;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function partsOf(instant: Date, timeZone: string): Record<string, string> {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  return Object.fromEntries(format.formatToParts(instant).map((p) => [p.type, p.value]));
}

/** O dia, o dia da semana e a hora de um instante no fuso. */
export function localParts(instant: Date, timeZone: string): LocalParts {
  const p = partsOf(instant, timeZone);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    weekday: WEEKDAYS.indexOf(p.weekday ?? '') + 1,
    time: `${p.hour}:${p.minute}`,
  };
}

/** Quanto o fuso está à frente de UTC nesse instante, em ms. */
function offsetAt(instant: Date, timeZone: string): number {
  const p = partsOf(instant, timeZone);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * O instante UTC do dia e da hora locais no fuso. Uma hora que não existe (o pulo do horário de verão) cai na hora
 * seguinte; uma que existe duas vezes, na primeira.
 */
export function zonedToUtc(date: LocalDate, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0);
  const first = wall - offsetAt(new Date(wall), timeZone);
  const second = wall - offsetAt(new Date(first), timeZone);
  return new Date(Math.min(first, second));
}

/** O dia `n` dias depois (ou antes, com `n` negativo). */
export function addDays(date: LocalDate, n: number): LocalDate {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) + n * DAY_MS).toISOString().slice(0, 10);
}

/** O dia da semana (1 a 7, segunda a domingo) de um dia do calendário. */
export function weekdayOf(date: LocalDate): number {
  const [y, m, d] = date.split('-').map(Number);
  const sunday0 = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return sunday0 === 0 ? 7 : sunday0;
}
