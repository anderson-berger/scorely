import { describe, expect, it } from 'vitest';
import {
  effectiveLocale,
  effectiveTimeZone,
  localeFromLanguages,
  readStoredLocale,
  storeLocale,
} from './preferences';

/** `localStorage` em memória. */
function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

/** Storage que falha (modo privado, cota estourada, bloqueado pelo navegador). */
const brokenStorage = {
  getItem: (): string | null => {
    throw new Error('SecurityError');
  },
  setItem: (): void => {
    throw new Error('QuotaExceededError');
  },
};

describe('preferences: idioma efetivo (D3)', () => {
  it("caso 7: navegador ['en-US'], nada salvo, sem login → en", () => {
    expect(localeFromLanguages(['en-US'])).toBe('en');
    expect(effectiveLocale({ stored: null, languages: ['en-US'] })).toBe('en');
  });

  it('caso 7: idioma não suportado ou lista vazia → en', () => {
    expect(localeFromLanguages(['es-ES'])).toBe('en');
    expect(localeFromLanguages([])).toBe('en');
  });

  it('caso 7: só o 1º idioma do navegador conta', () => {
    expect(localeFromLanguages(['en-US', 'pt-BR'])).toBe('en');
    expect(localeFromLanguages(['pt-BR', 'en-US'])).toBe('pt-BR');
  });

  it("caso 8: navegador ['pt-PT'] → pt-BR", () => {
    expect(localeFromLanguages(['pt-PT'])).toBe('pt-BR');
    expect(localeFromLanguages(['pt'])).toBe('pt-BR');
    expect(effectiveLocale({ stored: null, languages: ['pt-PT'] })).toBe('pt-BR');
  });

  it('caso 9: usuário com locale en e navegador em pt → en (o perfil manda)', () => {
    expect(effectiveLocale({ user: { locale: 'en' }, stored: 'pt-BR', languages: ['pt-BR'] })).toBe('en');
  });

  it('caso 9: depois do logout, o idioma salvo no navegador (en) vale no login', () => {
    const storage = memoryStorage();
    storeLocale('en', storage);
    expect(readStoredLocale(storage)).toBe('en');
    expect(effectiveLocale({ stored: readStoredLocale(storage), languages: ['pt-BR'] })).toBe('en');
  });

  it('caso 9: usuário sem locale → idioma salvo → navegador', () => {
    expect(effectiveLocale({ user: {}, stored: 'en', languages: ['pt-BR'] })).toBe('en');
    expect(effectiveLocale({ user: {}, stored: null, languages: ['pt-BR'] })).toBe('pt-BR');
  });

  it('caso 9: idioma salvo inválido é ignorado', () => {
    expect(effectiveLocale({ stored: 'es', languages: ['pt-BR'] })).toBe('pt-BR');
    expect(effectiveLocale({ stored: '', languages: ['en-US'] })).toBe('en');
  });

  it('caso 9: guarda na chave scorely.locale', () => {
    const storage = memoryStorage();
    storeLocale('en', storage);
    expect(storage.items.get('scorely.locale')).toBe('en');
    expect(readStoredLocale(memoryStorage())).toBeNull();
  });

  it('caso 9: erro do storage é engolido (null / nada)', () => {
    expect(readStoredLocale(brokenStorage)).toBeNull();
    expect(() => storeLocale('en', brokenStorage)).not.toThrow();
  });
});

describe('preferences: fuso efetivo (D4)', () => {
  it('caso 11: user.timeZone vence o detectado', () => {
    expect(effectiveTimeZone({ user: { timeZone: 'Asia/Tokyo' }, detected: 'America/Sao_Paulo' })).toBe(
      'Asia/Tokyo',
    );
  });

  it('caso 12: sem fuso no perfil → o detectado', () => {
    expect(effectiveTimeZone({ detected: 'America/Manaus' })).toBe('America/Manaus');
    expect(effectiveTimeZone({ user: {}, detected: 'America/Manaus' })).toBe('America/Manaus');
  });
});
