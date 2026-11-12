import { SaveTeamsInputSchema, UpdatePlayerInputSchema } from '@scorely/contracts';
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
import { dynamoTeamsRepository } from './teams.repository';
import { createTeamsService } from './teams.service';

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
const teams = createTeamsService({
  groups: dynamoGroupRepository,
  roster: { currentGame: games.current, guestView: games.guestView },
  players: dynamoPlayerRepository,
  users: dynamoUserDirectory,
  notifications: groupsDeps.notifications,
  teams: dynamoTeamsRepository,
});

export const {
  listPlayers,
  updatePlayer,
  getTeams,
  saveTeams,
  publishTeams,
  unpublishTeams,
  drawTeams,
  discardTeams,
  guestTeams,
} = authHandlers({
  async listPlayers(event, auth) {
    return players.list(auth.userId, pathParam(event, 'id'));
  },

  async updatePlayer(event, auth) {
    const input = parseBody(event, UpdatePlayerInputSchema);
    return players.update(auth.userId, pathParam(event, 'id'), pathParam(event, 'userId'), input);
  },

  async getTeams(event, auth) {
    return teams.get(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'));
  },

  async saveTeams(event, auth) {
    const input = parseBody(event, SaveTeamsInputSchema);
    return teams.save(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'), input);
  },

  async publishTeams(event, auth) {
    return teams.publish(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'));
  },

  async drawTeams(event, auth) {
    return teams.draw(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'));
  },

  async unpublishTeams(event, auth) {
    return teams.unpublish(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'));
  },

  async discardTeams(event, auth) {
    await teams.discard(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'));
  },

  async guestTeams(event, auth) {
    return teams.guestGet(auth.userId, pathParam(event, 'token'));
  },
});
