import { en } from '@scorely/web/src/i18n/locales/en';
import { ptBR } from '@scorely/web/src/i18n/locales/pt-BR';
import { describe, expect, it } from 'vitest';

/** Caminhos de todas as folhas (`a.b.c`) de um objeto de mensagens; arrays contam como folha. */
function leafPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k));
}

function at(messages: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      messages,
    );
}

describe('i18n: pt-BR e en', () => {
  it('caso 14: os dois idiomas têm exatamente as mesmas chaves', () => {
    expect(leafPaths(en).sort()).toEqual(leafPaths(ptBR).sort());
  });
});

// Plano 013 (D8).
const NAV_KEYS = ['nav.groups', 'nav.profile', 'nav.logout', 'nav.open'];
const REMOVED_NAV_KEYS = ['layout.profile', 'layout.logout', 'home.myGroups'];

describe('i18n: menu lateral (plano 013)', () => {
  it.each(NAV_KEYS)('caso 7: %s existe em pt-BR e en, com texto', (key) => {
    for (const messages of [ptBR, en]) {
      const value = at(messages, key);
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    }
  });

  it('caso 7: textos em pt-BR (D8)', () => {
    expect(at(ptBR, 'nav.groups')).toBe('Grupos');
    expect(at(ptBR, 'nav.profile')).toBe('Perfil');
    expect(at(ptBR, 'nav.logout')).toBe('Sair');
    expect(at(ptBR, 'nav.open')).toBe('Abrir menu');
  });

  it.each(REMOVED_NAV_KEYS)('caso 7: %s sai das duas línguas', (key) => {
    expect(at(ptBR, key)).toBeUndefined();
    expect(at(en, key)).toBeUndefined();
  });
});
