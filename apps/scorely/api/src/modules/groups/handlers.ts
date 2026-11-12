import {
  AttachMediaInputSchema,
  CreateGroupInputSchema,
  GroupImageSlotSchema,
  MediaUploadInputSchema,
  RotateInviteInputSchema,
  UpdateGameInputSchema,
  UpdateGroupInputSchema,
} from '@scorely/contracts';
import { authHandlers } from '../../lib/auth';
import { created, parseBody, pathParam } from '../../lib/http';
import { mediaService } from '../media/media.service';
import { dynamoNotificationRepository } from '../notifications/notification.repository';
import { createNotificationService } from '../notifications/notification.service';
import { dynamoUserDirectory } from '../users/user.repository';
import { dynamoGameRepository } from './game.repository';
import { createGameService } from './game.service';
import { createGroupImages } from './group.images';
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
const images = createGroupImages({ ...deps, media: mediaService });

/** `slot` da rota das imagens (GRP-35): `logo` ou `cover`; outro valor → 422. */
const slotOf = (event: Parameters<typeof pathParam>[0]) =>
  GroupImageSlotSchema.parse(pathParam(event, 'slot'));

export const {
  create,
  myGroups,
  archivedGroups,
  archive,
  unarchive,
  get,
  update,
  rotateInvite,
  requestImageUpload,
  attachImage,
  detachImage,
  acceptInvite,
  members,
  removeMember,
  inviteToMember,
  cancelMemberInvite,
  acceptMemberInvite,
  declineMemberInvite,
  leaveGroup,
  currentGame,
  confirm,
  leave,
  cancel,
  reopen,
  updateGame,
  playView,
  playConfirm,
  playLeave,
} = authHandlers({
  async create(event, auth) {
    return created(await groups.create(auth.userId, parseBody(event, CreateGroupInputSchema)));
  },

  async myGroups(_event, auth) {
    return groups.myGroups(auth.userId);
  },

  async archivedGroups(_event, auth) {
    return groups.archivedGroups(auth.userId);
  },

  async archive(event, auth) {
    return groups.archive(auth.userId, pathParam(event, 'id'));
  },

  async unarchive(event, auth) {
    return groups.unarchive(auth.userId, pathParam(event, 'id'));
  },

  async get(event, auth) {
    return groups.get(auth.userId, pathParam(event, 'id'));
  },

  async update(event, auth) {
    return groups.update(auth.userId, pathParam(event, 'id'), parseBody(event, UpdateGroupInputSchema));
  },

  async rotateInvite(event, auth) {
    const { kind } = parseBody(event, RotateInviteInputSchema);
    return groups.rotateInvite(auth.userId, pathParam(event, 'id'), kind);
  },

  async requestImageUpload(event, auth) {
    const input = parseBody(event, MediaUploadInputSchema);
    return images.requestUpload(auth.userId, pathParam(event, 'id'), slotOf(event), input);
  },

  async attachImage(event, auth) {
    const input = parseBody(event, AttachMediaInputSchema);
    return images.attach(auth.userId, pathParam(event, 'id'), slotOf(event), input);
  },

  async detachImage(event, auth) {
    return images.detach(auth.userId, pathParam(event, 'id'), slotOf(event));
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

  async inviteToMember(event, auth) {
    return groups.inviteToMember(auth.userId, pathParam(event, 'id'), pathParam(event, 'userId'));
  },

  async cancelMemberInvite(event, auth) {
    await groups.cancelMemberInvite(auth.userId, pathParam(event, 'id'), pathParam(event, 'userId'));
  },

  async acceptMemberInvite(event, auth) {
    return groups.acceptMemberInvite(auth.userId, pathParam(event, 'id'));
  },

  async declineMemberInvite(event, auth) {
    await groups.declineMemberInvite(auth.userId, pathParam(event, 'id'));
  },

  async leaveGroup(event, auth) {
    await groups.leave(auth.userId, pathParam(event, 'id'));
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

  async reopen(event, auth) {
    return games.reopen(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'));
  },

  async updateGame(event, auth) {
    const patch = parseBody(event, UpdateGameInputSchema);
    return games.updateGame(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'), patch);
  },

  async playView(event, auth) {
    return games.guestView(auth.userId, pathParam(event, 'token'));
  },

  async playConfirm(event, auth) {
    return games.guestConfirm(auth.userId, pathParam(event, 'token'), pathParam(event, 'date'));
  },

  async playLeave(event, auth) {
    await games.guestLeave(auth.userId, pathParam(event, 'token'), pathParam(event, 'date'));
  },
});
