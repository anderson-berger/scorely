import { appError } from '@scorely/api/src/lib/errors';
import type { StoredMembershipV2 } from '@scorely/api/src/modules/groups-v2/group-v2.repository';
import type { GroupPermissionV2, GroupRoleV2 } from '@scorely/contracts';

/** GRV-15: o que cada cargo pode. Por enquanto, o Dono tem todas e o cargo base, nenhuma. */
const PERMISSIONS_BY_ROLE: Record<GroupRoleV2, readonly GroupPermissionV2[]> = {
  owner: ['group.edit', 'members.invite', 'members.remove'],
  member: [],
};

/** GRV-15, 16: as permissões de quem participa. Os cargos futuros mudam só esta resposta. */
export function permissionsOf(membership: Pick<StoredMembershipV2, 'role'>): GroupPermissionV2[] {
  return [...PERMISSIONS_BY_ROLE[membership.role]];
}

/** GRV-15: "pode X neste grupo?". Quem participa sem a permissão recebe `GROUP_PERMISSION_DENIED`. */
export function requirePermission(
  membership: Pick<StoredMembershipV2, 'role'>,
  permission: GroupPermissionV2,
): void {
  if (!permissionsOf(membership).includes(permission)) {
    throw appError('GROUP_PERMISSION_DENIED', { permission });
  }
}
