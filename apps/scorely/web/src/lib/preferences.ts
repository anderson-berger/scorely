import { type Locale, LocaleSchema, type Preferences, PreferencesSchema } from '@scorely/contracts';
import { i18n } from '@scorely/web/src/i18n';
import { detectTimeZone, setDisplayTimeZone } from '@scorely/web/src/lib/datetime';

/** Idioma e fuso efetivos (USR-06, 07). As preferências da pessoa mandam; antes do login, o navegador. */
const STORAGE_KEY = 'scorely.locale';
/** Cópia das preferências da pessoa neste navegador (USR-14): o app abre com elas, sem esperar o servidor. */
const PREFERENCES_KEY = 'scorely.preferences';

/** Só o 1º idioma do navegador conta: `pt*` → `pt-BR`; qualquer outro → `en`. */
export function localeFromLanguages(languages: readonly string[]): Locale {
  return languages[0]?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

/** `user`: as preferências da pessoa (USR-06, passo 1). */
export function effectiveLocale(input: {
  user?: Pick<Preferences, 'locale'>;
  stored?: string | null;
  languages: readonly string[];
}): Locale {
  const stored = LocaleSchema.safeParse(input.stored);
  return input.user?.locale ?? (stored.success ? stored.data : localeFromLanguages(input.languages));
}

/** `user`: as preferências da pessoa (USR-07). */
export function effectiveTimeZone(input: { user?: Pick<Preferences, 'timeZone'>; detected: string }): string {
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

/** Preferências guardadas neste navegador (USR-14). Nada guardado, inválido ou storage com erro → `{}`. */
export function readSavedPreferences(
  storage: Pick<Storage, 'getItem'> | undefined = browserStorage(),
): Preferences {
  try {
    const raw = storage?.getItem(PREFERENCES_KEY);
    const parsed = raw ? PreferencesSchema.safeParse(JSON.parse(raw)) : undefined;
    return parsed?.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function savePreferences(preferences: Preferences): void {
  try {
    browserStorage()?.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // modo privado, cota estourada: vale só nesta abertura
  }
}

/** Ao sair da conta (USR-14): esquece as preferências da pessoa; fica só o último idioma (`scorely.locale`). */
export function clearSavedPreferences(): void {
  try {
    browserStorage()?.removeItem(PREFERENCES_KEY);
  } catch {
    // nada a fazer
  }
}

const samePreferences = (a: Preferences, b: Preferences) =>
  a.locale === b.locale && a.timeZone === b.timeZone;

/**
 * Aplica idioma e fuso efetivos na web inteira: i18n, `<html lang>` e fuso das datas.
 * Sem argumento, usa as preferências guardadas neste navegador (o boot e o logout).
 */
export function applyPreferences(preferences: Preferences = readSavedPreferences()): void {
  const locale = effectiveLocale({
    user: preferences,
    stored: readStoredLocale(),
    languages: browserLanguages(),
  });
  i18n.global.locale.value = locale;
  storeLocale(locale);
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  setDisplayTimeZone(effectiveTimeZone({ user: preferences, detected: detectTimeZone() }));
}

/**
 * Chegaram preferências do servidor (login, `/me`, `PATCH /me`, refresh). Iguais às guardadas → nada muda;
 * diferentes → guarda e aplica (USR-14).
 */
export function updatePreferences(next: Preferences): void {
  const preferences: Preferences = {
    ...(next.locale !== undefined && { locale: next.locale }),
    ...(next.timeZone !== undefined && { timeZone: next.timeZone }),
  };
  if (samePreferences(preferences, readSavedPreferences())) return;
  savePreferences(preferences);
  applyPreferences(preferences);
}
