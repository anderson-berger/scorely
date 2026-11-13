import { ptBR } from '@scorely/web/src/i18n/locales/pt-BR';
import { groupTabs, showGroupTimeZone, tabRedirect } from '@scorely/web/src/modules/groups/tabs';
import { describe, expect, it } from 'vitest';

describe('groupTabs', () => {
  it('GRP-29: quem não é dono vê 3 abas: Jogo, Times e Membros', () => {
    expect(groupTabs(false)).toEqual(['group', 'group-teams', 'group-members']);
  });

  it('GRP-29: o dono vê 4 abas: Jogo, Times, Membros e Ajustes', () => {
    expect(groupTabs(true)).toEqual(['group', 'group-teams', 'group-members', 'group-settings']);
  });
});

describe('tabRedirect', () => {
  it('caso 3: Ajustes sem ser dono → volta para o Jogo', () => {
    expect(tabRedirect('group-settings', false)).toBe('group');
  });

  it('caso 3: Ajustes sendo dono → fica', () => {
    expect(tabRedirect('group-settings', true)).toBeUndefined();
  });

  it('caso 3: Membros e Jogo sem ser dono → ficam', () => {
    expect(tabRedirect('group-members', false)).toBeUndefined();
    expect(tabRedirect('group', false)).toBeUndefined();
  });

  it('GRP-29: a aba Times é de todos → quem não é dono fica', () => {
    expect(tabRedirect('group-teams', false)).toBeUndefined();
    expect(tabRedirect('group-teams', true)).toBeUndefined();
  });
});

describe('showGroupTimeZone', () => {
  it('caso 4: mesmo fuso do usuário → não mostra', () => {
    expect(showGroupTimeZone('America/Sao_Paulo', 'America/Sao_Paulo')).toBe(false);
  });

  it('caso 4: fuso diferente do usuário → mostra', () => {
    expect(showGroupTimeZone('America/Sao_Paulo', 'Europe/Lisbon')).toBe(true);
  });
});

describe('nome das abas', () => {
  const label = (key: 'game' | 'teams' | 'members' | 'settings'): unknown =>
    (ptBR.groups.tabs as Record<string, unknown>)[key];

  it('GRP-29: as 4 abas se chamam Jogo, Times, Membros e Ajustes', () => {
    expect(['game', 'teams', 'members', 'settings'].map((k) => label(k as 'game'))).toEqual([
      'Jogo',
      'Times',
      'Membros',
      'Ajustes',
    ]);
  });

  it('GRP-29: o nome da aba não leva contagem (sem parâmetro no texto)', () => {
    for (const key of ['game', 'teams', 'members', 'settings'] as const) {
      expect(String(label(key))).not.toMatch(/[{}\d]/);
    }
  });
});
