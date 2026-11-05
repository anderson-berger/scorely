import { UpdateMeInputSchema } from '@scorely/contracts';
import { authHandlers } from '../../lib/auth';
import { parseBody } from '../../lib/http';
import { dynamoUserRepository } from './user.repository';
import { createUserService } from './user.service';

const users = createUserService(dynamoUserRepository);

export const { me, updateMe } = authHandlers({
  async me(_event, auth) {
    return users.get(auth.userId);
  },

  async updateMe(event, auth) {
    const patch = parseBody(event, UpdateMeInputSchema);
    return users.update(auth.userId, patch);
  },
});
