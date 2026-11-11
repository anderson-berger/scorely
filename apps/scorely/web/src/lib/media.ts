import { ImageContentTypeSchema, type MediaUpload } from '@scorely/contracts';
import { ApiRequestError } from './http';

interface Size {
  width: number;
  height: number;
}

/**
 * MID-03: o maior recorte central da origem com a proporção do alvo. A saída é sempre o tamanho do alvo
 * (a api confere as dimensões exatas, MID-05), então uma origem menor é ampliada no desenho.
 */
export function coverCrop(src: Size, target: Size): { sx: number; sy: number; sw: number; sh: number } {
  const ratio = target.width / target.height;
  const wide = src.width / src.height > ratio;
  const sw = wide ? Math.round(src.height * ratio) : src.width;
  const sh = wide ? src.height : Math.round(src.width / ratio);
  return { sx: Math.floor((src.width - sw) / 2), sy: Math.floor((src.height - sh) / 2), sw, sh };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * MID-03: decodifica (respeitando a orientação EXIF), recorta no centro, deixa no tamanho final e gera WebP.
 * Navegador que não gera WebP devolve PNG no `toBlob`: aí cai para JPEG.
 */
export async function prepareImage(file: File, target: Size): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { sx, sy, sw, sh } = coverCrop(bitmap, target);
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, target.width, target.height);
  bitmap.close();
  const webp = await toBlob(canvas, 'image/webp', 0.85);
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await toBlob(canvas, 'image/jpeg', 0.85);
  if (!jpeg) throw new Error('Could not encode the image');
  return jpeg;
}

/** Formato do arquivo preparado, como a api espera no pedido de envio (MID-04). */
export function contentTypeOf(blob: Blob) {
  return ImageContentTypeSchema.parse(blob.type);
}

/**
 * MID-04: envia o form do POST assinado direto ao S3 (sem o token da api), com os `fields` antes do arquivo.
 * O S3 recusa (4xx) arquivo grande demais ou de outro tipo: vira `MEDIA_INVALID` com os números da finalidade.
 */
export async function uploadMedia(upload: MediaUpload, blob: Blob): Promise<void> {
  const form = new FormData();
  for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
  form.append('file', blob);
  const res = await fetch(upload.url, { method: 'POST', body: form }).catch(() => {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Storage unreachable');
  });
  if (res.ok) return;
  if (res.status >= 500) {
    throw new ApiRequestError(res.status, 'MEDIA_NOT_UPLOADED', `Storage failed (${res.status})`);
  }
  const { maxBytes, width, height } = upload;
  throw new ApiRequestError(res.status, 'MEDIA_INVALID', `Storage rejected the upload (${res.status})`, {
    maxBytes,
    width,
    height,
  });
}
