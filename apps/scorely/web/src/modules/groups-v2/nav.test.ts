import type { GroupPermissionV2, GroupV2 } from '@scorely/contracts/src/groups-v2';
import { can, groupV2NavItems } from '@scorely/web/src/modules/groups-v2/nav';
import { describe, expect, it } from 'vitest';

const group = (myPermissions: GroupPermissionV2[]): GroupV2 =>
  ({
    id: 'K3X9PQ2A',
    createdAt: '2026-11-20T10:00:00.000Z',
    version: 1,
    name: 'Pelada de sexta',
    myTier: 'member',
    myRole: 'member',
    myPermissions,
  }) as GroupV2;

describe('groupV2NavItems', () => {
  it('GRV-13, GRV-16: quem tem group.edit vê Início, Membros e Configurações, nessa ordem, com as rotas de cada área', () => {
    const items = groupV2NavItems(group(['group.edit']));
    expect(items.map((i) => i.key)).toEqual(['home', 'members', 'settings']);
    expect(items.map((i) => i.to.name)).toEqual(['group-v2', 'group-v2-members', 'group-v2-settings']);
  });

  it('GRV-13: cada área tem ícone', () => {
    for (const item of groupV2NavItems(group(['group.edit']))) {
      expect(item.icon).toBeTruthy();
    }
  });

  it('GRV-13, GRV-14: sem group.edit, Configurações não aparece; Início e Membros sim', () => {
    expect(groupV2NavItems(group([])).map((i) => i.key)).toEqual(['home', 'members']);
  });

  it('GRV-13: a lista de convites conta como a área Membros', () => {
    const members = groupV2NavItems(group([])).find((i) => i.key === 'members');
    expect(members?.active).toContain('group-v2-invites');
  });

  it('GRV-16: can confere a permissão pelo myPermissions', () => {
    expect(can(group(['members.invite']), 'members.invite')).toBe(true);
    expect(can(group(['members.invite']), 'members.remove')).toBe(false);
  });
});
