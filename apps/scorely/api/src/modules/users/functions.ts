import type { AWS } from '@serverless/typescript';
import { AUTHORIZER } from '../../lib/auth';

const handler = (name: string) => `src/modules/users/handlers.${name}`;

export const usersFunctions: AWS['functions'] = {
  usersMe: {
    handler: handler('me'),
    events: [{ httpApi: { method: 'GET', path: '/me', authorizer: { name: AUTHORIZER } } }],
  },
  usersUpdateMe: {
    handler: handler('updateMe'),
    events: [{ httpApi: { method: 'PATCH', path: '/me', authorizer: { name: AUTHORIZER } } }],
  },
};
