import type { AWS } from '@serverless/typescript';
import { AUTHORIZER } from '../../lib/auth';

const handler = (name: string) => `src/modules/groups/handlers.${name}`;
const route = (method: string, path: string) => [
  { httpApi: { method, path, authorizer: { name: AUTHORIZER } } },
];

export const groupsFunctions: AWS['functions'] = {
  groupsCreate: { handler: handler('create'), events: route('POST', '/groups') },
  groupsMine: { handler: handler('myGroups'), events: route('GET', '/me/groups') },
  groupsArchivedMine: { handler: handler('archivedGroups'), events: route('GET', '/me/groups/archived') },
  groupsArchive: { handler: handler('archive'), events: route('POST', '/groups/{id}/archive') },
  groupsUnarchive: { handler: handler('unarchive'), events: route('POST', '/groups/{id}/unarchive') },
  groupsGet: { handler: handler('get'), events: route('GET', '/groups/{id}') },
  groupsUpdate: { handler: handler('update'), events: route('PATCH', '/groups/{id}') },
  groupsRotateInvite: { handler: handler('rotateInvite'), events: route('POST', '/groups/{id}/invite') },
  // Logo e capa (GRP-35): `slot` = logo | cover
  groupsImageUpload: {
    handler: handler('requestImageUpload'),
    events: route('POST', '/groups/{id}/images/{slot}/upload'),
  },
  groupsImageAttach: { handler: handler('attachImage'), events: route('PUT', '/groups/{id}/images/{slot}') },
  groupsImageDetach: {
    handler: handler('detachImage'),
    events: route('DELETE', '/groups/{id}/images/{slot}'),
  },
  groupsAcceptInvite: { handler: handler('acceptInvite'), events: route('POST', '/invites/{token}/accept') },
  groupsMembers: { handler: handler('members'), events: route('GET', '/groups/{id}/members') },
  groupsRemoveMember: {
    handler: handler('removeMember'),
    events: route('DELETE', '/groups/{id}/members/{userId}'),
  },
  // Convite para membro (GRP-40, 41) e sair do grupo (GRP-42)
  groupsInviteToMember: {
    handler: handler('inviteToMember'),
    events: route('POST', '/groups/{id}/members/{userId}/member-invite'),
  },
  groupsCancelMemberInvite: {
    handler: handler('cancelMemberInvite'),
    events: route('DELETE', '/groups/{id}/members/{userId}/member-invite'),
  },
  groupsAcceptMemberInvite: {
    handler: handler('acceptMemberInvite'),
    events: route('POST', '/groups/{id}/member-invite/accept'),
  },
  groupsDeclineMemberInvite: {
    handler: handler('declineMemberInvite'),
    events: route('POST', '/groups/{id}/member-invite/decline'),
  },
  groupsLeave: { handler: handler('leaveGroup'), events: route('POST', '/groups/{id}/leave') },
  gamesCurrent: { handler: handler('currentGame'), events: route('GET', '/groups/{id}/games/current') },
  gamesConfirm: {
    handler: handler('confirm'),
    events: route('POST', '/groups/{id}/games/{date}/attendance'),
  },
  gamesLeave: { handler: handler('leave'), events: route('DELETE', '/groups/{id}/games/{date}/attendance') },
  gamesCancel: { handler: handler('cancel'), events: route('POST', '/groups/{id}/games/{date}/cancel') },
  gamesUpdate: { handler: handler('updateGame'), events: route('PATCH', '/groups/{id}/games/{date}') },
  gamesReopen: { handler: handler('reopen'), events: route('POST', '/groups/{id}/games/{date}/reopen') },
  playView: { handler: handler('playView'), events: route('GET', '/play/{token}') },
  playConfirm: {
    handler: handler('playConfirm'),
    events: route('POST', '/play/{token}/games/{date}/attendance'),
  },
  playLeave: {
    handler: handler('playLeave'),
    events: route('DELETE', '/play/{token}/games/{date}/attendance'),
  },
};
