import {
  type CreateGroupInput,
  GameSchema,
  type Group,
  type GroupImageSlot,
  GroupSchema,
  GuestGameSchema,
  type InviteKind,
  InviteSchema,
  MediaUploadSchema,
  MemberInviteSchema,
  MemberSchema,
  MyGroupSchema,
  type UpdateGameInput,
  type UpdateGroupInput,
} from '@scorely/contracts';
import { request, send } from '@/lib/http';
import { contentTypeOf, uploadMedia } from '@/lib/media';

const game = (groupId: string, date: string) => `/groups/${groupId}/games/${date}`;
const play = (token: string) => `/play/${encodeURIComponent(token)}`;

export const groupsApi = {
  create: (input: CreateGroupInput) => request({ url: '/groups', method: 'POST', data: input }, GroupSchema),
  mine: () => request({ url: '/me/groups' }, MyGroupSchema.array()),
  archived: () => request({ url: '/me/groups/archived' }, GroupSchema.array()),
  archive: (id: string) => request({ url: `/groups/${id}/archive`, method: 'POST' }, GroupSchema),
  unarchive: (id: string) => request({ url: `/groups/${id}/unarchive`, method: 'POST' }, GroupSchema),
  get: (id: string) => request({ url: `/groups/${id}` }, GroupSchema),
  update: (id: string, patch: UpdateGroupInput) =>
    request({ url: `/groups/${id}`, method: 'PATCH', data: patch }, GroupSchema),
  /** Vagas e mínimo só do jogo atual (GRP-45, 46); `null` = volta ao padrão do grupo. */
  updateGame: (id: string, date: string, patch: UpdateGameInput) =>
    request({ url: `/groups/${id}/games/${date}`, method: 'PATCH', data: patch }, GameSchema),
  rotateInvite: (id: string, kind: InviteKind) =>
    request({ url: `/groups/${id}/invite`, method: 'POST', data: { kind } }, InviteSchema),
  acceptInvite: (token: string) =>
    request({ url: `/invites/${encodeURIComponent(token)}/accept`, method: 'POST' }, GroupSchema),
  members: (id: string) => request({ url: `/groups/${id}/members` }, MemberSchema.array()),
  removeMember: (id: string, userId: string) =>
    send({ url: `/groups/${id}/members/${userId}`, method: 'DELETE' }),
  /** Convite para membro (GRP-40, 41) e sair do grupo (GRP-42). */
  inviteToMember: (id: string, userId: string) =>
    request({ url: `/groups/${id}/members/${userId}/member-invite`, method: 'POST' }, MemberInviteSchema),
  cancelMemberInvite: (id: string, userId: string) =>
    send({ url: `/groups/${id}/members/${userId}/member-invite`, method: 'DELETE' }),
  acceptMemberInvite: (id: string) =>
    request({ url: `/groups/${id}/member-invite/accept`, method: 'POST' }, GroupSchema),
  declineMemberInvite: (id: string) => send({ url: `/groups/${id}/member-invite/decline`, method: 'POST' }),
  leaveGroup: (id: string) => send({ url: `/groups/${id}/leave`, method: 'POST' }),
  currentGame: (id: string) => request({ url: `/groups/${id}/games/current` }, GameSchema),
  confirm: (id: string, date: string) =>
    request({ url: `${game(id, date)}/attendance`, method: 'POST' }, GameSchema),
  leave: (id: string, date: string) => send({ url: `${game(id, date)}/attendance`, method: 'DELETE' }),
  cancel: (id: string, date: string) =>
    request({ url: `${game(id, date)}/cancel`, method: 'POST' }, GameSchema),
  reopen: (id: string, date: string) =>
    request({ url: `${game(id, date)}/reopen`, method: 'POST' }, GameSchema),
  play: (token: string) => request({ url: play(token) }, GuestGameSchema),
  playConfirm: (token: string, date: string) =>
    request({ url: `${play(token)}/games/${date}/attendance`, method: 'POST' }, GameSchema),
  playLeave: (token: string, date: string) =>
    send({ url: `${play(token)}/games/${date}/attendance`, method: 'DELETE' }),
};

/** Logo e capa do grupo (GRP-35): pede o envio → envia ao S3 → confirma (MID-04, MID-05). */
export async function uploadGroupImage(id: string, slot: GroupImageSlot, blob: Blob): Promise<Group> {
  const base = `/groups/${id}/images/${slot}`;
  const upload = await request(
    { url: `${base}/upload`, method: 'POST', data: { contentType: contentTypeOf(blob) } },
    MediaUploadSchema,
  );
  await uploadMedia(upload, blob);
  return request({ url: base, method: 'PUT', data: { mediaId: upload.mediaId } }, GroupSchema);
}

export const removeGroupImage = (id: string, slot: GroupImageSlot) =>
  request({ url: `/groups/${id}/images/${slot}`, method: 'DELETE' }, GroupSchema);
