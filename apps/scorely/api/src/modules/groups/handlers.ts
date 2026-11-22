import { authRoute } from '@scorely/api/src/lib/auth';
import { created, type HttpEvent, parseBody, pathParam } from '@scorely/api/src/lib/http';
import { asPublicGroupId, asPublicUserId } from '@scorely/api/src/lib/ids';
import { createGroupImages } from '@scorely/api/src/modules/groups/group.images';
import { dynamoGroupRepository } from '@scorely/api/src/modules/groups/group.repository';
import { createGroupService } from '@scorely/api/src/modules/groups/group.service';
import { mediaService } from '@scorely/api/src/modules/media/media.service';
import { dynamoNotificationRepository } from '@scorely/api/src/modules/notifications/notification.repository';
import { createNotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import { dynamoUserDirectory, dynamoUserRepository } from '@scorely/api/src/modules/users/user.repository';
import {
  ApproveGroupRequestInputSchema,
  AttachMediaInputSchema,
  CreateGroupInputSchema,
  CreateGroupInviteInputSchema,
  CreateGroupRoleInputSchema,
  DeleteGroupRoleInputSchema,
  GroupImageSlotSchema,
  MediaUploadInputSchema,
  OrderGroupRolesInputSchema,
  SetGroupJoinModeInputSchema,
  SetMemberRoleInputSchema,
  UpdateGroupRoleInputSchema,
} from '@scorely/contracts';

const groups = createGroupService({
  groups: dynamoGroupRepository,
  media: mediaService,
  users: dynamoUserDirectory,
  notifications: createNotificationService(dynamoNotificationRepository),
  // GRV-23: o email só da parte privada (USR-13) e a conta de um email, pelo lookup do login.
  emails: {
    emailOf: async (userId) => (await dynamoUserRepository.getMe(userId))?.private.email,
    userIdOf: async (email) => (await dynamoUserRepository.getByEmail(email))?.id,
  },
});
const images = createGroupImages({ groups: dynamoGroupRepository, media: mediaService });

/** `slot` da rota das imagens (GRV-09): `logo` ou `cover`; outro valor → 422. */
const slotOf = (event: HttpEvent) => GroupImageSlotSchema.parse(pathParam(event, 'slot'));

export async function createGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return created(await groups.create(auth.userId, parseBody(event, CreateGroupInputSchema)));
  });
}

export async function getGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const group = await groups.get(auth.userId, asPublicGroupId(pathParam(event, 'publicId')));
    return group;
  });
}

export async function myGroups(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const list = await groups.mine(auth.userId);
    return list;
  });
}

export async function requestImageUpload(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, MediaUploadInputSchema);
    const result = await images.requestUpload(
      auth.userId,
      asPublicGroupId(pathParam(event, 'publicId')),
      slotOf(event),
      input,
    );
    return result;
  });
}

export async function attachImage(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, AttachMediaInputSchema);
    const result = await images.attach(
      auth.userId,
      asPublicGroupId(pathParam(event, 'publicId')),
      slotOf(event),
      input,
    );
    return result;
  });
}

export async function detachImage(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await images.detach(
      auth.userId,
      asPublicGroupId(pathParam(event, 'publicId')),
      slotOf(event),
    );
    return result;
  });
}

export async function createInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, CreateGroupInviteInputSchema);
    return created(
      await groups.createInvite(auth.userId, asPublicGroupId(pathParam(event, 'publicId')), input),
    );
  });
}

export async function listInvites(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const list = await groups.listInvites(auth.userId, asPublicGroupId(pathParam(event, 'publicId')));
    return list;
  });
}

export async function revokeInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.revokeInvite(
      auth.userId,
      asPublicGroupId(pathParam(event, 'publicId')),
      pathParam(event, 'inviteId'),
    );
  });
}

export async function previewInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const preview = await groups.previewInvite(auth.userId, pathParam(event, 'token'));
    return preview;
  });
}

export async function joinInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const group = await groups.joinByInvite(auth.userId, pathParam(event, 'token'));
    return group;
  });
}

export async function listMembers(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const list = await groups.members(auth.userId, asPublicGroupId(pathParam(event, 'publicId')));
    return list;
  });
}

export async function leaveGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.leave(auth.userId, asPublicGroupId(pathParam(event, 'publicId')));
  });
}

export async function removeMember(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.removeMember(
      auth.userId,
      asPublicGroupId(pathParam(event, 'publicId')),
      asPublicUserId(pathParam(event, 'userPublicId')),
    );
  });
}

export async function myGroupInvites(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const list = await groups.myInvites(auth.userId);
    return list;
  });
}

export async function declineGroupInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.declineInvite(auth.userId, pathParam(event, 'inviteId'));
  });
}

export async function setJoinMode(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, SetGroupJoinModeInputSchema);
    const group = await groups.setJoinMode(auth.userId, asPublicGroupId(pathParam(event, 'publicId')), input);
    return group;
  });
}

export async function previewGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const preview = await groups.preview(auth.userId, asPublicGroupId(pathParam(event, 'publicId')));
    return preview;
  });
}

export async function requestToJoin(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const preview = await groups.request(auth.userId, asPublicGroupId(pathParam(event, 'publicId')));
    return preview;
  });
}

export async function cancelJoinRequest(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.cancelRequest(auth.userId, asPublicGroupId(pathParam(event, 'publicId')));
  });
}

export async function listJoinRequests(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const list = await groups.listRequests(auth.userId, asPublicGroupId(pathParam(event, 'publicId')));
    return list;
  });
}

export async function approveJoinRequest(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, ApproveGroupRequestInputSchema);
    await groups.approveRequest(
      auth.userId,
      asPublicGroupId(pathParam(event, 'publicId')),
      asPublicUserId(pathParam(event, 'userPublicId')),
      input,
    );
  });
}

export async function declineJoinRequest(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.declineRequest(
      auth.userId,
      asPublicGroupId(pathParam(event, 'publicId')),
      asPublicUserId(pathParam(event, 'userPublicId')),
    );
  });
}

// Cargos (GRV-42–48)
export async function listRoles(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const list = await groups.roles(auth.userId, asPublicGroupId(pathParam(event, 'publicId')));
    return list;
  });
}

export async function createRole(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, CreateGroupRoleInputSchema);
    return created(
      await groups.createRole(auth.userId, asPublicGroupId(pathParam(event, 'publicId')), input),
    );
  });
}

export async function updateRole(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, UpdateGroupRoleInputSchema);
    const list = await groups.updateRole(
      auth.userId,
      asPublicGroupId(pathParam(event, 'publicId')),
      pathParam(event, 'roleId'),
      input,
    );
    return list;
  });
}

export async function orderRoles(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, OrderGroupRolesInputSchema);
    const list = await groups.orderRoles(auth.userId, asPublicGroupId(pathParam(event, 'publicId')), input);
    return list;
  });
}

export async function deleteRole(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, DeleteGroupRoleInputSchema);
    const list = await groups.deleteRole(
      auth.userId,
      asPublicGroupId(pathParam(event, 'publicId')),
      pathParam(event, 'roleId'),
      input,
    );
    return list;
  });
}

export async function setMemberRole(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, SetMemberRoleInputSchema);
    await groups.setMemberRole(
      auth.userId,
      asPublicGroupId(pathParam(event, 'publicId')),
      asPublicUserId(pathParam(event, 'userPublicId')),
      input,
    );
  });
}
