import { authRoute } from '@scorely/api/src/lib/auth';
import { created, type HttpEvent, parseBody, pathParam } from '@scorely/api/src/lib/http';
import { asPublicGroupId, asPublicUserId } from '@scorely/api/src/lib/ids';
import { dynamoGroupRepository } from '@scorely/api/src/modules/groups/data/groups.repository';
import { createGroupService } from '@scorely/api/src/modules/groups/groups.service';
import { createGroupImages } from '@scorely/api/src/modules/groups/rules/images';
import { mediaService } from '@scorely/api/src/modules/media/media.service';
import { dynamoNotificationRepository } from '@scorely/api/src/modules/notifications/data/notifications.repository';
import { createNotificationService } from '@scorely/api/src/modules/notifications/notifications.service';
import {
  dynamoUserDirectory,
  dynamoUserRepository,
} from '@scorely/api/src/modules/users/data/users.repository';
import {
  type ApproveGroupRequestInput,
  ApproveGroupRequestInputSchema,
  type AttachMediaInput,
  AttachMediaInputSchema,
  type CreateGroupInput,
  CreateGroupInputSchema,
  type CreateGroupInviteInput,
  CreateGroupInviteInputSchema,
  type CreateGroupRoleInput,
  CreateGroupRoleInputSchema,
  type DeleteGroupRoleInput,
  DeleteGroupRoleInputSchema,
  type Group,
  GroupImageSlotSchema,
  type GroupInvite,
  type GroupInvitePreview,
  type GroupJoinRequest,
  type GroupMember,
  type GroupPreview,
  type GroupRoles,
  type MediaUpload,
  type MediaUploadInput,
  MediaUploadInputSchema,
  type MyGroupInvite,
  type OrderGroupRolesInput,
  OrderGroupRolesInputSchema,
  type SetGroupJoinModeInput,
  SetGroupJoinModeInputSchema,
  type SetGroupModalityInput,
  SetGroupModalityInputSchema,
  type SetMemberRoleInput,
  SetMemberRoleInputSchema,
  type TransferGroupInput,
  TransferGroupInputSchema,
  type UpdateGroupRoleInput,
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
    const input: CreateGroupInput = parseBody(event, CreateGroupInputSchema);
    const group: Group = await groups.create(auth.userId, input);
    return created(group);
  });
}

export async function getGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const group: Group = await groups.get(auth.userId, publicId);
    return group;
  });
}

export async function myGroups(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const list: Group[] = await groups.mine(auth.userId);
    return list;
  });
}

export async function requestImageUpload(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: MediaUploadInput = parseBody(event, MediaUploadInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const slot = slotOf(event);
    const upload: MediaUpload = await images.requestUpload(auth.userId, publicId, slot, input);
    return upload;
  });
}

export async function attachImage(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: AttachMediaInput = parseBody(event, AttachMediaInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const slot = slotOf(event);
    const group: Group = await images.attach(auth.userId, publicId, slot, input);
    return group;
  });
}

export async function detachImage(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const slot = slotOf(event);
    const group: Group = await images.detach(auth.userId, publicId, slot);
    return group;
  });
}

export async function createInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: CreateGroupInviteInput = parseBody(event, CreateGroupInviteInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const invite: GroupInvite = await groups.createInvite(auth.userId, publicId, input);
    return created(invite);
  });
}

export async function listInvites(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const list: GroupInvite[] = await groups.listInvites(auth.userId, publicId);
    return list;
  });
}

export async function revokeInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const inviteId = pathParam(event, 'inviteId');
    await groups.revokeInvite(auth.userId, publicId, inviteId);
  });
}

export async function previewInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const token = pathParam(event, 'token');
    const preview: GroupInvitePreview = await groups.previewInvite(auth.userId, token);
    return preview;
  });
}

export async function joinInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const token = pathParam(event, 'token');
    const group: Group = await groups.joinByInvite(auth.userId, token);
    return group;
  });
}

export async function listMembers(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const list: GroupMember[] = await groups.members(auth.userId, publicId);
    return list;
  });
}

export async function leaveGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    await groups.leave(auth.userId, publicId);
  });
}

export async function removeMember(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const userPublicId = asPublicUserId(pathParam(event, 'userPublicId'));
    await groups.removeMember(auth.userId, publicId, userPublicId);
  });
}

export async function myGroupInvites(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const list: MyGroupInvite[] = await groups.myInvites(auth.userId);
    return list;
  });
}

export async function declineGroupInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const inviteId = pathParam(event, 'inviteId');
    await groups.declineInvite(auth.userId, inviteId);
  });
}

export async function setJoinMode(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: SetGroupJoinModeInput = parseBody(event, SetGroupJoinModeInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const group: Group = await groups.setJoinMode(auth.userId, publicId, input);
    return group;
  });
}

export async function setModality(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: SetGroupModalityInput = parseBody(event, SetGroupModalityInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const group: Group = await groups.setModality(auth.userId, publicId, input);
    return group;
  });
}

export async function previewGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const preview: GroupPreview = await groups.preview(auth.userId, publicId);
    return preview;
  });
}

export async function requestToJoin(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const preview: GroupPreview = await groups.request(auth.userId, publicId);
    return preview;
  });
}

export async function cancelJoinRequest(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    await groups.cancelRequest(auth.userId, publicId);
  });
}

export async function listJoinRequests(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const list: GroupJoinRequest[] = await groups.listRequests(auth.userId, publicId);
    return list;
  });
}

export async function approveJoinRequest(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: ApproveGroupRequestInput = parseBody(event, ApproveGroupRequestInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const userPublicId = asPublicUserId(pathParam(event, 'userPublicId'));
    await groups.approveRequest(auth.userId, publicId, userPublicId, input);
  });
}

export async function declineJoinRequest(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const userPublicId = asPublicUserId(pathParam(event, 'userPublicId'));
    await groups.declineRequest(auth.userId, publicId, userPublicId);
  });
}

// Cargos (GRV-42–48)
export async function listRoles(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const list: GroupRoles = await groups.roles(auth.userId, publicId);
    return list;
  });
}

export async function createRole(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: CreateGroupRoleInput = parseBody(event, CreateGroupRoleInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const list: GroupRoles = await groups.createRole(auth.userId, publicId, input);
    return created(list);
  });
}

export async function updateRole(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: UpdateGroupRoleInput = parseBody(event, UpdateGroupRoleInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const roleId = pathParam(event, 'roleId');
    const list: GroupRoles = await groups.updateRole(auth.userId, publicId, roleId, input);
    return list;
  });
}

export async function orderRoles(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: OrderGroupRolesInput = parseBody(event, OrderGroupRolesInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const list: GroupRoles = await groups.orderRoles(auth.userId, publicId, input);
    return list;
  });
}

export async function deleteRole(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: DeleteGroupRoleInput = parseBody(event, DeleteGroupRoleInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const roleId = pathParam(event, 'roleId');
    const list: GroupRoles = await groups.deleteRole(auth.userId, publicId, roleId, input);
    return list;
  });
}

export async function setMemberRole(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: SetMemberRoleInput = parseBody(event, SetMemberRoleInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const userPublicId = asPublicUserId(pathParam(event, 'userPublicId'));
    await groups.setMemberRole(auth.userId, publicId, userPublicId, input);
  });
}

export async function transferGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: TransferGroupInput = parseBody(event, TransferGroupInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    await groups.transfer(auth.userId, publicId, input);
  });
}
