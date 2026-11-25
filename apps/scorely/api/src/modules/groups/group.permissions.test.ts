import type { AppError } from '@scorely/api/src/lib/errors';
import {
  isBelow,
  permissionsOf,
  rankOf,
  requireBelow,
  requirePermission,
} from '@scorely/api/src/modules/groups/group.permissions';
import { describe, expect, it } from 'vitest';

// GRV-15, 16, 41 e 43 (docs/modules/grupos.md): a função de permissões e a ordem dos cargos.

const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HELPER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Cargos do grupo, na ordem: Admin, Ajudante, e o Todos com as permissões dele. */
function rolesOf(everyonePermissions: ('group.edit' | 'members.invite')[] = []) {
  return {
    roles: [
      { id: ADMIN, name: 'Admin', permissions: ['members.invite', 'roles.manage'] as const },
      { id: HELPER, name: 'Ajudante', permissions: ['members.invite'] as const },
    ],
    everyonePermissions,
  } as unknown as Parameters<typeof permissionsOf>[1];
}

function errorOf(fn: () => void) {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e as AppError;
  }
}

describe('groups permissions', () => {
  it('GRV-15: o Dono tem todas as permissões do catálogo', () => {
    expect(permissionsOf({ role: 'owner' }, rolesOf()).sort()).toEqual([
      'competitions.manage',
      'group.edit',
      'matches.manage',
      'members.invite',
      'members.remove',
      'roles.manage',
    ]);
  });

  it('GRV-15: o Todos sem permissões marcadas não tem nenhuma', () => {
    expect(permissionsOf({ role: 'everyone' }, rolesOf())).toEqual([]);
  });

  it('GRV-15: quem participa sem a permissão recebe GROUP_PERMISSION_DENIED (403) com details.permission', () => {
    const err = errorOf(() => requirePermission({ role: 'everyone' }, rolesOf(), 'members.invite'));
    expect(err?.code).toBe('GROUP_PERMISSION_DENIED');
    expect(err?.status).toBe(403);
    expect(err?.details).toEqual({ permission: 'members.invite' });
  });

  it('GRV-15: quem tem a permissão passa', () => {
    expect(errorOf(() => requirePermission({ role: 'owner' }, rolesOf(), 'members.remove'))).toBeUndefined();
    expect(errorOf(() => requirePermission({ role: ADMIN }, rolesOf(), 'roles.manage'))).toBeUndefined();
  });

  it('GRV-41: a pessoa pode a soma do cargo dela com o Todos', () => {
    expect(permissionsOf({ role: HELPER }, rolesOf(['group.edit'])).sort()).toEqual([
      'group.edit',
      'members.invite',
    ]);
    expect(permissionsOf({ role: 'everyone' }, rolesOf(['group.edit']))).toEqual(['group.edit']);
  });

  it('GRV-41: um cargo que não está mais na lista conta como o Todos', () => {
    const gone = '99999999-9999-4999-8999-999999999999';
    expect(permissionsOf({ role: gone }, rolesOf(['members.invite']))).toEqual(['members.invite']);
  });

  it('GRV-43: a ordem é Dono, os criados na ordem da lista, Todos; o mesmo cargo não é abaixo', () => {
    const roles = rolesOf();
    expect(rankOf({ role: 'owner' }, roles)).toBeGreaterThan(rankOf({ role: ADMIN }, roles));
    expect(rankOf({ role: ADMIN }, roles)).toBeGreaterThan(rankOf({ role: HELPER }, roles));
    expect(rankOf({ role: HELPER }, roles)).toBeGreaterThan(rankOf({ role: 'everyone' }, roles));
    expect(isBelow({ role: ADMIN }, { role: HELPER }, roles)).toBe(true);
    expect(isBelow({ role: HELPER }, { role: ADMIN }, roles)).toBe(false);
    expect(isBelow({ role: HELPER }, { role: HELPER }, roles)).toBe(false);
    expect(isBelow({ role: 'owner' }, { role: ADMIN }, roles)).toBe(true);
    expect(isBelow({ role: 'owner' }, { role: 'owner' }, roles)).toBe(false);
  });

  it('GRV-43: agir no próprio nível ou acima responde GROUP_ROLE_TOO_HIGH (403)', () => {
    const roles = rolesOf();
    const err = errorOf(() => requireBelow({ role: HELPER }, { role: ADMIN }, roles));
    expect(err?.code).toBe('GROUP_ROLE_TOO_HIGH');
    expect(err?.status).toBe(403);
    expect(errorOf(() => requireBelow({ role: ADMIN }, { role: HELPER }, roles))).toBeUndefined();
  });
});
