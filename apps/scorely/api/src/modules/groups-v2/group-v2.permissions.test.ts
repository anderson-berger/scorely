import type { AppError } from '@scorely/api/src/lib/errors';
import { permissionsOf, requirePermission } from '@scorely/api/src/modules/groups-v2/group-v2.permissions';
import { describe, expect, it } from 'vitest';

// GRV-15 e GRV-16 (docs/modules/grupos-v2.md).

function errorOf(fn: () => void) {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e as AppError;
  }
}

describe('groups-v2 permissions', () => {
  it('GRV-15: o Dono tem todas as permissões do catálogo', () => {
    expect(permissionsOf({ role: 'owner' }).sort()).toEqual([
      'group.edit',
      'members.invite',
      'members.remove',
    ]);
  });

  it('GRV-15: o cargo base (membro ou reserva) não tem nenhuma', () => {
    expect(permissionsOf({ role: 'member' })).toEqual([]);
  });

  it('GRV-15: quem participa sem a permissão recebe GROUP_PERMISSION_DENIED (403) com details.permission', () => {
    const err = errorOf(() => requirePermission({ role: 'member' }, 'members.invite'));
    expect(err?.code).toBe('GROUP_PERMISSION_DENIED');
    expect(err?.status).toBe(403);
    expect(err?.details).toEqual({ permission: 'members.invite' });
  });

  it('GRV-15: quem tem a permissão passa', () => {
    expect(errorOf(() => requirePermission({ role: 'owner' }, 'members.remove'))).toBeUndefined();
  });
});
