import { AUTHORIZER } from '@scorely/api/src/lib/auth';
import type { AWS } from '@serverless/typescript';

const handler = (name: string) => `src/modules/notifications/handlers.${name}`;

export const notificationsFunctions: AWS['functions'] = {
  notificationsList: {
    handler: handler('list'),
    events: [{ httpApi: { method: 'GET', path: '/notifications', authorizer: { name: AUTHORIZER } } }],
  },
  notificationsMarkRead: {
    handler: handler('markRead'),
    events: [
      { httpApi: { method: 'POST', path: '/notifications/{id}/read', authorizer: { name: AUTHORIZER } } },
    ],
  },
  notificationsMarkAllRead: {
    handler: handler('markAllRead'),
    events: [
      { httpApi: { method: 'POST', path: '/notifications/read-all', authorizer: { name: AUTHORIZER } } },
    ],
  },
  notificationsRemove: {
    handler: handler('remove'),
    events: [
      { httpApi: { method: 'DELETE', path: '/notifications/{id}', authorizer: { name: AUTHORIZER } } },
    ],
  },
};
