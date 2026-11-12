import type { Preferences } from '@scorely/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

// USR-14 (docs/modules/usuarios.md): o navegador guarda as preferências em `scorely.preferences` e só troca o
// idioma e o fuso quando chegam outras. A chave `scorely.locale` (último idioma, para a tela de login) continua.

const PREFS_KEY = 'scorely.preferences';
const LOCALE_KEY = 'scorely.locale';

/** `localStorage` em memória; `writes` registra cada `setItem` (para conferir "nada gravado"). */
function memoryStorage(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed));
  const writes: string[] = [];
  return {
    items,
    writes,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes.push(key);
      items.set(key, value);
    },
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
    key: (i: number) => [...items.keys()][i] ?? null,
    get length() {
      return items.size;
    },
  };
}

/**
 * Abre o app do zero (módulos novos) com o storage e os idiomas do navegador dados: o que for lido no boot
 * já vê esse storage.
 */
async function boot(seed: Record<string, string> = {}, languages: readonly string[] = ['pt-BR']) {
  vi.resetModules();
  const storage = memoryStorage(seed);
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('navigator', { languages, language: languages[0] });
  const prefs = await import('@scorely/web/src/lib/preferences');
  const { i18n } = await import('@scorely/web/src/i18n');
  const datetime = await import('@scorely/web/src/lib/datetime');
  return {
    storage,
    prefs,
    locale: () => i18n.global.locale.value,
    setLocale: (l: 'pt-BR' | 'en') => {
      i18n.global.locale.value = l;
    },
    timeZone: () => datetime.currentTimeZone(),
    setTimeZone: datetime.setDisplayTimeZone,
    detected: datetime.detectTimeZone(),
    saved: (): Preferences | undefined => {
      const raw = storage.items.get(PREFS_KEY);
      return raw === undefined ? undefined : JSON.parse(raw);
    },
  };
}

const saved = (p: Preferences) => ({ [PREFS_KEY]: JSON.stringify(p) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('preferências guardadas no navegador (USR-14)', () => {
  it('USR-14: o app abre no idioma e no fuso guardados, sem esperar o servidor', async () => {
    const t = await boot(saved({ locale: 'en', timeZone: 'Asia/Tokyo' }), ['pt-BR']);
    t.prefs.applyPreferences();
    expect(t.locale()).toBe('en');
    expect(t.timeZone()).toBe('Asia/Tokyo');
  });

  it('USR-06: sem idioma nas preferências guardadas → o último usado no navegador → o do navegador', async () => {
    const a = await boot({ ...saved({ timeZone: 'Asia/Tokyo' }), [LOCALE_KEY]: 'en' }, ['pt-BR']);
    a.prefs.applyPreferences();
    expect(a.locale()).toBe('en');
    const b = await boot(saved({ timeZone: 'Asia/Tokyo' }), ['pt-BR']);
    b.prefs.applyPreferences();
    expect(b.locale()).toBe('pt-BR');
  });

  it('USR-07: sem fuso nas preferências guardadas → o fuso do navegador', async () => {
    const t = await boot(saved({ locale: 'en' }));
    t.prefs.applyPreferences();
    expect(t.timeZone()).toBe(t.detected);
  });

  it('USR-14: chegaram preferências novas → aplica o idioma e o fuso e guarda no navegador', async () => {
    const t = await boot({}, ['pt-BR']);
    t.prefs.applyPreferences();
    t.prefs.updatePreferences({ locale: 'en', timeZone: 'Asia/Tokyo' });
    expect(t.locale()).toBe('en');
    expect(t.timeZone()).toBe('Asia/Tokyo');
    expect(t.saved()).toEqual({ locale: 'en', timeZone: 'Asia/Tokyo' });
  });

  it('USR-14: chegaram iguais às guardadas → nada muda na tela e nada é gravado', async () => {
    const t = await boot(saved({ locale: 'en', timeZone: 'Asia/Tokyo' }), ['pt-BR']);
    t.prefs.applyPreferences();
    // Marcadores: se o update reaplicasse, o idioma e o fuso voltariam para en/Tokyo.
    t.setLocale('pt-BR');
    t.setTimeZone('Europe/Lisbon');
    const writesBefore = t.storage.writes.filter((k) => k === PREFS_KEY).length;
    t.prefs.updatePreferences({ locale: 'en', timeZone: 'Asia/Tokyo' });
    expect(t.locale()).toBe('pt-BR');
    expect(t.timeZone()).toBe('Europe/Lisbon');
    expect(t.storage.writes.filter((k) => k === PREFS_KEY).length).toBe(writesBefore);
  });

  it('USR-14: só o fuso mudou (outro aparelho) → troca o fuso e mantém o idioma', async () => {
    const t = await boot(saved({ locale: 'en', timeZone: 'Asia/Tokyo' }), ['pt-BR']);
    t.prefs.applyPreferences();
    t.prefs.updatePreferences({ locale: 'en', timeZone: 'Europe/Lisbon' });
    expect(t.locale()).toBe('en');
    expect(t.timeZone()).toBe('Europe/Lisbon');
    expect(t.saved()).toEqual({ locale: 'en', timeZone: 'Europe/Lisbon' });
  });

  it('USR-14: as preferências guardadas valem no próximo boot', async () => {
    const first = await boot({}, ['pt-BR']);
    first.prefs.applyPreferences();
    first.prefs.updatePreferences({ locale: 'en', timeZone: 'Asia/Tokyo' });
    const second = await boot(Object.fromEntries(first.storage.items), ['pt-BR']);
    second.prefs.applyPreferences();
    expect(second.locale()).toBe('en');
    expect(second.timeZone()).toBe('Asia/Tokyo');
  });
});
