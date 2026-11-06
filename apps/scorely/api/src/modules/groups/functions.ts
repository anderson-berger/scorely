import type { AWS } from '@serverless/typescript';
import { AUTHORIZER } from '../../lib/auth';

const handler = (name: string) => `src/modules/groups/handlers.${name}`;
const route = (method: string, path: string) => [
  { httpApi: { method, path, authorizer: { name: AUTHORIZER } } },
];

export const groupsFunctions: AWS['functions'] = {
  groupsCreate: { handler: handler('create'), events: route('POST', '/groups') },
  groupsMine: { handler: handler('myGroups'), events: route('GET', '/me/groups') },
  groupsGet: { handler: handler('get'), events: route('GET', '/groups/{id}') },
  groupsRotateInvite: { handler: handler('rotateInvite'), events: route('POST', '/groups/{id}/invite') },
  groupsAcceptInvite: { handler: handler('acceptInvite'), events: route('POST', '/invites/{token}/accept') },
  groupsMembers: { handler: handler('members'), events: route('GET', '/groups/{id}/members') },
  groupsRemoveMember: {
    handler: handler('removeMember'),
    events: route('DELETE', '/groups/{id}/members/{userId}'),
  },
  gamesCurrent: { handler: handler('currentGame'), events: route('GET', '/groups/{id}/games/current') },
  gamesConfirm: {
    handler: handler('confirm'),
    events: route('POST', '/groups/{id}/games/{date}/attendance'),
  },
  gamesLeave: { handler: handler('leave'), events: route('DELETE', '/groups/{id}/games/{date}/attendance') },
  gamesCancel: { handler: handler('cancel'), events: route('POST', '/groups/{id}/games/{date}/cancel') },
};
