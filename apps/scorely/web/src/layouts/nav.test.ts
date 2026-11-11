import { describe, expect, it } from 'vitest';
import * as nav from './nav';
import { navItems } from './nav';

describe('navItems', () => {
  it('caso 5: só Grupos (D11)', () => {
    const items = navItems();
    expect(items.map((i) => i.key)).toEqual(['groups']);
    expect(items.map((i) => i.to.name)).toEqual(['groups']);
  });

  it('caso 5: Grupos tem o ícone groups', () => {
    expect(navItems()[0]?.icon).toBe('groups');
  });
});

// Plano 015 (D18): o menu abre por cima e não guarda preferência; o caso 8 do plano 013 saiu.
describe('menu sem preferência salva (plano 015, D18)', () => {
  it('caso 16: readRailExpanded e storeRailExpanded não existem mais', () => {
    expect(nav).not.toHaveProperty('readRailExpanded');
    expect(nav).not.toHaveProperty('storeRailExpanded');
  });
});
