import {
  type CreateGroupInput,
  type CreateGroupInviteBody,
  type GroupImageSlot,
  GroupInvitePreviewSchema,
  GroupInviteSchema,
  GroupMemberSchema,
  GroupSchema,
  MediaUploadSchema,
  MyGroupInviteSchema,
} from '@scorely/contracts';
import { request, send } from '@scorely/web/src/lib/http';
import { contentTypeOf, uploadMedia } from '@scorely/web/src/lib/media';

/** Grupo (docs/modules/grupos.md): o grupo sempre pelo id público (GRV-08). */
export const groupsApi = {
  create: (input: CreateGroupInput) => request({ url: '/groups', method: 'POST', data: input }, GroupSchema),
  mine: () => request({ url: '/me/groups' }, GroupSchema.array()),
  get: (id: string) => request({ url: `/groups/${encodeURIComponent(id)}` }, GroupSchema),

  // Convites (GRV-18–22)
  createInvite: (id: string, input: CreateGroupInviteBody) =>
    request(
      { url: `/groups/${encodeURIComponent(id)}/invites`, method: 'POST', data: input },
      GroupInviteSchema,
    ),
  invites: (id: string) =>
    request({ url: `/groups/${encodeURIComponent(id)}/invites` }, GroupInviteSchema.array()),
  revokeInvite: (id: string, inviteId: string) =>
    send({
      url: `/groups/${encodeURIComponent(id)}/invites/${encodeURIComponent(inviteId)}`,
      method: 'DELETE',
    }),
  previewInvite: (token: string) =>
    request({ url: `/invites/${encodeURIComponent(token)}` }, GroupInvitePreviewSchema),
  joinInvite: (token: string) =>
    request({ url: `/invites/${encodeURIComponent(token)}/join`, method: 'POST' }, GroupSchema),

  // Convites para mim (GRV-24)
  myInvites: () => request({ url: '/me/group-invites' }, MyGroupInviteSchema.array()),
  declineInvite: (inviteId: string) =>
    send({ url: `/me/group-invites/${encodeURIComponent(inviteId)}`, method: 'DELETE' }),

  // Membros (GRV-29–31)
  members: (id: string) =>
    request({ url: `/groups/${encodeURIComponent(id)}/members` }, GroupMemberSchema.array()),
  leave: (id: string) => send({ url: `/groups/${encodeURIComponent(id)}/members/me`, method: 'DELETE' }),
  removeMember: (id: string, userId: string) =>
    send({
      url: `/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
      method: 'DELETE',
    }),
};

/** Logo e capa (GRV-09): pede o envio → envia ao S3 → confirma (MID-04, MID-05). */
export async function uploadGroupImage(id: string, slot: GroupImageSlot, blob: Blob) {
  const base = `/groups/${encodeURIComponent(id)}/images/${slot}`;
  const upload = await request(
    { url: `${base}/upload`, method: 'POST', data: { contentType: contentTypeOf(blob) } },
    MediaUploadSchema,
  );
  await uploadMedia(upload, blob);
  return request({ url: base, method: 'PUT', data: { mediaId: upload.mediaId } }, GroupSchema);
}

export const removeGroupImage = (id: string, slot: GroupImageSlot) =>
  request({ url: `/groups/${encodeURIComponent(id)}/images/${slot}`, method: 'DELETE' }, GroupSchema);
