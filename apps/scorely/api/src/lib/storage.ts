import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import type { ImageContentType } from '@scorely/contracts';
import { imageSize } from 'image-size';
import { env } from './env';
import { lazy } from './fn';

/**
 * Prefixos do bucket (MID-12, MID-13). Mesma convenção de `infra/shared/uploads-bucket.ts`, que monta a
 * política pública e a limpeza do `tmp/` (check: `checks/uploads.test.ts`).
 */
export const MEDIA_PREFIXES = { public: 'public/', tmp: 'tmp/' } as const;

/** O arquivo como ele é de verdade (MID-05): peso pelo S3, formato e dimensões pelos bytes. */
export interface InspectedFile {
  size: number;
  /** Formato real, lido dos bytes; `undefined` = não é um formato aceito. */
  format?: ImageContentType | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

/** O que a mídia usa do S3 (docs/modules/midia.md). Nos testes entra um storage em memória. */
export interface MediaStorage {
  /** POST assinado: policy com content-length-range [1, maxBytes], Content-Type exato e a key. */
  presignUpload(
    key: string,
    contentType: ImageContentType,
    maxBytes: number,
  ): Promise<{ url: string; fields: Record<string, string> }>;
  /** `undefined` = o arquivo não existe (MID-05). */
  inspect(key: string): Promise<InspectedFile | undefined>;
  copy(fromKey: string, toKey: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** URL pública do objeto. */
  publicUrl(key: string): string;
}

/**
 * Base pública do bucket, sem barra no fim.
 * Com `publicEndpoint` (dev local): path style, `<publicEndpoint>/<bucket>`.
 * Sem: `https://<bucket>.s3.<region>.amazonaws.com`.
 */
export function publicBaseUrl(cfg: {
  bucket: string;
  region: string;
  publicEndpoint?: string | undefined;
}): string {
  return cfg.publicEndpoint
    ? `${cfg.publicEndpoint.replace(/\/+$/, '')}/${cfg.bucket}`
    : `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
}

const PRESIGN_EXPIRES_SECONDS = 5 * 60;

/** Bytes lidos do começo do arquivo: o cabeçalho de PNG, JPEG e WebP cabe aqui (o SOF do JPEG vem depois do EXIF). */
const HEADER_BYTES = 128 * 1024;

const FORMATS: Record<string, ImageContentType> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** Formato e dimensões pelo cabeçalho. Bytes que não são PNG, JPEG ou WebP → só o peso. */
export function readImageHeader(bytes: Uint8Array): Omit<InspectedFile, 'size'> {
  try {
    const { type, width, height } = imageSize(bytes);
    const format = type ? FORMATS[type] : undefined;
    return format ? { format, width, height } : {};
  } catch {
    return {};
  }
}

function s3Client(endpoint: string | undefined): S3Client {
  const { AWS_REGION } = env();
  return new S3Client({
    region: AWS_REGION,
    ...(endpoint && {
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    }),
  });
}

/** Cliente das operações da api (endpoint interno no dev local). */
const client = lazy(() => s3Client(env().S3_ENDPOINT));
/**
 * Cliente só para assinar: a URL assinada tem o host que o navegador alcança. Na AWS os dois
 * coincidem; no dev local a api fala com `http://s3:9090` e o navegador com `http://localhost:9090`.
 */
const signer = lazy(() => s3Client(env().S3_PUBLIC_ENDPOINT ?? env().S3_ENDPOINT));

const base = lazy(() => {
  const { UPLOADS_BUCKET, AWS_REGION, S3_PUBLIC_ENDPOINT } = env();
  return publicBaseUrl({ bucket: UPLOADS_BUCKET, region: AWS_REGION, publicEndpoint: S3_PUBLIC_ENDPOINT });
});

function isNotFound(err: unknown) {
  const name = (err as { name?: string }).name;
  return err instanceof NotFound || name === 'NotFound' || name === 'NoSuchKey';
}

async function headSize(key: string): Promise<number | undefined> {
  try {
    const out = await client().send(new HeadObjectCommand({ Bucket: env().UPLOADS_BUCKET, Key: key }));
    return out.ContentLength ?? 0;
  } catch (err) {
    if (isNotFound(err)) return undefined;
    throw err;
  }
}

async function readHead(key: string): Promise<Uint8Array> {
  const out = await client().send(
    new GetObjectCommand({ Bucket: env().UPLOADS_BUCKET, Key: key, Range: `bytes=0-${HEADER_BYTES - 1}` }),
  );
  return out.Body ? out.Body.transformToByteArray() : new Uint8Array();
}

export const s3MediaStorage: MediaStorage = {
  async presignUpload(key, contentType, maxBytes) {
    return createPresignedPost(signer(), {
      Bucket: env().UPLOADS_BUCKET,
      Key: key,
      Conditions: [
        ['content-length-range', 1, maxBytes],
        ['eq', '$Content-Type', contentType],
      ],
      Fields: { 'Content-Type': contentType },
      Expires: PRESIGN_EXPIRES_SECONDS,
    });
  },

  async inspect(key) {
    const size = await headSize(key);
    if (size === undefined) return undefined;
    return { size, ...readImageHeader(await readHead(key)) };
  },

  async copy(fromKey, toKey) {
    const bucket = env().UPLOADS_BUCKET;
    await client().send(
      new CopyObjectCommand({ Bucket: bucket, Key: toKey, CopySource: `${bucket}/${fromKey}` }),
    );
  },

  async remove(key) {
    await client().send(new DeleteObjectCommand({ Bucket: env().UPLOADS_BUCKET, Key: key }));
  },

  publicUrl(key) {
    return `${base()}/${key}`;
  },
};
