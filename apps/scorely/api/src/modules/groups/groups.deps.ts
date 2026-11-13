import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import type { GameRepository } from '@scorely/api/src/modules/groups/game.repository';
import {
  type GroupRepository,
  limitsOf,
  type StoredGroup,
} from '@scorely/api/src/modules/groups/group.repository';
import type { NotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import type { UserDirectory } from '@scorely/api/src/modules/users/user.repository';
import {
  ALL_PERMISSIONS,
  type Group,
  type MemberRole,
  type Permission,
  STAFF_ROLES,
  type StaffRoleId,
} from '@scorely/contracts';

/** O que os services de grupo e de jogo recebem (o mesmo objeto para os dois). */
export interface GroupsDeps {
  groups: GroupRepository;
  games: GameRepository;
  users: UserDirectory;
  notifications: Pick<NotificationService, 'notify'>;
  now?: () => Date;
}

/** Abertura das reservas: grupo de antes da E2 abre junto com os membros (plano 007, D3). */
export function reservesHours(group: StoredGroup): number {
  return group.reservesOpenHoursBefore ?? group.listOpensHoursBefore;
}

/** Ids das mídias do logo e da capa (GRP-35): internos, gravados pela transação da mídia (MID-08). */
export type GroupImageIds = { logoMediaId?: string; coverMediaId?: string };

/** O cargo pelo id, se ele existe (GRP-52: um id desconhecido conta como sem cargo). */
export function staffRoleOf(staffRoleId: string | undefined): { id: StaffRoleId; name: string } | undefined {
  if (staffRoleId === undefined || !Object.hasOwn(STAFF_ROLES, staffRoleId)) return undefined;
  const id = staffRoleId as StaffRoleId;
  return { id, name: STAFF_ROLES[id].name };
}

/** GRP-49, 50, 52: o dono tem todas; quem tem um cargo, as dele; sem cargo (ou cargo que não existe), nenhuma. */
export function permissionsOf(
  group: StoredGroup,
  userId: UserId,
  staffRoleId: string | undefined,
): Permission[] {
  if (group.ownerId === userId) return [...ALL_PERMISSIONS];
  const role = staffRoleOf(staffRoleId);
  return role ? [...STAFF_ROLES[role.id].permissions] : [];
}

/**
 * O grupo para quem pede: com as camadas e os limites efetivos (GRP-15, 38), o papel e as permissões (GRP-55);
 * os 3 tokens só para quem tem `members.manage` (GRP-05); sem os ids das mídias (GRP-36). O `ownerId` sai com
 * o id público do dono (USR-16).
 */
export function forViewer(
  group: StoredGroup,
  userId: UserId,
  myRole: MemberRole,
  staffRoleId?: string,
): Group {
  const myPermissions = permissionsOf(group, userId, staffRoleId);
  const {
    logoMediaId: _l,
    coverMediaId: _c,
    ownerId: _owner,
    ownerPublicId,
    ...clean
  } = group as StoredGroup & GroupImageIds;
  const view = {
    ...clean,
    ownerId: ownerPublicId,
    ...limitsOf(group),
    reservesOpenHoursBefore: reservesHours(group),
    myRole,
    myPermissions,
  };
  if (myPermissions.includes('members.manage')) return view;
  const { inviteToken: _i, reserveInviteToken: _r, guestToken: _g, ...rest } = view;
  return rest;
}

/** Grupo de quem é membro ou reserva. Quem não participa (ou grupo inexistente) → `GROUP_NOT_FOUND` (D10 do 003). */
export async function requireMember(
  deps: Pick<GroupsDeps, 'groups'>,
  userId: UserId,
  groupId: string,
): Promise<{ group: StoredGroup; role: MemberRole; staffRoleId?: string }> {
  const [group, membership] = await Promise.all([
    deps.groups.get(groupId),
    deps.groups.getMembership(groupId, userId),
  ]);
  if (!group || !membership) throw appError('GROUP_NOT_FOUND');
  // A participação já é lida para saber se a pessoa participa: o cargo vem junto, sem leitura a mais (GRP-52).
  return membership.staffRoleId === undefined
    ? { group, role: membership.role }
    : { group, role: membership.role, staffRoleId: membership.staffRoleId };
}

/** GRP-32: grupo arquivado é só leitura. Vem depois do `requireMember`/`requireOwner` (404 e 403 primeiro). */
export function requireActive(group: StoredGroup): void {
  if (group.archivedAt) throw appError('GROUP_ARCHIVED');
}

/**
 * Como `requireMember`, e só passa quem tem a permissão (GRP-49, 52). Sem ela, `GROUP_PERMISSION_DENIED`
 * (403 com corpo). Devolve também o papel e o cargo de quem pede, para a resposta.
 */
export async function requirePermission(
  deps: Pick<GroupsDeps, 'groups'>,
  userId: UserId,
  groupId: string,
  permission: Permission,
): Promise<{ group: StoredGroup; role: MemberRole; staffRoleId?: string }> {
  const member = await requireMember(deps, userId, groupId);
  if (!permissionsOf(member.group, userId, member.staffRoleId).includes(permission)) {
    throw appError('GROUP_PERMISSION_DENIED', { permission });
  }
  return member;
}

/** Como `requireMember`, e só o dono passa (`GROUP_NOT_OWNER`, 403 com corpo). */
export async function requireOwner(
  deps: Pick<GroupsDeps, 'groups'>,
  userId: UserId,
  groupId: string,
): Promise<StoredGroup> {
  const { group } = await requireMember(deps, userId, groupId);
  if (group.ownerId !== userId) throw appError('GROUP_NOT_OWNER');
  return group;
}
