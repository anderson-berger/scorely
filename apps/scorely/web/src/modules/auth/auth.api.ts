import { LoginResultSchema, RequestCodeResultSchema } from '@scorely/contracts';
import { i18n } from '@/i18n';
import { request, send } from '@/lib/http';

export const authApi = {
  /** Manda o idioma efetivo: o email com o código sai nele. */
  requestCode: (email: string) =>
    request(
      { url: '/auth/code', method: 'POST', data: { email, locale: i18n.global.locale.value } },
      RequestCodeResultSchema,
    ),
  verifyCode: (email: string, code: string) =>
    request({ url: '/auth/verify', method: 'POST', data: { email, code } }, LoginResultSchema),
  logout: () => send({ url: '/auth/logout', method: 'POST' }),
};
