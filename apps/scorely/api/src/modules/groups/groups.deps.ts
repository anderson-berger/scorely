import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import type { GameRepository } from '@scorely/api/src/modules/groups/game.repository';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import type { PlaceRepository, StoredPlace } from '@scorely/api/src/modules/groups/place.repository';
import type { ScheduleRepository } from '@scorely/api/src/modules/groups/schedule.repository';
import { type MediaService, mediaService } from '@scorely/api/src/modules/media/media.service';
import type { NotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import type { SportService } from '@scorely/api/src/modules/sports/sport.service';
import type { UserDirectory } from '@scorely/api/src/modules/users/user.repository';
import {
  type Group,
  type MemberTier,
  type Permission,
  type Place,
  ROLES,
  type RoleId,
} from '@scorely/contracts';

/** GRP-58: quem cria o grupo confere o esporte no catálogo (ESP). Só o service de grupo recebe. */
export interface SportsDep {
  sports: Pick<SportService, 'get'>;
}

/** O que os services de grupo e de jogo recebem (o mesmo objeto para os dois). */
export interface GroupsDeps {
  groups: GroupRepository;
  games: GameRepository;
  /** GRP-60–63: os lugares do grupo. */
  places: PlaceRepository;
  /** GRP-64–67: os horários do grupo. */
  schedules: ScheduleRepository;
  users: UserDirectory;
  notifications: Pick<NotificationService, 'notify'>;
  /** MID-12: monta a URL do logo e da capa pelo id da mídia. Sem ele, a mídia de produção. */
  media?: Pick<MediaService, 'urlOf'>;
  now?: () => Date;
}

/** GRP-63: o lugar como sai na resposta (sem o grupo e as datas do item). */
export function publicPlace({ groupId: _g, createdAt: _c, updatedAt: _u, ...place }: StoredPlace): Place {
  return place;
}

/** MID-12: a URL pública de uma mídia pela finalidade e o id. */
export type UrlOf = MediaService['urlOf'];

const productionUrlOf: UrlOf = (purpose, mediaId) => mediaService.urlOf(purpose, mediaId);

/** Ids das mídias do logo e da capa (GRP-35): internos, gravados pela transação da mídia (MID-08). */
export type GroupImageIds = { logoMediaId?: string | undefined; coverMediaId?: string | undefined };

/** GRP-36, MID-12: as URLs do logo e da capa, montadas pelos ids (o item do grupo não guarda URL). */
export function imageUrls(
  group: GroupImageIds,
  urlOf: UrlOf = productionUrlOf,
): Pick<Group, 'logoUrl' | 'coverUrl'> {
  return {
    ...(group.logoMediaId !== undefined && { logoUrl: urlOf('group.logo', group.logoMediaId) }),
    ...(group.coverMediaId !== undefined && { coverUrl: urlOf('group.cover', group.coverMediaId) }),
  };
}

/** O cargo gravado, se ele existe (GRP-52: senão, Membro). */
export function roleIdOf(roleId: string | undefined): RoleId {
  return roleId !== undefined && Object.hasOwn(ROLES, roleId) ? (roleId as RoleId) : 'member';
}

/** GRP-49, 50, 52: as permissões do cargo; um cargo que não existe conta como o Membro (nenhuma). */
export function permissionsOf(roleId: string | undefined): Permission[] {
  return [...ROLES[roleIdOf(roleId)].permissions];
}

/**
 * O grupo para quem pede: o papel, o cargo e as permissões (GRP-55); os 3 tokens só para quem tem `members.manage`
 * (GRP-05); sem os ids das mídias, com as URLs montadas por eles (GRP-36, MID-12).
 */
export function forViewer(
  group: StoredGroup,
  myTier: MemberTier,
  myRoleId: string | undefined,
  urlOf: UrlOf = productionUrlOf,
): Group {
  const myPermissions = permissionsOf(myRoleId);
  const { logoMediaId: _l, coverMediaId: _c, schedules, ...clean } = group;
  const view = {
    ...clean,
    // GRP-64: os horários ativos, sem o grupo e as datas do item.
    schedules: schedules.map(({ groupId: _g, createdAt: _cr, updatedAt: _u, ...s }) => s),
    ...imageUrls(group, urlOf),
    myTier,
    myRoleId: roleIdOf(myRoleId),
    myPermissions,
  };
  if (myPermissions.includes('members.manage')) return view;
  const { inviteToken: _i, reserveInviteToken: _r, guestToken: _g, ...rest } = view;
  return rest;
}

/** Quem pede, no grupo: o papel e o cargo (com o convite para membro pendente, se houver). */
export interface Viewer {
  group: StoredGroup;
  tier: MemberTier;
  roleId: RoleId;
  memberInviteExpiresAt?: string;
}

/** Grupo de quem é membro ou reserva. Quem não participa (ou grupo inexistente) → `GROUP_NOT_FOUND` (D10 do 003). */
export async function requireMember(
  deps: Pick<GroupsDeps, 'groups'>,
  userId: UserId,
  groupId: string,
): Promise<Viewer> {
  const [group, membership] = await Promise.all([
    deps.groups.get(groupId),
    deps.groups.getMembership(groupId, userId),
  ]);
  if (!group || !membership) throw appError('GROUP_NOT_FOUND');
  // A participação já é lida para saber se a pessoa participa: o cargo vem junto, sem leitura a mais (GRP-52).
  return { ...membership, group, roleId: roleIdOf(membership.roleId) };
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
): Promise<Viewer> {
  const member = await requireMember(deps, userId, groupId);
  if (!permissionsOf(member.roleId).includes(permission)) {
    throw appError('GROUP_PERMISSION_DENIED', { permission });
  }
  return member;
}

/** Como `requireMember`, e só o dono (o cargo `owner`, GRP-48) passa (`GROUP_NOT_OWNER`, 403 com corpo). */
export async function requireOwner(
  deps: Pick<GroupsDeps, 'groups'>,
  userId: UserId,
  groupId: string,
): Promise<StoredGroup> {
  const { group, roleId } = await requireMember(deps, userId, groupId);
  if (roleId !== 'owner') throw appError('GROUP_NOT_OWNER');
  return group;
}
