import type { Locale } from '@scorely/contracts';
import { ref } from 'vue';
import { i18n } from '@/i18n';

/**
 * Único lugar da web que formata data (ADR 0006; check em `checks/web.test.ts`).
 * A api manda instantes em UTC; aqui eles viram texto no idioma e no fuso efetivos do usuário.
 */
export type DateTimeStyle = 'dateTime' | 'date' | 'time';

const STYLES: Record<DateTimeStyle, Intl.DateTimeFormatOptions> = {
  dateTime: { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  date: { day: '2-digit', month: '2-digit', year: 'numeric' },
  time: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
};

/** Fuso do sistema operacional (pode estar errado: só sugere, o perfil manda). */
export function detectTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Reativo: trocar o fuso re-renderiza as telas que formatam datas. */
const displayTimeZone = ref(detectTimeZone());

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
