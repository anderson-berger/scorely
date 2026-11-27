import { authRoute } from '@scorely/api/src/lib/auth';
import { systemNow } from '@scorely/api/src/lib/clock';
import { created, type HttpEvent, parseBody, pathParam } from '@scorely/api/src/lib/http';
import { asPublicGroupId, asPublicUserId } from '@scorely/api/src/lib/ids';
import { dynamoGroupRepository } from '@scorely/api/src/modules/groups/data/groups.repository';
import type { GroupImagesDeps, GroupsDeps } from '@scorely/api/src/modules/groups/groups.service';
import * as groupRules from '@scorely/api/src/modules/groups/rules/groups';
import * as imageRules from '@scorely/api/src/modules/groups/rules/images';
import * as inviteRules from '@scorely/api/src/modules/groups/rules/invites';
import * as memberRules from '@scorely/api/src/modules/groups/rules/members';
import * as openRules from '@scorely/api/src/modules/groups/rules/open';
import * as roleRules from '@scorely/api/src/modules/groups/rules/roles';
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

const deps: GroupsDeps = {
  groups: dynamoGroupRepository,
  media: mediaService,
  users: dynamoUserDirectory,
  notifications: createNotificationService(dynamoNotificationRepository),
  now: systemNow,
  // GRV-23: o email só da parte privada (USR-13) e a conta de um email, pelo lookup do login.
  emails: {
    emailOf: async (userId) => (await dynamoUserRepository.getMe(userId))?.private.email,
    userIdOf: async (email) => (await dynamoUserRepository.getByEmail(email))?.id,
  },
};
const imageDeps: GroupImagesDeps = { groups: dynamoGroupRepository, media: mediaService, now: systemNow };

/** `slot` da rota das imagens (GRV-09): `logo` ou `cover`; outro valor → 422. */
const slotOf = (event: HttpEvent) => GroupImageSlotSchema.parse(pathParam(event, 'slot'));

export async function createGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: CreateGroupInput = parseBody(event, CreateGroupInputSchema);
    const group: Group = await groupRules.createGroup(deps, auth.userId, input);
    return created(group);
  });
}

export async function getGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = pathParam(event, 'publicId');
    const groupId = asPublicGroupId(publicId);
    const userId = auth.userId;
    const group: Group = await groupRules.getGroup(deps, userId, groupId);
    return group;
  });
}

export async function myGroups(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const list: Group[] = await groupRules.listMyGroups(deps, auth.userId);
    return list;
  });
}

export async function requestImageUpload(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: MediaUploadInput = parseBody(event, MediaUploadInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const slot = slotOf(event);
    const upload: MediaUpload = await imageRules.requestUpload(imageDeps, auth.userId, publicId, slot, input);
    return upload;
  });
}

export async function attachImage(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: AttachMediaInput = parseBody(event, AttachMediaInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const slot = slotOf(event);
    const group: Group = await imageRules.attach(imageDeps, auth.userId, publicId, slot, input);
    return group;
  });
}

export async function detachImage(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const slot = slotOf(event);
    const group: Group = await imageRules.detach(imageDeps, auth.userId, publicId, slot);
    return group;
  });
}

export async function createInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: CreateGroupInviteInput = parseBody(event, CreateGroupInviteInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const invite: GroupInvite = await inviteRules.createInvite(deps, auth.userId, publicId, input);
    return created(invite);
  });
}

export async function listInvites(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const list: GroupInvite[] = await inviteRules.listInvites(deps, auth.userId, publicId);
    return list;
  });
}

export async function revokeInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const inviteId = pathParam(event, 'inviteId');
    await inviteRules.revokeInvite(deps, auth.userId, publicId, inviteId);
  });
}

export async function previewInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const token = pathParam(event, 'token');
    const preview: GroupInvitePreview = await inviteRules.previewInvite(deps, auth.userId, token);
    return preview;
  });
}

export async function joinInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const token = pathParam(event, 'token');
    const group: Group = await inviteRules.joinByInvite(deps, auth.userId, token);
    return group;
  });
}

export async function listMembers(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const list: GroupMember[] = await memberRules.members(deps, auth.userId, publicId);
    return list;
  });
}

export async function leaveGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    await memberRules.leave(deps, auth.userId, publicId);
  });
}

export async function removeMember(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const userPublicId = asPublicUserId(pathParam(event, 'userPublicId'));
    await memberRules.removeMember(deps, auth.userId, publicId, userPublicId);
  });
}

export async function myGroupInvites(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const list: MyGroupInvite[] = await inviteRules.myInvites(deps, auth.userId);
    return list;
  });
}

export async function declineGroupInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const inviteId = pathParam(event, 'inviteId');
    await inviteRules.declineInvite(deps, auth.userId, inviteId);
  });
}

export async function setJoinMode(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: SetGroupJoinModeInput = parseBody(event, SetGroupJoinModeInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const group: Group = await openRules.setJoinMode(deps, auth.userId, publicId, input);
    return group;
  });
}

export async function setModality(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: SetGroupModalityInput = parseBody(event, SetGroupModalityInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const group: Group = await groupRules.setGroupModality(deps, auth.userId, publicId, input);
    return group;
  });
}

export async function previewGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const preview: GroupPreview = await openRules.preview(deps, auth.userId, publicId);
    return preview;
  });
}

export async function requestToJoin(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const preview: GroupPreview = await openRules.request(deps, auth.userId, publicId);
    return preview;
  });
}

export async function cancelJoinRequest(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    await openRules.cancelRequest(deps, auth.userId, publicId);
  });
}

export async function listJoinRequests(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const list: GroupJoinRequest[] = await openRules.listRequests(deps, auth.userId, publicId);
    return list;
  });
}

export async function approveJoinRequest(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: ApproveGroupRequestInput = parseBody(event, ApproveGroupRequestInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const userPublicId = asPublicUserId(pathParam(event, 'userPublicId'));
    await openRules.approveRequest(deps, auth.userId, publicId, userPublicId, input);
  });
}

export async function declineJoinRequest(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const userPublicId = asPublicUserId(pathParam(event, 'userPublicId'));
    await openRules.declineRequest(deps, auth.userId, publicId, userPublicId);
  });
}

// Cargos (GRV-42–48)
export async function listRoles(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const list: GroupRoles = await roleRules.listRoles(deps, auth.userId, publicId);
    return list;
  });
}

export async function createRole(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: CreateGroupRoleInput = parseBody(event, CreateGroupRoleInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const list: GroupRoles = await roleRules.createRole(deps, auth.userId, publicId, input);
    return created(list);
  });
}

export async function updateRole(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: UpdateGroupRoleInput = parseBody(event, UpdateGroupRoleInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const roleId = pathParam(event, 'roleId');
    const list: GroupRoles = await roleRules.updateRole(deps, auth.userId, publicId, roleId, input);
    return list;
  });
}

export async function orderRoles(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: OrderGroupRolesInput = parseBody(event, OrderGroupRolesInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const list: GroupRoles = await roleRules.orderRoles(deps, auth.userId, publicId, input);
    return list;
  });
}

export async function deleteRole(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: DeleteGroupRoleInput = parseBody(event, DeleteGroupRoleInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const roleId = pathParam(event, 'roleId');
    const list: GroupRoles = await roleRules.deleteRole(deps, auth.userId, publicId, roleId, input);
    return list;
  });
}

export async function setMemberRole(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: SetMemberRoleInput = parseBody(event, SetMemberRoleInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const userPublicId = asPublicUserId(pathParam(event, 'userPublicId'));
    await roleRules.setMemberRole(deps, auth.userId, publicId, userPublicId, input);
  });
}

export async function transferGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: TransferGroupInput = parseBody(event, TransferGroupInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    await roleRules.transfer(deps, auth.userId, publicId, input);
  });
}
