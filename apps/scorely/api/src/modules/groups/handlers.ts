import { CreateGroupInputSchema } from '@scorely/contracts';
import { authHandlers } from '../../lib/auth';
import { created, parseBody, pathParam } from '../../lib/http';
import { dynamoNotificationRepository } from '../notifications/notification.repository';
import { createNotificationService } from '../notifications/notification.service';
import { dynamoUserDirectory } from '../users/user.repository';
import { dynamoGameRepository } from './game.repository';
import { createGameService } from './game.service';
import { dynamoGroupRepository } from './group.repository';
import { createGroupService } from './group.service';
import type { GroupsDeps } from './groups.deps';

const deps: GroupsDeps = {
  groups: dynamoGroupRepository,
  games: dynamoGameRepository,
  users: dynamoUserDirectory,
  notifications: createNotificationService(dynamoNotificationRepository),
};
const groups = createGroupService(deps);
const games = createGameService(deps);

export const {
  create,
  myGroups,
  get,
  rotateInvite,
  acceptInvite,
  members,
  removeMember,
  currentGame,
  confirm,
  leave,
  cancel,
} = authHandlers({
  async create(event, auth) {
    return created(await groups.create(auth.userId, parseBody(event, CreateGroupInputSchema)));
  },

  async myGroups(_event, auth) {
    return groups.myGroups(auth.userId);
  },

  async get(event, auth) {
    return groups.get(auth.userId, pathParam(event, 'id'));
  },

  async rotateInvite(event, auth) {
    return groups.rotateInvite(auth.userId, pathParam(event, 'id'));
  },

  async acceptInvite(event, auth) {
    return groups.acceptInvite(auth.userId, pathParam(event, 'token'));
  },

  async members(event, auth) {
    return groups.members(auth.userId, pathParam(event, 'id'));
  },

  async removeMember(event, auth) {
    await groups.removeMember(auth.userId, pathParam(event, 'id'), pathParam(event, 'userId'));
  },

  async currentGame(event, auth) {
    return games.current(auth.userId, pathParam(event, 'id'));
  },

  async confirm(event, auth) {
    return games.confirm(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'));
  },

  async leave(event, auth) {
    await games.leave(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'));
  },

  async cancel(event, auth) {
    return games.cancel(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'));
  },
});
