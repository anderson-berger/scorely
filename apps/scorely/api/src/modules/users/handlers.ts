import { authRoute } from '@scorely/api/src/lib/auth';
import { type HttpEvent, parseBody } from '@scorely/api/src/lib/http';
import { dynamoUserRepository } from '@scorely/api/src/modules/users/user.repository';
import { createUserService } from '@scorely/api/src/modules/users/user.service';
import { AttachMediaInputSchema, MediaUploadInputSchema, UpdateMeInputSchema } from '@scorely/contracts';

const users = createUserService(dynamoUserRepository);

export async function me(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const user = await users.get(auth.userId);
    return user;
  });
}

export async function updateMe(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const patch = parseBody(event, UpdateMeInputSchema);
    const result = await users.update(auth.userId, patch);
    return result;
  });
}

export async function requestAvatarUpload(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await users.requestAvatarUpload(auth.userId, parseBody(event, MediaUploadInputSchema));
    return result;
  });
}

export async function setAvatar(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await users.setAvatar(auth.userId, parseBody(event, AttachMediaInputSchema));
    return result;
  });
}

export async function clearAvatar(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await users.clearAvatar(auth.userId);
    return result;
  });
}
