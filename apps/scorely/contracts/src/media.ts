import { z } from 'zod';

/** Tipo do arquivo (midia.md). Por enquanto só imagem; vídeo e PDF entram aqui quando vierem. */
export const MediaKindSchema = z.enum(['image']);
export type MediaKind = z.infer<typeof MediaKindSchema>;

/** Finalidade da mídia (MID-02): define o dono, o tamanho, o peso e o que acontece ao trocar. */
export const MediaPurposeSchema = z.enum(['avatar', 'group.logo', 'group.cover']);
export type MediaPurpose = z.infer<typeof MediaPurposeSchema>;

/** A quem a mídia pertence. */
export const MediaOwnerTypeSchema = z.enum(['user', 'group']);
export type MediaOwnerType = z.infer<typeof MediaOwnerTypeSchema>;

/** Formatos aceitos (MID-02). O navegador manda WebP, ou JPEG quando não faz WebP (MID-03). */
export const ImageContentTypeSchema = z.enum(['image/webp', 'image/jpeg', 'image/png']);
export type ImageContentType = z.infer<typeof ImageContentTypeSchema>;

const MB = 1024 * 1024;

export interface MediaPolicy {
  kind: MediaKind;
  ownerType: MediaOwnerType;
  /** Tamanho final exato, em pixels (MID-05). */
  width: number;
  height: number;
  maxBytes: number;
  /** Ao trocar, a anterior sai do banco e do S3 (MID-09). */
  replace: 'delete';
  access: 'public';
}

/**
 * Catálogo de finalidades (MID-02). Fica no contrato para o web preparar a imagem (MID-03) com os
 * mesmos números que a api confere.
 */
export const MEDIA_PURPOSES = {
  avatar: {
    kind: 'image',
    ownerType: 'user',
    width: 512,
    height: 512,
    maxBytes: 2 * MB,
    replace: 'delete',
    access: 'public',
  },
  'group.logo': {
    kind: 'image',
    ownerType: 'group',
    width: 512,
    height: 512,
    maxBytes: 2 * MB,
    replace: 'delete',
    access: 'public',
  },
  'group.cover': {
    kind: 'image',
    ownerType: 'group',
    width: 1600,
    height: 600,
    maxBytes: 2 * MB,
    replace: 'delete',
    access: 'public',
  },
} as const satisfies Record<MediaPurpose, MediaPolicy>;

/** Pedido de envio (MID-04): o formato que o navegador vai mandar. */
export const MediaUploadInputSchema = z.object({ contentType: ImageContentTypeSchema });
export type MediaUploadInput = z.infer<typeof MediaUploadInputSchema>;

/**
 * POST assinado (MID-04): o navegador envia um form com `fields` e, por último, o campo `file`, para `url`.
 * `width`/`height`/`maxBytes`: o que a api vai conferir ao confirmar (MID-05).
 */
export const MediaUploadSchema = z.object({
  mediaId: z.uuid(),
  url: z.url(),
  fields: z.record(z.string(), z.string()),
  maxBytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type MediaUpload = z.infer<typeof MediaUploadSchema>;

/** Confirmar o envio e ligar a mídia na área (MID-05 a MID-08). */
export const AttachMediaInputSchema = z.object({ mediaId: z.uuid() });
export type AttachMediaInput = z.infer<typeof AttachMediaInputSchema>;
