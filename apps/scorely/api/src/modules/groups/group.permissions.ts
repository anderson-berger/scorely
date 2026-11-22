import { appError } from '@scorely/api/src/lib/errors';
import type { StoredMembership } from '@scorely/api/src/modules/groups/group.repository';
import type { GroupPermission, GroupRole } from '@scorely/contracts';

/** GRV-15: o que cada cargo pode. Por enquanto, o Dono tem todas e o cargo base, nenhuma. */
const PERMISSIONS_BY_ROLE: Record<GroupRole, readonly GroupPermission[]> = {
  owner: ['group.edit', 'members.invite', 'members.remove'],
  member: [],
};

/** GRV-15, 16: as permissões de quem participa. Os cargos futuros mudam só esta resposta. */
export function permissionsOf(membership: Pick<StoredMembership, 'role'>): GroupPermission[] {
  return [...PERMISSIONS_BY_ROLE[membership.role]];
}

/** GRV-15: "pode X neste grupo?". Quem participa sem a permissão recebe `GROUP_PERMISSION_DENIED`. */
export function requirePermission(
  membership: Pick<StoredMembership, 'role'>,
  permission: GroupPermission,
): void {
  if (!permissionsOf(membership).includes(permission)) {
    throw appError('GROUP_PERMISSION_DENIED', { permission });
  }
}
