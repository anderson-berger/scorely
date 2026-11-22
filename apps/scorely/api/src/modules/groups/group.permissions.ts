import { appError } from '@scorely/api/src/lib/errors';
import type { StoredMembership, StoredRoles } from '@scorely/api/src/modules/groups/group.repository';
import { type GroupPermission, GroupPermissionSchema, type GroupRoleRef } from '@scorely/contracts';

/** Os cargos do grupo como as permissões precisam: os criados, na ordem, e as permissões do Todos (GRV-40, 41). */
export type GroupRoles = Pick<StoredRoles, 'roles' | 'everyonePermissions'>;
type Holder = Pick<StoredMembership, 'role'>;

/** GRV-15: o catálogo inteiro, na ordem do contrato. O Dono tem todas, inclusive as que entrarem depois (GRV-41). */
const ALL_PERMISSIONS: readonly GroupPermission[] = GroupPermissionSchema.options;

/** O cargo criado da pessoa; um id que já não está na lista (cargo apagado, GRV-47) é o Todos. */
function createdRoleOf(holder: Holder, roles: GroupRoles) {
  return roles.roles.find((r) => r.id === holder.role);
}

/** GRV-40: o cargo como a resposta mostra; os fixos sem nome, o criado com o nome. */
export function roleRefOf(holder: Holder, roles: GroupRoles): GroupRoleRef {
  if (holder.role === 'owner') return { id: 'owner' };
  const created = createdRoleOf(holder, roles);
  return created ? { id: created.id, name: created.name } : { id: 'everyone' };
}

/** GRV-15, 16, 41: as permissões de quem participa, a soma do cargo com o Todos. */
export function permissionsOf(holder: Holder, roles: GroupRoles): GroupPermission[] {
  if (holder.role === 'owner') return [...ALL_PERMISSIONS];
  const own = createdRoleOf(holder, roles)?.permissions ?? [];
  return ALL_PERMISSIONS.filter((p) => roles.everyonePermissions.includes(p) || own.includes(p));
}

/** GRV-15: "pode X neste grupo?". Quem participa sem a permissão recebe `GROUP_PERMISSION_DENIED`. */
export function requirePermission(holder: Holder, roles: GroupRoles, permission: GroupPermission): void {
  if (!permissionsOf(holder, roles).includes(permission)) {
    throw appError('GROUP_PERMISSION_DENIED', { permission });
  }
}

/** GRV-43: o lugar na ordem. Dono no topo, os criados na ordem da lista, Todos (e cargo apagado) embaixo, com 0. */
export function rankOf(holder: Holder, roles: GroupRoles): number {
  if (holder.role === 'owner') return Number.POSITIVE_INFINITY;
  const index = roles.roles.findIndex((r) => r.id === holder.role);
  return index < 0 ? 0 : roles.roles.length - index;
}

/** GRV-43: `target` está mais embaixo na ordem que `actor`; o mesmo cargo não é abaixo. */
export function isBelow(actor: Holder, target: Holder, roles: GroupRoles): boolean {
  return rankOf(actor, roles) > rankOf(target, roles);
}

/** GRV-43: agir no próprio nível ou acima responde `GROUP_ROLE_TOO_HIGH`. */
export function requireBelow(actor: Holder, target: Holder, roles: GroupRoles): void {
  if (!isBelow(actor, target, roles)) throw appError('GROUP_ROLE_TOO_HIGH');
}
