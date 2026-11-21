import {
  type CreateGroupInviteV2Input,
  type CreateGroupV2Input,
  type GroupImageSlot,
  GroupInvitePreviewV2Schema,
  GroupInviteV2Schema,
  GroupMemberV2Schema,
  GroupV2Schema,
  MediaUploadSchema,
} from '@scorely/contracts';
import { request, send } from '@scorely/web/src/lib/http';
import { contentTypeOf, uploadMedia } from '@scorely/web/src/lib/media';

/** Grupo v2 (docs/modules/grupos-v2.md): rotas em `/v2`, o grupo sempre pelo id público (GRV-08). */
export const groupsV2Api = {
  create: (input: CreateGroupV2Input) =>
    request({ url: '/v2/groups', method: 'POST', data: input }, GroupV2Schema),
  mine: () => request({ url: '/v2/me/groups' }, GroupV2Schema.array()),
  get: (id: string) => request({ url: `/v2/groups/${encodeURIComponent(id)}` }, GroupV2Schema),

  // Convites (GRV-18–22)
  createInvite: (id: string, input: CreateGroupInviteV2Input) =>
    request(
      { url: `/v2/groups/${encodeURIComponent(id)}/invites`, method: 'POST', data: input },
      GroupInviteV2Schema,
    ),
  invites: (id: string) =>
    request({ url: `/v2/groups/${encodeURIComponent(id)}/invites` }, GroupInviteV2Schema.array()),
  revokeInvite: (id: string, inviteId: string) =>
    send({
      url: `/v2/groups/${encodeURIComponent(id)}/invites/${encodeURIComponent(inviteId)}`,
      method: 'DELETE',
    }),
  previewInvite: (token: string) =>
    request({ url: `/v2/invites/${encodeURIComponent(token)}` }, GroupInvitePreviewV2Schema),
  joinInvite: (token: string) =>
    request({ url: `/v2/invites/${encodeURIComponent(token)}/join`, method: 'POST' }, GroupV2Schema),

  // Membros (GRV-29–31)
  members: (id: string) =>
    request({ url: `/v2/groups/${encodeURIComponent(id)}/members` }, GroupMemberV2Schema.array()),
  leave: (id: string) => send({ url: `/v2/groups/${encodeURIComponent(id)}/members/me`, method: 'DELETE' }),
  removeMember: (id: string, userId: string) =>
    send({
      url: `/v2/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
      method: 'DELETE',
    }),
};

/** Logo e capa (GRV-09): pede o envio → envia ao S3 → confirma (MID-04, MID-05). */
export async function uploadGroupV2Image(id: string, slot: GroupImageSlot, blob: Blob) {
  const base = `/v2/groups/${encodeURIComponent(id)}/images/${slot}`;
  const upload = await request(
    { url: `${base}/upload`, method: 'POST', data: { contentType: contentTypeOf(blob) } },
    MediaUploadSchema,
  );
  await uploadMedia(upload, blob);
  return request({ url: base, method: 'PUT', data: { mediaId: upload.mediaId } }, GroupV2Schema);
}

export const removeGroupV2Image = (id: string, slot: GroupImageSlot) =>
  request({ url: `/v2/groups/${encodeURIComponent(id)}/images/${slot}`, method: 'DELETE' }, GroupV2Schema);
