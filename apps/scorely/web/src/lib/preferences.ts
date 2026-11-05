import { type Locale, LocaleSchema, type User } from '@scorely/contracts';
import { i18n } from '@/i18n';
import { detectTimeZone, setDisplayTimeZone } from './datetime';

/** Idioma e fuso efetivos (plano 005, D3/D4). O perfil manda; antes do login, o navegador. */
const STORAGE_KEY = 'scorely.locale';

/** Só o 1º idioma do navegador conta: `pt*` → `pt-BR`; qualquer outro → `en`. */
export function localeFromLanguages(languages: readonly string[]): Locale {
  return languages[0]?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

export function effectiveLocale(input: {
  user?: Pick<User, 'locale'>;
  stored?: string | null;
  languages: readonly string[];
}): Locale {
  const stored = LocaleSchema.safeParse(input.stored);
  return input.user?.locale ?? (stored.success ? stored.data : localeFromLanguages(input.languages));
}

export function effectiveTimeZone(input: { user?: Pick<User, 'timeZone'>; detected: string }): string {
  return input.user?.timeZone ?? input.detected;
}

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** Último idioma usado neste navegador (para a tela de login depois de sair). Erro do storage → `null`. */
export function readStoredLocale(
  storage: Pick<Storage, 'getItem'> | undefined = browserStorage(),
): string | null {
  try {
    return storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function storeLocale(
  locale: Locale,
  storage: Pick<Storage, 'setItem'> | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(STORAGE_KEY, locale);
  } catch {
    // modo privado, cota estourada: segue sem lembrar
  }
}

function browserLanguages(): readonly string[] {
  return typeof navigator === 'undefined' ? [] : navigator.languages;
}

/**
 * Aplica idioma e fuso efetivos na web inteira: i18n, `<html lang>` e fuso das datas.
 * O auth store chama no login, no `loadMe`, no `updateProfile` e no logout (sem usuário).
 */
export function applyPreferences(user?: Pick<User, 'locale' | 'timeZone'>): void {
  const locale = effectiveLocale({
    ...(user && { user }),
    stored: readStoredLocale(),
    languages: browserLanguages(),
  });
  i18n.global.locale.value = locale;
  storeLocale(locale);
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  setDisplayTimeZone(effectiveTimeZone({ ...(user && { user }), detected: detectTimeZone() }));
}
