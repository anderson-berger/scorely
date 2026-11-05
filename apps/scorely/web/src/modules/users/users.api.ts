import { type UpdateMeInput, UserSchema } from '@scorely/contracts';
import { request } from '@/lib/http';

export const usersApi = {
  me: () => request({ url: '/me' }, UserSchema),
  updateMe: (patch: UpdateMeInput) => request({ url: '/me', method: 'PATCH', data: patch }, UserSchema),
};
