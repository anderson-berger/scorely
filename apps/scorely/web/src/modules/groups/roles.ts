import {
  type Group,
  type GroupMember,
  type GroupPermission,
  GroupPermissionSchema,
  type GroupRoleItem,
  type GroupRoleRef,
} from '@scorely/contracts';
import { can } from '@scorely/web/src/modules/groups/nav';

// Lógica pura das telas de cargos (GRV-32, 46, 48, 50, 51). A ordem e o que cada pessoa pode mexer vêm da api
// (`manageable`, GRV-43): aqui a tela só escolhe o que mostrar.

const CATALOG = GroupPermissionSchema.options;

/** O que o Todos não recebe: não há ninguém abaixo dele para remover ou gerenciar (GRV-45). */
const NOT_FOR_EVERYONE: GroupPermission[] = ['members.remove', 'roles.manage'];

/** GRV-32: a marca do cargo na linha da pessoa. O Todos não tem. */
export function roleMark(role: GroupRoleRef): { kind: 'owner' } | { kind: 'custom'; name: string } | null {
  if ('name' in role) return { kind: 'custom', name: role.name };
  return role.id === 'owner' ? { kind: 'owner' } : null;
}

/** GRV-32: as ações do menu da linha de uma pessoa. */
export function memberActions(
  group: Pick<Group, 'myPermissions'>,
  member: Pick<GroupMember, 'manageable'>,
): ('remove' | 'changeRole')[] {
  if (!member.manageable) return [];
  const actions: ('remove' | 'changeRole')[] = [];
  if (can(group, 'members.remove')) actions.push('remove');
  if (can(group, 'roles.manage')) actions.push('changeRole');
  return actions;
}

/** GRV-32, 48: os cargos que se pode dar a alguém: os abaixo do meu e o Todos, nunca o Dono. */
export function roleChoices(roles: GroupRoleItem[]): GroupRoleItem[] {
  return roles.filter((r) => r.manageable && r.id !== 'owner');
}

/**
 * GRV-46, 50: Subir/Descer. Devolve os ids dos cargos criados na ordem nova (o corpo do `PUT roles/order`), ou `null`
 * quando não dá: o cargo não é criado nem `manageable`, está na ponta, ou o vizinho não é `manageable` (só se ordena
 * entre os que estão abaixo do meu).
 */
export function moveRole(roles: GroupRoleItem[], roleId: string, dir: 'up' | 'down'): string[] | null {
  const index = roles.findIndex((r) => r.id === roleId);
  const role = roles[index];
  if (!role || role.fixed || !role.manageable) return null;
  const target = dir === 'up' ? index - 1 : index + 1;
  const neighbor = roles[target];
  if (!neighbor || neighbor.fixed || !neighbor.manageable) return null;
  const moved = [...roles];
  moved[index] = neighbor;
  moved[target] = role;
  return moved.filter((r) => !r.fixed).map((r) => r.id);
}

/**
 * GRV-51, 45: as linhas do painel do cargo, na ordem do catálogo. `role` nulo é o cargo novo. `locked`: quem edita não
 * tem a permissão, então ela fica como está.
 */
export function rolePanelPermissions(
  role: GroupRoleItem | null,
  myPermissions: GroupPermission[],
): { permission: GroupPermission; on: boolean; locked: boolean }[] {
  return CATALOG.filter((p) => !(role?.fixed === 'everyone' && NOT_FOR_EVERYONE.includes(p))).map(
    (permission) => ({
      permission,
      on: role?.permissions.includes(permission) ?? false,
      locked: !myPermissions.includes(permission),
    }),
  );
}

/** GRV-51: o modelo só preenche o painel. Admin = todas as permissões que quem cria tem; Do zero = nenhuma. */
export function roleTemplate(
  template: 'admin' | 'scratch',
  myPermissions: GroupPermission[],
): GroupPermission[] {
  return template === 'admin' ? CATALOG.filter((p) => myPermissions.includes(p)) : [];
}
