import { UpdatePlayerInputSchema } from '@scorely/contracts';
import { authHandlers } from '../../lib/auth';
import { parseBody, pathParam } from '../../lib/http';
import { dynamoGameRepository } from '../groups/game.repository';
import { createGameService } from '../groups/game.service';
import { dynamoGroupRepository } from '../groups/group.repository';
import { createGroupService } from '../groups/group.service';
import type { GroupsDeps } from '../groups/groups.deps';
import { dynamoNotificationRepository } from '../notifications/notification.repository';
import { createNotificationService } from '../notifications/notification.service';
import { dynamoUserDirectory } from '../users/user.repository';
import { dynamoPlayerRepository } from './player.repository';
import { createPlayerService } from './player.service';

const groupsDeps: GroupsDeps = {
  groups: dynamoGroupRepository,
  games: dynamoGameRepository,
  users: dynamoUserDirectory,
  notifications: createNotificationService(dynamoNotificationRepository),
};
const groups = createGroupService(groupsDeps);
const games = createGameService(groupsDeps);
const players = createPlayerService({
  groups: dynamoGroupRepository,
  roster: { members: groups.members, currentGame: games.current },
  players: dynamoPlayerRepository,
});

export const { listPlayers, updatePlayer } = authHandlers({
  async listPlayers(event, auth) {
    return players.list(auth.userId, pathParam(event, 'id'));
  },

  async updatePlayer(event, auth) {
    const input = parseBody(event, UpdatePlayerInputSchema);
    return players.update(auth.userId, pathParam(event, 'id'), pathParam(event, 'userId'), input);
  },
});
