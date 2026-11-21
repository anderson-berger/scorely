import { authRoute } from '@scorely/api/src/lib/auth';
import { created, type HttpEvent, parseBody, pathParam } from '@scorely/api/src/lib/http';
import { asPublicGroupId } from '@scorely/api/src/lib/ids';
import { createGroupV2Images } from '@scorely/api/src/modules/groups-v2/group-v2.images';
import { dynamoGroupV2Repository } from '@scorely/api/src/modules/groups-v2/group-v2.repository';
import { createGroupV2Service } from '@scorely/api/src/modules/groups-v2/group-v2.service';
import { mediaService } from '@scorely/api/src/modules/media/media.service';
import {
  AttachMediaInputSchema,
  CreateGroupV2InputSchema,
  GroupImageSlotSchema,
  MediaUploadInputSchema,
} from '@scorely/contracts';

const groups = createGroupV2Service({ groups: dynamoGroupV2Repository, media: mediaService });
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
