// Cargos: criar, editar, ordenar, apagar, o cargo da pessoa e passar o grupo (GRV-40–49).
import { randomUUID } from 'node:crypto';
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import type {
  StoredGroup,
  StoredMembership,
  StoredRole,
} from '@scorely/api/src/modules/groups/data/groups.repository';
import type { GroupContext } from '@scorely/api/src/modules/groups/rules/groups';
import {
  type GroupRoles,
  permissionsOf,
  rankOf,
  requireBelow,
  requirePermission,
  roleRefOf,
} from '@scorely/api/src/modules/groups/rules/permissions';
import {
  type CreateGroupRoleInput,
  type DeleteGroupRoleInput,
  GROUP_ROLE_MAX,
  type GroupPermission,
  type GroupRoleItem,
  type GroupRoles as GroupRolesView,
  type OrderGroupRolesInput,
  type PublicGroupId,
  type PublicUserId,
  type SetMemberRoleInput,
  type TransferGroupInput,
  type UpdateGroupRoleInput,
} from '@scorely/contracts';

/** GRV-44: nome sem maiúsculas e acentos, para comparar. */
const normalizeRoleName = (name: string) => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** GRV-44: "Dono" e "Todos" são dos cargos fixos. */
const RESERVED_ROLE_NAMES = ['dono', 'todos'];

/** GRV-45: o Todos não recebe o que é de quem tem alguém abaixo. */
const NOT_FOR_EVERYONE: readonly GroupPermission[] = ['members.remove', 'roles.manage'];

export function roleRules(ctx: GroupContext) {
  const { deps, now, access } = ctx;

  const validation = (path: string, message: string) =>
    appError('VALIDATION_ERROR', { issues: [{ code: 'custom', path: [path], message }] });

  /** O cargo criado da lista; um id que não está nela é `GROUP_ROLE_NOT_FOUND` (404). */
  function findRole(stored: GroupRoles, roleId: string): StoredRole {
    const found = stored.roles.find((r) => r.id === roleId);
    if (!found) throw appError('GROUP_ROLE_NOT_FOUND');
    return found;
  }

  /** GRV-44: o nome não repete (sem maiúsculas e acentos) nem toma o de um cargo fixo. `except`: o cargo editado. */
  function checkRoleName(stored: GroupRoles, name: string, except?: string): void {
    const wanted = normalizeRoleName(name);
    const taken =
      RESERVED_ROLE_NAMES.includes(wanted) ||
      stored.roles.some((r) => r.id !== except && normalizeRoleName(r.name) === wanted);
    if (taken) throw appError('GROUP_ROLE_NAME_TAKEN');
  }

  /** GRV-44, 45: quem edita só dá e tira as permissões que tem; as outras ficam como estão. */
  function checkGranted(
    membership: StoredMembership,
    stored: GroupRoles,
    before: readonly GroupPermission[],
    after: readonly GroupPermission[],
  ): void {
    const mine = permissionsOf(membership, stored);
    const changed = [
      ...before.filter((p) => !after.includes(p)),
      ...after.filter((p) => !before.includes(p)),
    ];
    const missing = changed.find((p) => !mine.includes(p));
    if (missing) throw appError('GROUP_PERMISSION_DENIED', { permission: missing });
  }

  /** GRV-42: Dono, os criados na ordem e o Todos, com a contagem de pessoas e o que quem pede pode mexer. */
  async function rolesView(
    id: StoredGroup['id'],
    membership: StoredMembership,
    consistent: boolean,
  ): Promise<GroupRolesView> {
    const [stored, list] = await Promise.all([
      deps.groups.getRoles(id, { consistent }),
      deps.groups.listMembers(id),
    ]);
    const count = (roleId: string) => list.filter((m) => roleRefOf(m, stored).id === roleId).length;
    const mine = rankOf(membership, stored);
    const items: GroupRoleItem[] = [
      {
        id: 'owner',
        permissions: permissionsOf({ role: 'owner' }, stored),
        members: count('owner'),
        manageable: false,
        fixed: 'owner',
      },
      ...stored.roles.map((r) => ({
        id: r.id,
        name: r.name,
        permissions: r.permissions,
        members: count(r.id),
        manageable: mine > rankOf({ role: r.id }, stored),
      })),
      {
        id: 'everyone',
        permissions: stored.everyonePermissions,
        members: count('everyone'),
        manageable: mine > 0,
        fixed: 'everyone',
      },
    ];
    return { version: stored.version, roles: items };
  }

  /** GRV-42: quem tem `roles.manage` vê os cargos. */
  async function listRoles(userId: UserId, publicId: PublicGroupId): Promise<GroupRolesView> {
    const { id, membership, roles } = await access(userId, publicId);
    requirePermission(membership, roles, 'roles.manage');
    return rolesView(id, membership, false);
  }

  /** O que as edições dos cargos têm em comum: quem pode, e os cargos lidos com força (a `version` confere na gravação). */
  async function editAccess(userId: UserId, publicId: PublicGroupId) {
    const { id, membership, roles } = await access(userId, publicId);
    requirePermission(membership, roles, 'roles.manage');
    return { id, membership, stored: await deps.groups.getRoles(id, { consistent: true }) };
  }

  /** GRV-44: cria o cargo, logo acima do Todos. */
  async function createRole(
    userId: UserId,
    publicId: PublicGroupId,
    input: CreateGroupRoleInput,
  ): Promise<GroupRolesView> {
    const { id, membership, stored } = await editAccess(userId, publicId);
    checkRoleName(stored, input.name);
    checkGranted(membership, stored, [], input.permissions);
    if (stored.roles.length >= GROUP_ROLE_MAX) throw appError('GROUP_ROLE_LIMIT', { limit: GROUP_ROLE_MAX });
    const role: StoredRole = {
      id: randomUUID(),
      name: input.name,
      permissions: [...new Set(input.permissions)],
    };
    await deps.groups.saveRoles(
      id,
      { roles: [...stored.roles, role], everyonePermissions: stored.everyonePermissions },
      input.expectedVersion,
      now(),
    );
    return rolesView(id, membership, true);
  }

  /** GRV-45: edita um cargo abaixo do seu; no Todos, só as permissões (o nome é ignorado). */
  async function updateRole(
    userId: UserId,
    publicId: PublicGroupId,
    roleId: string,
    input: UpdateGroupRoleInput,
  ): Promise<GroupRolesView> {
    const { id, membership, stored } = await editAccess(userId, publicId);
    const permissions = [...new Set(input.permissions)];
    if (roleId === 'everyone') {
      if (permissions.some((p) => NOT_FOR_EVERYONE.includes(p))) {
        throw validation('permissions', 'Everyone cannot have this permission');
      }
      checkGranted(membership, stored, stored.everyonePermissions, permissions);
      await deps.groups.saveRoles(
        id,
        { roles: stored.roles, everyonePermissions: permissions },
        input.expectedVersion,
        now(),
      );
      return rolesView(id, membership, true);
    }
    // O Dono ('owner') nunca está abaixo de ninguém; um id que não existe é 404.
    if (roleId !== 'owner') findRole(stored, roleId);
    requireBelow(membership, { role: roleId }, stored);
    const role = findRole(stored, roleId);
    checkRoleName(stored, input.name, roleId);
    checkGranted(membership, stored, role.permissions, permissions);
    await deps.groups.saveRoles(
      id,
      {
        roles: stored.roles.map((r) => (r.id === roleId ? { ...r, name: input.name, permissions } : r)),
        everyonePermissions: stored.everyonePermissions,
      },
      input.expectedVersion,
      now(),
    );
    return rolesView(id, membership, true);
  }

  /**
   * GRV-46: a lista nova dos cargos criados. O próprio cargo de quem ordena e os de cima precisam ficar onde estavam
   * (senão `GROUP_ROLE_TOO_HIGH`); o resto muda entre si.
   */
  async function orderRoles(
    userId: UserId,
    publicId: PublicGroupId,
    input: OrderGroupRolesInput,
  ): Promise<GroupRolesView> {
    const { id, membership, stored } = await editAccess(userId, publicId);
    const wanted = input.roleIds;
    const same =
      wanted.length === stored.roles.length &&
      new Set(wanted).size === wanted.length &&
      stored.roles.every((r) => wanted.includes(r.id));
    if (!same) throw validation('roleIds', 'The list must have exactly the created roles');
    const mine = rankOf(membership, stored);
    const moved = stored.roles.some((r, i) => rankOf({ role: r.id }, stored) >= mine && wanted[i] !== r.id);
    if (moved) throw appError('GROUP_ROLE_TOO_HIGH');
    await deps.groups.saveRoles(
      id,
      {
        roles: wanted.map((roleId) => findRole(stored, roleId)),
        everyonePermissions: stored.everyonePermissions,
      },
      input.expectedVersion,
      now(),
    );
    return rolesView(id, membership, true);
  }

  /**
   * GRV-47: apaga um cargo abaixo do seu. As pessoas dele passam a valer o Todos na hora (o id que já não está na
   * lista é o Todos, GRV-41), sem reescrever cada participação.
   */
  async function deleteRole(
    userId: UserId,
    publicId: PublicGroupId,
    roleId: string,
    input: DeleteGroupRoleInput,
  ): Promise<GroupRolesView> {
    const { id, membership, stored } = await editAccess(userId, publicId);
    if (roleId === 'everyone') throw validation('roleId', 'The Everyone role cannot be deleted');
    if (roleId !== 'owner') findRole(stored, roleId);
    requireBelow(membership, { role: roleId }, stored);
    await deps.groups.saveRoles(
      id,
      {
        roles: stored.roles.filter((r) => r.id !== roleId),
        everyonePermissions: stored.everyonePermissions,
      },
      input.expectedVersion,
      now(),
    );
    return rolesView(id, membership, true);
  }

  /** GRV-48: muda o cargo de uma pessoa abaixo do seu para um cargo abaixo (ou o Todos). Sem `version`. */
  async function setMemberRole(
    userId: UserId,
    publicId: PublicGroupId,
    targetPublicId: PublicUserId,
    input: SetMemberRoleInput,
  ): Promise<void> {
    const { id, group, membership, roles } = await access(userId, publicId);
    requirePermission(membership, roles, 'roles.manage');
    const targetId = (await deps.users.resolve([targetPublicId])).get(targetPublicId);
    if (targetId === userId) throw appError('GROUP_ROLE_TOO_HIGH');
    const target = targetId && (await deps.groups.getMembership(id, targetId));
    if (!targetId || !target) throw appError('GROUP_MEMBER_NOT_FOUND');
    requireBelow(membership, target, roles);
    const role = input.roleId === 'everyone' ? undefined : findRole(roles, input.roleId);
    requireBelow(membership, { role: input.roleId }, roles);
    if (roleRefOf(target, roles).id === input.roleId) return;
    if (!(await deps.groups.setMemberRole(id, targetId, input.roleId))) {
      throw appError('GROUP_MEMBER_NOT_FOUND');
    }
    if (role) {
      await deps.notifications.notify(targetId, {
        type: 'group_role_granted',
        title: 'Novo cargo',
        body: `Você agora é ${role.name} em ${group.name}.`,
        link: `/groups/${group.publicId}`,
      });
    }
  }

  /**
   * GRV-49: o Dono passa o grupo para um membro; o dono antigo fica com o cargo que o novo tinha. Se uma participação
   * mudou entre a leitura e a gravação, relê e decide de novo.
   */
  async function transfer(
    userId: UserId,
    publicId: PublicGroupId,
    input: TransferGroupInput,
    attempt = 0,
  ): Promise<void> {
    const { id, group, membership } = await access(userId, publicId);
    if (membership.role !== 'owner') throw appError('GROUP_OWNER_ONLY');
    const targetId = (await deps.users.resolve([input.userPublicId])).get(input.userPublicId);
    if (targetId === userId) throw validation('userPublicId', 'The group cannot be passed to yourself');
    const target = targetId && (await deps.groups.getMembership(id, targetId));
    if (!targetId || !target) throw appError('GROUP_MEMBER_NOT_FOUND');
    if (target.tier !== 'member')
      throw validation('userPublicId', 'The group can only be passed to a member');
    const result = await deps.groups.transferGroup({
      groupId: id,
      fromUserId: userId,
      toUserId: targetId,
      toRole: target.role,
      now: now(),
    });
    if (result === 'conflict') {
      if (attempt >= 2) throw new Error('Group transfer kept conflicting');
      return transfer(userId, publicId, input, attempt + 1);
    }
    await deps.notifications.notify(targetId, {
      type: 'group_transferred',
      title: 'Você recebeu o grupo',
      body: `Você agora é o dono de ${group.name}.`,
      link: `/groups/${group.publicId}`,
    });
  }

  return {
    transfer,
    roles: listRoles,
    createRole,
    updateRole,
    orderRoles,
    deleteRole,
    setMemberRole,
  };
}
