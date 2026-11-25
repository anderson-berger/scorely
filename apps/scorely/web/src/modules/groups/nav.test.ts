import type { Group, GroupPermission } from '@scorely/contracts/src/groups';
import { can, groupNavItems, settingsSections } from '@scorely/web/src/modules/groups/nav';
import { describe, expect, it } from 'vitest';

const group = (myPermissions: GroupPermission[]): Group =>
  ({
    id: 'K3X9PQ2A',
    createdAt: '2026-11-20T10:00:00.000Z',
    version: 1,
    name: 'Pelada de sexta',
    myTier: 'member',
    myRole: { id: 'everyone' },
    myPermissions,
  }) as Group;

describe('groupNavItems', () => {
  it('GRV-13, GRV-16: quem tem group.edit vê Início, Partidas, Competição, Membros e Configurações, nessa ordem, com as rotas de cada área', () => {
    const items = groupNavItems(group(['group.edit']));
    expect(items.map((i) => i.key)).toEqual(['home', 'matches', 'competitions', 'members', 'settings']);
    expect(items.map((i) => i.to.name)).toEqual([
      'group',
      'group-matches',
      'group-competitions',
      'group-members',
      'group-settings',
    ]);
  });

  it('GRV-13: cada área tem ícone', () => {
    for (const item of groupNavItems(group(['group.edit']))) {
      expect(item.icon).toBeTruthy();
    }
  });

  it('GRV-13, GRV-14: sem group.edit, Configurações não aparece; Início, Partidas, Competição e Membros sim (PAR-17, COM-12)', () => {
    expect(groupNavItems(group([])).map((i) => i.key)).toEqual([
      'home',
      'matches',
      'competitions',
      'members',
    ]);
  });

  it('GRV-13: a lista de convites conta como a área Membros', () => {
    const members = groupNavItems(group([])).find((i) => i.key === 'members');
    expect(members?.active).toContain('group-invites');
  });

  it('GRV-16: can confere a permissão pelo myPermissions', () => {
    expect(can(group(['members.invite']), 'members.invite')).toBe(true);
    expect(can(group(['members.invite']), 'members.remove')).toBe(false);
  });
});

describe('groupNavItems com roles.manage', () => {
  it('GRV-13: quem só tem roles.manage também vê Configurações', () => {
    expect(groupNavItems(group(['roles.manage'])).map((i) => i.key)).toEqual([
      'home',
      'matches',
      'competitions',
      'members',
      'settings',
    ]);
  });

  it('GRV-13: quem só tem members.invite não vê Configurações', () => {
    expect(groupNavItems(group(['members.invite'])).map((i) => i.key)).toEqual([
      'home',
      'matches',
      'competitions',
      'members',
    ]);
  });
});

describe('settingsSections', () => {
  it('GRV-14: group.edit mostra Identidade (imagens e modalidade) e Entrada (quem pode entrar), sem Pessoas', () => {
    expect(settingsSections(group(['group.edit']))).toEqual([
      { key: 'identity', rows: ['images', 'modality'] },
      { key: 'entry', rows: ['joinMode'] },
    ]);
  });

  it('GRV-14: roles.manage mostra só Pessoas (cargos)', () => {
    expect(settingsSections(group(['roles.manage']))).toEqual([{ key: 'people', rows: ['roles'] }]);
  });

  it('GRV-14: com as duas, as seções vêm na ordem Identidade, Entrada, Pessoas', () => {
    expect(settingsSections(group(['roles.manage', 'group.edit'])).map((s) => s.key)).toEqual([
      'identity',
      'entry',
      'people',
    ]);
  });

  it('GRV-14: sem linha possível, nenhuma seção aparece', () => {
    expect(settingsSections(group(['members.invite']))).toEqual([]);
  });
});
