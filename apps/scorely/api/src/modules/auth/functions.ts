import type { AWS } from '@serverless/typescript';
import { AUTHORIZER } from '../../lib/auth';

const handler = (name: string) => `src/modules/auth/handlers.${name}`;

export const authFunctions: AWS['functions'] = {
  // Authorizer do HTTP API (provider.httpApi.authorizers em serverless.ts): não tem rota própria.
  authAuthorizer: {
    handler: 'src/modules/auth/authorizer.handler',
  },
  authRequestCode: {
    handler: handler('requestCode'),
    events: [{ httpApi: { method: 'POST', path: '/auth/code' } }],
  },
  authVerifyCode: {
    handler: handler('verifyCode'),
    events: [{ httpApi: { method: 'POST', path: '/auth/verify' } }],
  },
  authRefresh: {
    handler: handler('refresh'),
    events: [{ httpApi: { method: 'POST', path: '/auth/refresh' } }],
  },
  authLogout: {
    handler: handler('logout'),
    events: [{ httpApi: { method: 'POST', path: '/auth/logout', authorizer: { name: AUTHORIZER } } }],
  },
};
