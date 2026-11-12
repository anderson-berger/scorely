import { groupTabs, showGroupTimeZone, tabRedirect } from '@scorely/web/src/modules/groups/tabs';
import { describe, expect, it } from 'vitest';

describe('groupTabs', () => {
  it('caso 1: membro vê Jogo e Membros', () => {
    expect(groupTabs(false)).toEqual(['group', 'group-members']);
  });

  it('caso 2: dono vê Jogo, Membros e Ajustes', () => {
    expect(groupTabs(true)).toEqual(['group', 'group-members', 'group-settings']);
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
});

describe('showGroupTimeZone', () => {
  it('caso 4: mesmo fuso do usuário → não mostra', () => {
    expect(showGroupTimeZone('America/Sao_Paulo', 'America/Sao_Paulo')).toBe(false);
  });

  it('caso 4: fuso diferente do usuário → mostra', () => {
    expect(showGroupTimeZone('America/Sao_Paulo', 'Europe/Lisbon')).toBe(true);
  });
});
