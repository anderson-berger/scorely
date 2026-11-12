import { authRoute } from '@scorely/api/src/lib/auth';
import { type HttpEvent, parseBody } from '@scorely/api/src/lib/http';
import { dynamoUserRepository } from '@scorely/api/src/modules/users/user.repository';
import { createUserService } from '@scorely/api/src/modules/users/user.service';
import { AttachMediaInputSchema, MediaUploadInputSchema, UpdateMeInputSchema } from '@scorely/contracts';

const users = createUserService(dynamoUserRepository);

export async function me(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return users.get(auth.userId);
  });
}

export async function updateMe(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const patch = parseBody(event, UpdateMeInputSchema);
    return users.update(auth.userId, patch);
  });
}

export async function requestAvatarUpload(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return users.requestAvatarUpload(auth.userId, parseBody(event, MediaUploadInputSchema));
  });
}

export async function setAvatar(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return users.setAvatar(auth.userId, parseBody(event, AttachMediaInputSchema));
  });
}

export async function clearAvatar(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return users.clearAvatar(auth.userId);
  });
}
