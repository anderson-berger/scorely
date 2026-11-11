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
  // Foto de perfil (plano 010): assina o POST, confirma o upload e remove
  usersAvatarUpload: {
    handler: handler('requestAvatarUpload'),
    events: [{ httpApi: { method: 'POST', path: '/me/avatar/upload', authorizer: { name: AUTHORIZER } } }],
  },
  usersSetAvatar: {
    handler: handler('setAvatar'),
    events: [{ httpApi: { method: 'PUT', path: '/me/avatar', authorizer: { name: AUTHORIZER } } }],
  },
  usersClearAvatar: {
    handler: handler('clearAvatar'),
    events: [{ httpApi: { method: 'DELETE', path: '/me/avatar', authorizer: { name: AUTHORIZER } } }],
  },
};
