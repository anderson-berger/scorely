import { authRoute } from '@scorely/api/src/lib/auth';
import { created, type HttpEvent, parseBody, pathParam } from '@scorely/api/src/lib/http';
import { asPublicGroupId, asPublicUserId } from '@scorely/api/src/lib/ids';
import { createGroupV2Images } from '@scorely/api/src/modules/groups-v2/group-v2.images';
import { dynamoGroupV2Repository } from '@scorely/api/src/modules/groups-v2/group-v2.repository';
import { createGroupV2Service } from '@scorely/api/src/modules/groups-v2/group-v2.service';
import { mediaService } from '@scorely/api/src/modules/media/media.service';
import { dynamoUserDirectory } from '@scorely/api/src/modules/users/user.repository';
import {
  AttachMediaInputSchema,
  CreateGroupInviteV2InputSchema,
  CreateGroupV2InputSchema,
  GroupImageSlotSchema,
  MediaUploadInputSchema,
} from '@scorely/contracts';

const groups = createGroupV2Service({
  groups: dynamoGroupV2Repository,
  media: mediaService,
  users: dynamoUserDirectory,
});
const images = createGroupV2Images({ groups: dynamoGroupV2Repository, media: mediaService });

/** `slot` da rota das imagens (GRV-09): `logo` ou `cover`; outro valor → 422. */
const slotOf = (event: HttpEvent) => GroupImageSlotSchema.parse(pathParam(event, 'slot'));

export async function createGroupV2(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return created(await groups.create(auth.userId, parseBody(event, CreateGroupV2InputSchema)));
  });
}

export async function getGroupV2(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const group = await groups.get(auth.userId, asPublicGroupId(pathParam(event, 'publicId')));
    return group;
  });
}

export async function myGroupsV2(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const list = await groups.mine(auth.userId);
    return list;
  });
}

export async function requestImageUploadV2(event: HttpEvent) {
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

export async function attachImageV2(event: HttpEvent) {
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

export async function detachImageV2(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await images.detach(
      auth.userId,
      asPublicGroupId(pathParam(event, 'publicId')),
      slotOf(event),
    );
    return result;
  });
}

export async function createInviteV2(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, CreateGroupInviteV2InputSchema);
    return created(
      await groups.createInvite(auth.userId, asPublicGroupId(pathParam(event, 'publicId')), input),
    );
  });
}

export async function listInvitesV2(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const list = await groups.listInvites(auth.userId, asPublicGroupId(pathParam(event, 'publicId')));
    return list;
  });
}

export async function revokeInviteV2(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.revokeInvite(
      auth.userId,
      asPublicGroupId(pathParam(event, 'publicId')),
      pathParam(event, 'inviteId'),
    );
  });
}

export async function previewInviteV2(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const preview = await groups.previewInvite(auth.userId, pathParam(event, 'token'));
    return preview;
  });
}

export async function joinInviteV2(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const group = await groups.joinByInvite(auth.userId, pathParam(event, 'token'));
    return group;
  });
}

export async function listMembersV2(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const list = await groups.members(auth.userId, asPublicGroupId(pathParam(event, 'publicId')));
    return list;
  });
}

export async function leaveGroupV2(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.leave(auth.userId, asPublicGroupId(pathParam(event, 'publicId')));
  });
}

export async function removeMemberV2(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.removeMember(
      auth.userId,
      asPublicGroupId(pathParam(event, 'publicId')),
      asPublicUserId(pathParam(event, 'userPublicId')),
    );
  });
}
