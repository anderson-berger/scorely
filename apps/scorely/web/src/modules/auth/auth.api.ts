import { LoginResultSchema, RequestCodeResultSchema } from '@scorely/contracts';
import { request, send } from '@/lib/http';

export const authApi = {
  requestCode: (email: string) =>
    request({ url: '/auth/code', method: 'POST', data: { email } }, RequestCodeResultSchema),
  verifyCode: (email: string, code: string) =>
    request({ url: '/auth/verify', method: 'POST', data: { email, code } }, LoginResultSchema),
  logout: () => send({ url: '/auth/logout', method: 'POST' }),
};
