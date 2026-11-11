import { MediaUploadSchema, type UpdateMeInput, type User, UserSchema } from '@scorely/contracts';
import { request } from '@/lib/http';
import { contentTypeOf, uploadMedia } from '@/lib/media';

export const usersApi = {
  me: () => request({ url: '/me' }, UserSchema),
  updateMe: (patch: UpdateMeInput) => request({ url: '/me', method: 'PATCH', data: patch }, UserSchema),

  /** Foto de perfil (USR-08): pede o envio → envia ao S3 → confirma (MID-04, MID-05). */
  async uploadAvatar(blob: Blob): Promise<User> {
    const upload = await request(
      { url: '/me/avatar/upload', method: 'POST', data: { contentType: contentTypeOf(blob) } },
      MediaUploadSchema,
    );
    await uploadMedia(upload, blob);
    return request({ url: '/me/avatar', method: 'PUT', data: { mediaId: upload.mediaId } }, UserSchema);
  },

  removeAvatar: () => request({ url: '/me/avatar', method: 'DELETE' }, UserSchema),
};
