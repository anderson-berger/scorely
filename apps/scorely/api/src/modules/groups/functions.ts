import { AUTHORIZER } from '@scorely/api/src/lib/auth';
import type { AWS } from '@serverless/typescript';

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
  groupsRename: { handler: handler('renameGroup'), events: route('PUT', '/groups/{id}/name') },
  groupsRotateInvite: { handler: handler('rotateInvite'), events: route('POST', '/groups/{id}/invite') },
  // Lugares (GRP-60–63)
  placesList: { handler: handler('listPlaces'), events: route('GET', '/groups/{id}/places') },
  placesCreate: { handler: handler('createPlace'), events: route('POST', '/groups/{id}/places') },
  placesUpdate: { handler: handler('updatePlace'), events: route('PUT', '/groups/{id}/places/{placeId}') },
  placesArchive: {
    handler: handler('archivePlace'),
    events: route('POST', '/groups/{id}/places/{placeId}/archive'),
  },
  placesUnarchive: {
    handler: handler('unarchivePlace'),
    events: route('POST', '/groups/{id}/places/{placeId}/unarchive'),
  },
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
  // Cargos (GRP-51) e passar o grupo (GRP-54)
  groupsSetStaffRole: {
    handler: handler('setStaffRole'),
    events: route('PUT', '/groups/{id}/members/{userId}/staff-role'),
  },
  groupsClearStaffRole: {
    handler: handler('clearStaffRole'),
    events: route('DELETE', '/groups/{id}/members/{userId}/staff-role'),
  },
  groupsTransfer: { handler: handler('transferGroup'), events: route('POST', '/groups/{id}/transfer') },
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
  gamesUpcoming: { handler: handler('upcomingGames'), events: route('GET', '/groups/{id}/games') },
  // Horários (GRP-64–67)
  schedulesList: { handler: handler('listSchedules'), events: route('GET', '/groups/{id}/schedules') },
  schedulesCreate: { handler: handler('createSchedule'), events: route('POST', '/groups/{id}/schedules') },
  schedulesUpdate: {
    handler: handler('updateSchedule'),
    events: route('PUT', '/groups/{id}/schedules/{scheduleId}'),
  },
  schedulesArchive: {
    handler: handler('archiveSchedule'),
    events: route('POST', '/groups/{id}/schedules/{scheduleId}/archive'),
  },
  schedulesUnarchive: {
    handler: handler('unarchiveSchedule'),
    events: route('POST', '/groups/{id}/schedules/{scheduleId}/unarchive'),
  },
  gamesConfirm: {
    handler: handler('confirm'),
    events: route('POST', '/groups/{id}/games/{gameId}/attendance'),
  },
  gamesLeave: {
    handler: handler('leave'),
    events: route('DELETE', '/groups/{id}/games/{gameId}/attendance'),
  },
  gamesCancel: { handler: handler('cancel'), events: route('POST', '/groups/{id}/games/{gameId}/cancel') },
  gamesUpdate: { handler: handler('updateGame'), events: route('PATCH', '/groups/{id}/games/{gameId}') },
  gamesCreateExtra: { handler: handler('createExtraGame'), events: route('POST', '/groups/{id}/games') },
  gamesReschedule: {
    handler: handler('rescheduleGame'),
    events: route('POST', '/groups/{id}/games/{gameId}/reschedule'),
  },
  gamesReopen: { handler: handler('reopen'), events: route('POST', '/groups/{id}/games/{gameId}/reopen') },
  playView: { handler: handler('playView'), events: route('GET', '/play/{token}') },
  playConfirm: {
    handler: handler('playConfirm'),
    events: route('POST', '/play/{token}/games/{gameId}/attendance'),
  },
  playLeave: {
    handler: handler('playLeave'),
    events: route('DELETE', '/play/{token}/games/{gameId}/attendance'),
  },
};
