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

/** Grupo de quem é membro. Não-membro (ou grupo inexistente) → `GROUP_NOT_FOUND` (D10). */
export async function requireMember(deps: GroupsDeps, userId: string, groupId: string): Promise<StoredGroup> {
  const [group, member] = await Promise.all([
    deps.groups.get(groupId),
    deps.groups.isMember(groupId, userId),
  ]);
  if (!group || !member) throw appError('GROUP_NOT_FOUND');
  return group;
}

/** Como `requireMember`, e só o dono passa (`GROUP_NOT_OWNER`, 403 com corpo). */
export async function requireOwner(deps: GroupsDeps, userId: string, groupId: string): Promise<StoredGroup> {
  const group = await requireMember(deps, userId, groupId);
  if (group.ownerId !== userId) throw appError('GROUP_NOT_OWNER');
  return group;
}
