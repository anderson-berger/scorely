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
import type { Group, MemberRole } from '@scorely/contracts';

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

/**
 * O grupo para quem pede: com as camadas e os limites efetivos (GRP-15, 38) e o papel; os 3 tokens só para o dono;
 * sem os ids das mídias (GRP-36). O `ownerId` sai com o id público do dono (USR-16).
 */
export function forViewer(group: StoredGroup, userId: UserId, myRole: MemberRole): Group {
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
  };
  if (group.ownerId === userId) return view;
  const { inviteToken: _i, reserveInviteToken: _r, guestToken: _g, ...rest } = view;
  return rest;
}

/** Grupo de quem é membro ou reserva. Quem não participa (ou grupo inexistente) → `GROUP_NOT_FOUND` (D10 do 003). */
export async function requireMember(
  deps: Pick<GroupsDeps, 'groups'>,
  userId: UserId,
  groupId: string,
): Promise<{ group: StoredGroup; role: MemberRole }> {
  const [group, role] = await Promise.all([deps.groups.get(groupId), deps.groups.roleOf(groupId, userId)]);
  if (!group || !role) throw appError('GROUP_NOT_FOUND');
  return { group, role };
}

/** GRP-32: grupo arquivado é só leitura. Vem depois do `requireMember`/`requireOwner` (404 e 403 primeiro). */
export function requireActive(group: StoredGroup): void {
  if (group.archivedAt) throw appError('GROUP_ARCHIVED');
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
