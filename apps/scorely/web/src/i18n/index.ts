import type { Locale } from '@scorely/contracts';
import { createI18n } from 'vue-i18n';
import { en } from './locales/en';
import { type MessageSchema, ptBR } from './locales/pt-BR';

export type { Locale };

export const i18n = createI18n<[MessageSchema], Locale, false>({
  legacy: false,
  locale: 'pt-BR',
  fallbackLocale: 'en',
  messages: { 'pt-BR': ptBR, en },
});

/** `t` para usar fora de componentes (stores, helpers). Nos componentes, use `this.$t`. */
export const t = i18n.global.t;
