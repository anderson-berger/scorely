import type { Group, MemberRole } from '@scorely/contracts';
import { appError } from '../../lib/errors';
import type { NotificationService } from '../notifications/notification.service';
import type { UserDirectory } from '../users/user.repository';
import type { GameRepository } from './game.repository';
import type { GroupRepository, StoredGroup } from './group.repository';

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

/** O grupo para quem pede: com as camadas efetivas e o papel; os 3 tokens só para o dono. */
export function forViewer(group: StoredGroup, userId: string, myRole: MemberRole): Group {
  const view = { ...group, reservesOpenHoursBefore: reservesHours(group), myRole };
  if (group.ownerId === userId) return view;
  const { inviteToken: _i, reserveInviteToken: _r, guestToken: _g, ...rest } = view;
  return rest;
}

/** Grupo de quem é membro ou reserva. Quem não participa (ou grupo inexistente) → `GROUP_NOT_FOUND` (D10 do 003). */
export async function requireMember(
  deps: GroupsDeps,
  userId: string,
  groupId: string,
): Promise<{ group: StoredGroup; role: MemberRole }> {
  const [group, role] = await Promise.all([deps.groups.get(groupId), deps.groups.roleOf(groupId, userId)]);
  if (!group || !role) throw appError('GROUP_NOT_FOUND');
  return { group, role };
}

/** Como `requireMember`, e só o dono passa (`GROUP_NOT_OWNER`, 403 com corpo). */
export async function requireOwner(deps: GroupsDeps, userId: string, groupId: string): Promise<StoredGroup> {
  const { group } = await requireMember(deps, userId, groupId);
  if (group.ownerId !== userId) throw appError('GROUP_NOT_OWNER');
  return group;
}
