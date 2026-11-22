import type {
  Group,
  GroupMember,
  GroupPermission,
  GroupRoleItem,
  GroupRoleRef,
} from '@scorely/contracts/src/groups';
import {
  memberActions,
  moveRole,
  roleChoices,
  roleMark,
  rolePanelPermissions,
  roleTemplate,
} from '@scorely/web/src/modules/groups/roles';
import { describe, expect, it } from 'vitest';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

const group = (myPermissions: GroupPermission[]): Group => ({ myPermissions }) as Group;
const member = (manageable: boolean): GroupMember => ({ manageable }) as GroupMember;

const item = (id: string, manageable: boolean, extra: Partial<GroupRoleItem> = {}): GroupRoleItem =>
  ({ id, name: id, permissions: [], members: 0, manageable, ...extra }) as GroupRoleItem;
const owner = item('owner', false, { name: undefined, fixed: 'owner' });
const everyone = (manageable = true) => item('everyone', manageable, { name: undefined, fixed: 'everyone' });

const CATALOG: GroupPermission[] = ['group.edit', 'members.invite', 'members.remove', 'roles.manage'];

describe('roleMark', () => {
  it('GRV-32: o Dono tem a marca de dono', () => {
    expect(roleMark({ id: 'owner' })).toEqual({ kind: 'owner' });
  });

  it('GRV-32: o cargo criado tem a marca com o nome', () => {
    const role: GroupRoleRef = { id: ID_A, name: 'Admin' };
    expect(roleMark(role)).toEqual({ kind: 'custom', name: 'Admin' });
  });

  it('GRV-32: o Todos não tem marca', () => {
    expect(roleMark({ id: 'everyone' })).toBeNull();
  });
});

describe('memberActions', () => {
  it('GRV-32: members.remove e roles.manage com manageable liberam Remover e Mudar cargo', () => {
    expect(memberActions(group(['members.remove', 'roles.manage']), member(true)).sort()).toEqual([
      'changeRole',
      'remove',
    ]);
  });

  it('GRV-32: só members.remove libera só Remover', () => {
    expect(memberActions(group(['members.remove']), member(true))).toEqual(['remove']);
  });

  it('GRV-32: só roles.manage libera só Mudar cargo', () => {
    expect(memberActions(group(['roles.manage']), member(true))).toEqual(['changeRole']);
  });

  it('GRV-32: sem manageable, nenhuma ação, mesmo com as permissões', () => {
    expect(memberActions(group(['members.remove', 'roles.manage']), member(false))).toEqual([]);
  });
});

describe('roleChoices', () => {
  it('GRV-32, GRV-48: só os manageable, sem o Dono, na ordem recebida', () => {
    const roles = [owner, item(ID_A, false), item(ID_B, true), item(ID_C, true), everyone()];
    expect(roleChoices(roles).map((r) => r.id)).toEqual([ID_B, ID_C, 'everyone']);
  });

  it('GRV-48: o Todos não manageable fica de fora', () => {
    expect(roleChoices([owner, item(ID_A, true), everyone(false)]).map((r) => r.id)).toEqual([ID_A]);
  });
});

describe('moveRole', () => {
  const roles = [owner, item(ID_A, false), item(ID_B, true), item(ID_C, true), everyone()];

  it('GRV-46, GRV-50: sobe o cargo e devolve só os criados na ordem nova', () => {
    expect(moveRole(roles, ID_C, 'up')).toEqual([ID_A, ID_C, ID_B]);
  });

  it('GRV-46, GRV-50: desce o cargo', () => {
    const three = [owner, item(ID_A, true), item(ID_B, true), item(ID_C, true), everyone()];
    expect(moveRole(three, ID_A, 'down')).toEqual([ID_B, ID_A, ID_C]);
  });

  it('GRV-46: na ponta de cima ou de baixo não dá', () => {
    const three = [owner, item(ID_A, true), item(ID_B, true), item(ID_C, true), everyone()];
    expect(moveRole(three, ID_A, 'up')).toBeNull();
    expect(moveRole(three, ID_C, 'down')).toBeNull();
  });

  it('GRV-46: o vizinho que não é manageable (do próprio cargo ou de cima) barra', () => {
    expect(moveRole(roles, ID_B, 'up')).toBeNull();
  });

  it('GRV-46: cargo não manageable não se move', () => {
    expect(moveRole(roles, ID_A, 'down')).toBeNull();
  });

  it('GRV-46: os fixos não se movem e um id que não existe não dá', () => {
    expect(moveRole(roles, 'owner', 'down')).toBeNull();
    expect(moveRole(roles, 'everyone', 'up')).toBeNull();
    expect(moveRole(roles, 'nao-existe', 'up')).toBeNull();
  });
});

describe('rolePanelPermissions', () => {
  it('GRV-51: uma linha por permissão do catálogo, na ordem, e cargo novo sem nada ligado', () => {
    const rows = rolePanelPermissions(null, CATALOG);
    expect(rows.map((r) => r.permission)).toEqual(CATALOG);
    expect(rows.every((r) => !r.on && !r.locked)).toBe(true);
  });

  it('GRV-51: on reflete as permissões do cargo', () => {
    const rows = rolePanelPermissions(item(ID_A, true, { permissions: ['members.invite'] }), CATALOG);
    expect(rows.filter((r) => r.on).map((r) => r.permission)).toEqual(['members.invite']);
  });

  it('GRV-51, GRV-45: as que quem edita não tem ficam travadas, do jeito que estão', () => {
    const role = item(ID_A, true, { permissions: ['members.remove'] });
    const rows = rolePanelPermissions(role, ['members.invite']);
    expect(rows.filter((r) => r.locked).map((r) => r.permission)).toEqual([
      'group.edit',
      'members.remove',
      'roles.manage',
    ]);
    expect(rows.find((r) => r.permission === 'members.remove')).toMatchObject({ on: true, locked: true });
    expect(rows.find((r) => r.permission === 'members.invite')).toMatchObject({ on: false, locked: false });
  });

  it('GRV-51: no Todos, members.remove e roles.manage não aparecem', () => {
    const rows = rolePanelPermissions(everyone(), CATALOG);
    expect(rows.map((r) => r.permission)).toEqual(['group.edit', 'members.invite']);
  });
});

describe('roleTemplate', () => {
  it('GRV-51: Admin liga todas as que quem cria tem, na ordem do catálogo', () => {
    expect(roleTemplate('admin', ['roles.manage', 'group.edit'])).toEqual(['group.edit', 'roles.manage']);
  });

  it('GRV-51: Do zero não liga nenhuma', () => {
    expect(roleTemplate('scratch', CATALOG)).toEqual([]);
  });
});
