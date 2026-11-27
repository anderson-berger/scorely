import { randomUUID } from 'node:crypto';
import type { MediaService } from '@scorely/api/src/modules/media/media.service';
import type { memoryUsers } from '@scorely/api/src/modules/users/data/users.memory';
import { MEDIA_PURPOSES, type PublicUserId, PublicUserIdSchema } from '@scorely/contracts';

// O setup único dos usuários (ADR 0021): a pessoa (email e código de amigo) e o dublê da mídia. Cada arquivo
// monta o service com o relógio e as deps que testa (`withUser`).

export const EMAIL = 'ana@example.com';
export const BASE = 'https://uploads.test';
export const PUBLIC_ID = PublicUserIdSchema.parse('7K3QX9TA');

export type MediaCall<K extends keyof MediaService> = Parameters<MediaService[K]>[0];
/**
 * Dublê da mídia: registra as chamadas e o que `target.readCurrent()` devolveu em cada uma. A URL pública é
 * `<base>/public/<purpose>/<mediaId>` (MID-12), como a mídia real.
 */
export function fakeMedia(link: ReturnType<typeof memoryUsers>['link']) {
  const calls = {
    requestUpload: [] as MediaCall<'requestUpload'>[],
    attach: [] as (MediaCall<'attach'> & { current: string | undefined })[],
    detach: [] as (MediaCall<'detach'> & { current: string | undefined })[],
  };
  const failNext: { attach?: Error } = {};
  const urlOf = (purpose: string, mediaId: string) => `${BASE}/public/${purpose}/${mediaId}`;
  const media: MediaService = {
    urlOf,
    async requestUpload(input) {
      calls.requestUpload.push(input);
      const policy = MEDIA_PURPOSES[input.purpose];
      return {
        mediaId: randomUUID(),
        url: `${BASE}/`,
        fields: { key: 'tmp/x' },
        maxBytes: policy.maxBytes,
        width: policy.width,
        height: policy.height,
      };
    },
    async attach(input) {
      const current = await input.target.readCurrent();
      calls.attach.push({ ...input, current });
      if (failNext.attach) {
        const err = failNext.attach;
        delete failNext.attach;
        throw err;
      }
      // MID-07: a mesma foto já ligada não grava nada (o service real sai antes da transação).
      if (current !== input.mediaId) link(input.target.key, input.mediaId);
      return { url: urlOf(input.purpose, input.mediaId) };
    },
    async detach(input) {
      const current = await input.target.readCurrent();
      calls.detach.push({ ...input, current });
      if (current) link(input.target.key, null);
    },
  };
  return { media, calls, failNext };
}

export const errorOf = (p: Promise<unknown>) => p.catch((e: unknown) => e);

export function pid(code: string): PublicUserId {
  return PublicUserIdSchema.parse(code);
}
