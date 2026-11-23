import type { Locale } from '@scorely/contracts';
import { i18n } from '@scorely/web/src/i18n';
import { ref } from 'vue';

/**
 * Único lugar da web que formata data (ADR 0006; check em `checks/web.test.ts`).
 * A api manda instantes em UTC; aqui eles viram texto no idioma e no fuso efetivos do usuário.
 */
export type DateTimeStyle = 'dateTime' | 'date' | 'dayMonth' | 'time' | 'weekday' | 'weekdayShort';

const STYLES: Record<DateTimeStyle, Intl.DateTimeFormatOptions> = {
  dateTime: { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  date: { day: '2-digit', month: '2-digit', year: 'numeric' },
  dayMonth: { day: '2-digit', month: '2-digit' },
  time: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  weekday: { weekday: 'long' },
  weekdayShort: { weekday: 'short' },
};

/** Fuso do sistema operacional (pode estar errado: só sugere, o perfil manda). */
export function detectTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Reativo: trocar o fuso re-renderiza as telas que formatam datas. */
const displayTimeZone = ref(detectTimeZone());

/** Fuso em que as datas aparecem agora (perfil ou detectado). */
export function currentTimeZone(): string {
  return displayTimeZone.value;
}

export function setDisplayTimeZone(timeZone: string): void {
  displayTimeZone.value = timeZone;
}

/** Formatador no fuso pedido; se o navegador não conhece o fuso, no detectado (plano 003, D14). */
function formatter(locale: Locale, style: DateTimeStyle, timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, { ...STYLES[style], timeZone });
  } catch {
    return new Intl.DateTimeFormat(locale, { ...STYLES[style], timeZone: detectTimeZone() });
  }
}

export function formatDateTime(
  iso: string,
  style: DateTimeStyle = 'dateTime',
  opts: { timeZone?: string; locale?: Locale } = {},
): string {
  const locale = opts.locale ?? i18n.global.locale.value;
  const timeZone = opts.timeZone ?? displayTimeZone.value;
  return formatter(locale, style, timeZone).format(new Date(iso));
}

/** A data local (`YYYY-MM-DD`) de um instante num fuso (ex.: "hoje" no fuso do grupo, para as temporadas). */
export function localDateIn(timeZone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** As partes de um instante num fuso, em números. */
function zonedParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  };
}

/** Quanto o fuso está à frente do UTC naquele instante, em ms. */
function offsetOf(at: Date, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** O valor de um `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`) para um instante, no fuso pedido. */
export function zonedInputValue(iso: string, timeZone: string = currentTimeZone()): string {
  const p = zonedParts(new Date(iso), timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** O instante (ISO em UTC) de um `YYYY-MM-DDTHH:mm` lido no fuso pedido (ADR 0006); `undefined` se inválido. */
export function zonedInputToIso(value: string, timeZone: string = currentTimeZone()): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Duas voltas: o fuso de verão pode mudar o deslocamento entre o palpite e o instante certo.
  const first = wall - offsetOf(new Date(wall), timeZone);
  return new Date(wall - offsetOf(new Date(first), timeZone)).toISOString();
}
