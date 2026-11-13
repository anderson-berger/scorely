import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import { MEDIA_PREFIXES, type MediaStorage, s3MediaStorage } from '@scorely/api/src/lib/storage';
import { dynamoMediaRepository, type MediaRepository } from '@scorely/api/src/modules/media/media.repository';
import type { MediaRecord, MediaTarget } from '@scorely/api/src/modules/media/media.table';
import {
  type ImageContentType,
  MEDIA_PURPOSES,
  type MediaPurpose,
  type MediaUpload,
} from '@scorely/contracts';

/** Uma mídia pendente vence em 1 h (MID-04). */
const PENDING_TTL_MS = 60 * 60 * 1000;

/** Tentativas de trocar ou remover quando outra troca entra no meio (MID-08). */
const ATTEMPTS = 3;

const EXTENSIONS: Record<ImageContentType, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export interface MediaDeps {
  repo: MediaRepository;
  storage: MediaStorage;
  now?: () => Date;
}

interface AttachInput {
  mediaId: string;
  purpose: MediaPurpose;
  ownerId: string;
  target: MediaTarget;
}

/** Envio, conferência, troca e remoção de mídia (docs/modules/midia.md). Quem pode é a área que decide (MID-01). */
export function createMediaService({ repo, storage, now = () => new Date() }: MediaDeps) {
  /** Apaga o arquivo sem derrubar a resposta: o banco já está certo (MID-11). */
  async function removeQuietly(key: string): Promise<void> {
    await storage.remove(key).catch((err: unknown) => {
      console.warn(JSON.stringify({ msg: 'media file remove failed', key, error: String(err) }));
    });
  }

  /** A mídia que a área está pedindo, ainda válida. Qualquer outro caso → o mesmo `MEDIA_NOT_FOUND` (MID-05). */
  async function requireOwned(input: AttachInput): Promise<MediaRecord> {
    const media = await repo.get(input.mediaId);
    if (!media || media.ownerId !== input.ownerId || media.purpose !== input.purpose) {
      throw appError('MEDIA_NOT_FOUND');
    }
    return media;
  }

  /** Confere o arquivo pelos bytes (MID-05). Reprovou → apaga o arquivo e responde `MEDIA_INVALID`. */
  async function inspectUpload(media: MediaRecord): Promise<{
    contentType: ImageContentType;
    size: number;
    width: number;
    height: number;
  }> {
    const policy = MEDIA_PURPOSES[media.purpose];
    const file = await storage.inspect(media.key);
    if (!file) throw appError('MEDIA_NOT_UPLOADED');
    const { format, size, width, height } = file;
    const ok =
      format !== undefined &&
      size >= 1 &&
      size <= policy.maxBytes &&
      width === policy.width &&
      height === policy.height;
    if (!ok) {
      await removeQuietly(media.key);
      throw appError('MEDIA_INVALID', {
        maxBytes: policy.maxBytes,
        width: policy.width,
        height: policy.height,
      });
    }
    return { contentType: format, size, width, height };
  }

  /**
   * Liga a pronta na área; se outra troca entrou no meio, relê a ligada e tenta de novo (MID-08).
   * `already`: outra confirmação da mesma mídia ligou antes (MID-07); nada a gravar nem a apagar.
   */
  async function link(
    ready: MediaRecord,
    url: string,
    target: MediaTarget,
    attempt: number,
  ): Promise<{ already: true } | { already: false; previous: MediaRecord | undefined }> {
    const currentId = await target.readCurrent();
    if (currentId === ready.id) return { already: true };
    const previous = currentId ? await repo.get(currentId) : undefined;
    const result = await repo.attach({
      ready,
      url,
      target: { key: target.key, field: target.field },
      ...(previous && { previous }),
    });
    if (result === 'attached') return { already: false, previous };
    if (attempt >= ATTEMPTS) throw new Error('Media attach kept conflicting with other writes');
    return link(ready, url, target, attempt + 1);
  }

  async function unlink(target: MediaTarget, attempt: number): Promise<MediaRecord | undefined> {
    const currentId = await target.readCurrent();
    if (!currentId) return undefined;
    const previous = await repo.get(currentId);
    // Outra remoção apagou a mídia no meio: relê a área, que deve estar vazia (MID-10)
    if (!previous) {
      if (attempt >= ATTEMPTS) throw new Error('Linked media record is missing');
      return unlink(target, attempt + 1);
    }
    const result = await repo.detach({ target: { key: target.key, field: target.field }, previous });
    if (result === 'detached') return previous;
    if (attempt >= ATTEMPTS) throw new Error('Media detach kept conflicting with other writes');
    return unlink(target, attempt + 1);
  }

  return {
    /** MID-04: registra a pendente e devolve o POST assinado para `tmp/<id>`. */
    async requestUpload(input: {
      purpose: MediaPurpose;
      ownerId: string;
      /** MID-12: o que vai no caminho público (padrão: o `ownerId`). A foto de perfil passa o id público. */
      ownerRef?: string;
      uploadedBy: string;
      contentType: ImageContentType;
    }): Promise<MediaUpload> {
      const policy = MEDIA_PURPOSES[input.purpose];
      const at = now();
      const entity = newEntity<MediaRecord>(
        {
          kind: policy.kind,
          purpose: input.purpose,
          ownerType: policy.ownerType,
          ownerId: input.ownerId,
          ...(input.ownerRef !== undefined && { ownerRef: input.ownerRef }),
          status: 'pending',
          key: '',
          uploadedBy: input.uploadedBy,
          expiresAt: new Date(at.getTime() + PENDING_TTL_MS).toISOString(),
        },
        at,
      );
      // A key usa o id que o `newEntity` gerou
      const media: MediaRecord = { ...entity, key: `${MEDIA_PREFIXES.tmp}${entity.id}` };
      await repo.createPending(media);
      const { url, fields } = await storage.presignUpload(media.key, input.contentType, policy.maxBytes);
      return {
        mediaId: media.id,
        url,
        fields,
        maxBytes: policy.maxBytes,
        width: policy.width,
        height: policy.height,
      };
    },

    /** MID-05 a MID-09, MID-11. Devolve a URL pública da mídia ligada. */
    async attach(input: AttachInput): Promise<{ url: string }> {
      const media = await requireOwned(input);
      if (media.status === 'ready') {
        // MID-07: já pronta e ligada → nada a fazer
        if ((await input.target.readCurrent()) === media.id) return { url: storage.publicUrl(media.key) };
        throw appError('MEDIA_NOT_FOUND');
      }
      if (!media.expiresAt || new Date(media.expiresAt) <= now()) throw appError('MEDIA_NOT_FOUND');

      const file = await inspectUpload(media);
      const finalKey = `${MEDIA_PREFIXES.public}${media.ownerType}/${media.ownerRef ?? media.ownerId}/${media.purpose}/${media.id}.${EXTENSIONS[file.contentType]}`;
      await storage.copy(media.key, finalKey);
      const { expiresAt: _expires, ...rest } = media;
      const ready: MediaRecord = { ...rest, ...file, status: 'ready', key: finalKey };
      const url = storage.publicUrl(finalKey);

      const linked = await link(ready, url, input.target, 1).catch(async (err: unknown) => {
        // A cópia em public/ não pode sobrar, a menos que outra confirmação já a tenha ligado (MID-07)
        const current = await input.target.readCurrent().catch(() => ready.id);
        if (current !== ready.id) await removeQuietly(finalKey);
        throw err;
      });
      // MID-07: a outra confirmação já ligou esta mídia; o arquivo em public/ é o que está no ar
      if (linked.already) return { url };
      await removeQuietly(media.key);
      if (linked.previous) await removeQuietly(linked.previous.key);
      return { url };
    },

    /** MID-10, MID-11. Sem mídia ligada → nada a fazer. */
    async detach(input: { purpose: MediaPurpose; ownerId: string; target: MediaTarget }): Promise<void> {
      const removed = await unlink(input.target, 1);
      if (removed) await removeQuietly(removed.key);
    },
  };
}
export type MediaService = ReturnType<typeof createMediaService>;

/** A mídia de produção (DynamoDB + S3). */
export const mediaService = createMediaService({ repo: dynamoMediaRepository, storage: s3MediaStorage });
