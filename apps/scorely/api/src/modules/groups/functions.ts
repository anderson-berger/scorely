import { AUTHORIZER } from '@scorely/api/src/lib/auth';
import type { AWS } from '@serverless/typescript';

// Grupo (docs/modules/grupos.md). Toda rota pede login.
const handler = (name: string) => `src/modules/groups/handlers.${name}`;
const route = (method: string, path: string) => [
  { httpApi: { method, path, authorizer: { name: AUTHORIZER } } },
];

export const groupsFunctions: AWS['functions'] = {
  createGroup: { handler: handler('createGroup'), events: route('POST', '/groups') },
  getGroup: { handler: handler('getGroup'), events: route('GET', '/groups/{publicId}') },
  myGroups: { handler: handler('myGroups'), events: route('GET', '/me/groups') },
  // Logo e capa (GRV-09): `slot` = logo | cover
  groupsImageUpload: {
    handler: handler('requestImageUpload'),
    events: route('POST', '/groups/{publicId}/images/{slot}/upload'),
  },
  groupsImageAttach: {
    handler: handler('attachImage'),
    events: route('PUT', '/groups/{publicId}/images/{slot}'),
  },
  groupsImageDetach: {
    handler: handler('detachImage'),
    events: route('DELETE', '/groups/{publicId}/images/{slot}'),
  },
  // Convites e membros (GRV-18–22, 29–31)
  createGroupInvite: {
    handler: handler('createInvite'),
    events: route('POST', '/groups/{publicId}/invites'),
  },
  listGroupInvites: {
    handler: handler('listInvites'),
    events: route('GET', '/groups/{publicId}/invites'),
  },
  revokeGroupInvite: {
    handler: handler('revokeInvite'),
    events: route('DELETE', '/groups/{publicId}/invites/{inviteId}'),
  },
  previewGroupInvite: { handler: handler('previewInvite'), events: route('GET', '/invites/{token}') },
  joinGroupInvite: { handler: handler('joinInvite'), events: route('POST', '/invites/{token}/join') },
  // Convite pessoal (GRV-23, 24)
  myGroupInvites: { handler: handler('myGroupInvites'), events: route('GET', '/me/group-invites') },
  declineGroupInvite: {
    handler: handler('declineGroupInvite'),
    events: route('DELETE', '/me/group-invites/{inviteId}'),
  },
  listGroupMembers: {
    handler: handler('listMembers'),
    events: route('GET', '/groups/{publicId}/members'),
  },
  leaveGroup: {
    handler: handler('leaveGroup'),
    events: route('DELETE', '/groups/{publicId}/members/me'),
  },
  removeGroupMember: {
    handler: handler('removeMember'),
    events: route('DELETE', '/groups/{publicId}/members/{userPublicId}'),
  },
  // Grupo aberto e pedidos (GRV-25–28)
  setGroupJoinMode: {
    handler: handler('setJoinMode'),
    events: route('PUT', '/groups/{publicId}/join-mode'),
  },
  previewGroup: {
    handler: handler('previewGroup'),
    events: route('GET', '/groups/{publicId}/preview'),
  },
  requestToJoinGroup: {
    handler: handler('requestToJoin'),
    events: route('POST', '/groups/{publicId}/requests'),
  },
  cancelGroupJoinRequest: {
    handler: handler('cancelJoinRequest'),
    events: route('DELETE', '/groups/{publicId}/requests/me'),
  },
  listGroupJoinRequests: {
    handler: handler('listJoinRequests'),
    events: route('GET', '/groups/{publicId}/requests'),
  },
  approveGroupJoinRequest: {
    handler: handler('approveJoinRequest'),
    events: route('POST', '/groups/{publicId}/requests/{userPublicId}/approve'),
  },
  declineGroupJoinRequest: {
    handler: handler('declineJoinRequest'),
    events: route('DELETE', '/groups/{publicId}/requests/{userPublicId}'),
  },
  // Cargos (GRV-42–48)
  listGroupRoles: { handler: handler('listRoles'), events: route('GET', '/groups/{publicId}/roles') },
  createGroupRole: { handler: handler('createRole'), events: route('POST', '/groups/{publicId}/roles') },
  orderGroupRoles: { handler: handler('orderRoles'), events: route('PUT', '/groups/{publicId}/roles/order') },
  updateGroupRole: {
    handler: handler('updateRole'),
    events: route('PUT', '/groups/{publicId}/roles/{roleId}'),
  },
  deleteGroupRole: {
    handler: handler('deleteRole'),
    events: route('DELETE', '/groups/{publicId}/roles/{roleId}'),
  },
  setGroupMemberRole: {
    handler: handler('setMemberRole'),
    events: route('PUT', '/groups/{publicId}/members/{userPublicId}/role'),
  },
};
