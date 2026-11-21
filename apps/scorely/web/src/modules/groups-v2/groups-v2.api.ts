import {
  type CreateGroupV2Input,
  type GroupImageSlot,
  GroupV2Schema,
  MediaUploadSchema,
} from '@scorely/contracts';
import { request } from '@scorely/web/src/lib/http';
import { contentTypeOf, uploadMedia } from '@scorely/web/src/lib/media';

/** Grupo v2 (docs/modules/grupos-v2.md): rotas em `/v2`, o grupo sempre pelo id público (GRV-08). */
export const groupsV2Api = {
  create: (input: CreateGroupV2Input) =>
    request({ url: '/v2/groups', method: 'POST', data: input }, GroupV2Schema),
  mine: () => request({ url: '/v2/me/groups' }, GroupV2Schema.array()),
  get: (id: string) => request({ url: `/v2/groups/${encodeURIComponent(id)}` }, GroupV2Schema),
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
