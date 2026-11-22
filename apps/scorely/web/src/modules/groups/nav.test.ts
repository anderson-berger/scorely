import type { Group, GroupPermission } from '@scorely/contracts/src/groups';
import { can, groupNavItems } from '@scorely/web/src/modules/groups/nav';
import { describe, expect, it } from 'vitest';

const group = (myPermissions: GroupPermission[]): Group =>
  ({
    id: 'K3X9PQ2A',
    createdAt: '2026-11-20T10:00:00.000Z',
    version: 1,
    name: 'Pelada de sexta',
    myTier: 'member',
    myRole: 'member',
    myPermissions,
  }) as Group;

describe('groupNavItems', () => {
  it('GRV-13, GRV-16: quem tem group.edit vê Início, Membros e Configurações, nessa ordem, com as rotas de cada área', () => {
    const items = groupNavItems(group(['group.edit']));
    expect(items.map((i) => i.key)).toEqual(['home', 'members', 'settings']);
    expect(items.map((i) => i.to.name)).toEqual(['group', 'group-members', 'group-settings']);
  });

  it('GRV-13: cada área tem ícone', () => {
    for (const item of groupNavItems(group(['group.edit']))) {
      expect(item.icon).toBeTruthy();
    }
  });

  it('GRV-13, GRV-14: sem group.edit, Configurações não aparece; Início e Membros sim', () => {
    expect(groupNavItems(group([])).map((i) => i.key)).toEqual(['home', 'members']);
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
