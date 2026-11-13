import { authRoute } from '@scorely/api/src/lib/auth';
import { created, type HttpEvent, parseBody, pathParam } from '@scorely/api/src/lib/http';
import { asPublicUserId } from '@scorely/api/src/lib/ids';
import { dynamoGameRepository } from '@scorely/api/src/modules/groups/game.repository';
import { createGameService } from '@scorely/api/src/modules/groups/game.service';
import { createGroupImages } from '@scorely/api/src/modules/groups/group.images';
import { dynamoGroupRepository } from '@scorely/api/src/modules/groups/group.repository';
import { createGroupService } from '@scorely/api/src/modules/groups/group.service';
import type { GroupsDeps } from '@scorely/api/src/modules/groups/groups.deps';
import { mediaService } from '@scorely/api/src/modules/media/media.service';
import { dynamoNotificationRepository } from '@scorely/api/src/modules/notifications/notification.repository';
import { createNotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import { dynamoUserDirectory } from '@scorely/api/src/modules/users/user.repository';
import {
  AttachMediaInputSchema,
  CreateGroupInputSchema,
  GroupImageSlotSchema,
  MediaUploadInputSchema,
  RotateInviteInputSchema,
  SetStaffRoleInputSchema,
  TransferGroupInputSchema,
  UpdateGameInputSchema,
  UpdateGroupInputSchema,
} from '@scorely/contracts';

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
const slotOf = (event: HttpEvent) => GroupImageSlotSchema.parse(pathParam(event, 'slot'));

export async function create(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return created(await groups.create(auth.userId, parseBody(event, CreateGroupInputSchema)));
  });
}

export async function myGroups(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.myGroups(auth.userId);
  });
}

export async function archivedGroups(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.archivedGroups(auth.userId);
  });
}

export async function archive(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.archive(auth.userId, pathParam(event, 'id'));
  });
}

export async function unarchive(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.unarchive(auth.userId, pathParam(event, 'id'));
  });
}

export async function get(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.get(auth.userId, pathParam(event, 'id'));
  });
}

export async function update(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.update(auth.userId, pathParam(event, 'id'), parseBody(event, UpdateGroupInputSchema));
  });
}

export async function rotateInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const { kind } = parseBody(event, RotateInviteInputSchema);
    return groups.rotateInvite(auth.userId, pathParam(event, 'id'), kind);
  });
}

export async function requestImageUpload(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, MediaUploadInputSchema);
    return images.requestUpload(auth.userId, pathParam(event, 'id'), slotOf(event), input);
  });
}

export async function attachImage(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, AttachMediaInputSchema);
    return images.attach(auth.userId, pathParam(event, 'id'), slotOf(event), input);
  });
}

export async function detachImage(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return images.detach(auth.userId, pathParam(event, 'id'), slotOf(event));
  });
}

export async function acceptInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.acceptInvite(auth.userId, pathParam(event, 'token'));
  });
}

export async function members(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.members(auth.userId, pathParam(event, 'id'));
  });
}

export async function removeMember(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.removeMember(
      auth.userId,
      pathParam(event, 'id'),
      asPublicUserId(pathParam(event, 'userId')),
    );
  });
}

/** GRP-51: o dono dá o cargo. */
export async function setStaffRole(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const { staffRoleId } = parseBody(event, SetStaffRoleInputSchema);
    await groups.setStaffRole(
      auth.userId,
      pathParam(event, 'id'),
      asPublicUserId(pathParam(event, 'userId')),
      staffRoleId,
    );
  });
}

/** GRP-51: o dono tira o cargo. */
export async function clearStaffRole(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.clearStaffRole(
      auth.userId,
      pathParam(event, 'id'),
      asPublicUserId(pathParam(event, 'userId')),
    );
  });
}

/** GRP-54: o dono passa o grupo para um membro. */
export async function transferGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const { userId } = parseBody(event, TransferGroupInputSchema);
    return groups.transfer(auth.userId, pathParam(event, 'id'), userId);
  });
}

export async function inviteToMember(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.inviteToMember(
      auth.userId,
      pathParam(event, 'id'),
      asPublicUserId(pathParam(event, 'userId')),
    );
  });
}

export async function cancelMemberInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.cancelMemberInvite(
      auth.userId,
      pathParam(event, 'id'),
      asPublicUserId(pathParam(event, 'userId')),
    );
  });
}

export async function acceptMemberInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.acceptMemberInvite(auth.userId, pathParam(event, 'id'));
  });
}

export async function declineMemberInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.declineMemberInvite(auth.userId, pathParam(event, 'id'));
  });
}

export async function leaveGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.leave(auth.userId, pathParam(event, 'id'));
  });
}

export async function currentGame(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return games.current(auth.userId, pathParam(event, 'id'));
  });
}

export async function confirm(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return games.confirm(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'));
  });
}

export async function leave(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await games.leave(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'));
  });
}

export async function cancel(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return games.cancel(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'));
  });
}

export async function reopen(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return games.reopen(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'));
  });
}

export async function updateGame(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const patch = parseBody(event, UpdateGameInputSchema);
    return games.updateGame(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'), patch);
  });
}

export async function playView(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return games.guestView(auth.userId, pathParam(event, 'token'));
  });
}

export async function playConfirm(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return games.guestConfirm(auth.userId, pathParam(event, 'token'), pathParam(event, 'date'));
  });
}

export async function playLeave(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await games.guestLeave(auth.userId, pathParam(event, 'token'), pathParam(event, 'date'));
  });
}
