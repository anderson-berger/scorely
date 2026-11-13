import { type Me, MediaUploadSchema, MeSchema, type UpdateMeInput } from '@scorely/contracts';
import { request } from '@scorely/web/src/lib/http';
import { contentTypeOf, uploadMedia } from '@scorely/web/src/lib/media';

export const usersApi = {
  me: () => request({ url: '/me' }, MeSchema),
  updateMe: (patch: UpdateMeInput) => request({ url: '/me', method: 'PATCH', data: patch }, MeSchema),

  /** Foto de perfil (USR-08): pede o envio → envia ao S3 → confirma (MID-04, MID-05). */
  async uploadAvatar(blob: Blob): Promise<Me> {
    const upload = await request(
      { url: '/me/avatar/upload', method: 'POST', data: { contentType: contentTypeOf(blob) } },
      MediaUploadSchema,
    );
    await uploadMedia(upload, blob);
    return request({ url: '/me/avatar', method: 'PUT', data: { mediaId: upload.mediaId } }, MeSchema);
  },

  removeAvatar: () => request({ url: '/me/avatar', method: 'DELETE' }, MeSchema),
};
