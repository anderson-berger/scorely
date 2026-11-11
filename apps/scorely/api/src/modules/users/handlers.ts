import { AttachMediaInputSchema, MediaUploadInputSchema, UpdateMeInputSchema } from '@scorely/contracts';
import { authHandlers } from '../../lib/auth';
import { parseBody } from '../../lib/http';
import { dynamoUserRepository } from './user.repository';
import { createUserService } from './user.service';

const users = createUserService(dynamoUserRepository);

export const { me, updateMe, requestAvatarUpload, setAvatar, clearAvatar } = authHandlers({
  async me(_event, auth) {
    return users.get(auth.userId);
  },

  async updateMe(event, auth) {
    const patch = parseBody(event, UpdateMeInputSchema);
    return users.update(auth.userId, patch);
  },

  async requestAvatarUpload(event, auth) {
    return users.requestAvatarUpload(auth.userId, parseBody(event, MediaUploadInputSchema));
  },

  async setAvatar(event, auth) {
    return users.setAvatar(auth.userId, parseBody(event, AttachMediaInputSchema));
  },

  async clearAvatar(_event, auth) {
    return users.clearAvatar(auth.userId);
  },
});
