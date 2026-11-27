import { authRoute } from '@scorely/api/src/lib/auth';
import { type HttpEvent, parseBody } from '@scorely/api/src/lib/http';
import { dynamoUserRepository } from '@scorely/api/src/modules/users/data/users.repository';
import { createUserService } from '@scorely/api/src/modules/users/users.service';
import {
  type AttachMediaInput,
  AttachMediaInputSchema,
  type Me,
  type MediaUpload,
  type MediaUploadInput,
  MediaUploadInputSchema,
  type UpdateMeInput,
  UpdateMeInputSchema,
} from '@scorely/contracts';

const users = createUserService(dynamoUserRepository);

export async function me(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const userId = auth.userId;
    const user: Me = await users.get(userId);
    return user;
  });
}

export async function updateMe(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const userId = auth.userId;
    const patch: UpdateMeInput = parseBody(event, UpdateMeInputSchema);
    const result: Me = await users.update(userId, patch);
    return result;
  });
}

export async function requestAvatarUpload(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const userId = auth.userId;
    const uploadData: MediaUploadInput = parseBody(event, MediaUploadInputSchema);
    const result: MediaUpload = await users.requestAvatarUpload(userId, uploadData);
    return result;
  });
}

export async function setAvatar(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const userId = auth.userId;
    const input: AttachMediaInput = parseBody(event, AttachMediaInputSchema);
    const result: Me = await users.setAvatar(userId, input);
    return result;
  });
}

export async function clearAvatar(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const userId = auth.userId;
    const result: Me = await users.clearAvatar(userId);
    return result;
  });
}
