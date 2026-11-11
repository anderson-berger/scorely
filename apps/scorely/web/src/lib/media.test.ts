import type { MediaUpload } from '@scorely/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { coverCrop, uploadMedia } from './media';

// MID-03 (docs/modules/midia.md): o navegador recorta no centro e deixa no tamanho final da finalidade.
// O `prepareImage` (canvas e WebP/JPEG) depende do navegador e fica no roteiro manual.

const SQUARE = { width: 512, height: 512 };
const COVER = { width: 1600, height: 600 };

describe('coverCrop (MID-03)', () => {
  it('MID-03: paisagem 4000×3000 para 512×512 → quadrado central 3000×3000 em x=500', () => {
    expect(coverCrop({ width: 4000, height: 3000 }, SQUARE)).toEqual({ sx: 500, sy: 0, sw: 3000, sh: 3000 });
  });

  it('MID-03: retrato 1080×1920 para 512×512 → 1080×1080 em y=420', () => {
    expect(coverCrop({ width: 1080, height: 1920 }, SQUARE)).toEqual({ sx: 0, sy: 420, sw: 1080, sh: 1080 });
  });

  it('MID-03: 4000×3000 para a capa 1600×600 → faixa central 4000×1500 em y=750', () => {
    expect(coverCrop({ width: 4000, height: 3000 }, COVER)).toEqual({ sx: 0, sy: 750, sw: 4000, sh: 1500 });
  });

  it('MID-03: panorâmica 3200×600 para a capa 1600×600 → 1600×600 central em x=800', () => {
    expect(coverCrop({ width: 3200, height: 600 }, COVER)).toEqual({ sx: 800, sy: 0, sw: 1600, sh: 600 });
  });

  it('MID-03: imagem menor que o alvo → recorte central na proporção do alvo (a ampliação fica no desenho)', () => {
    expect(coverCrop({ width: 300, height: 200 }, SQUARE)).toEqual({ sx: 50, sy: 0, sw: 200, sh: 200 });
  });

  it('MID-03: já no tamanho final → a imagem inteira', () => {
    expect(coverCrop({ width: 1600, height: 600 }, COVER)).toEqual({ sx: 0, sy: 0, sw: 1600, sh: 600 });
  });
});

const UPLOAD: MediaUpload = {
  mediaId: '11111111-1111-4111-8111-111111111111',
  url: 'https://uploads.test/',
  fields: { key: 'tmp/11111111-1111-4111-8111-111111111111', 'Content-Type': 'image/webp', Policy: 'p' },
  maxBytes: 2 * 1024 * 1024,
  width: 1600,
  height: 600,
};

const respond = (status: number) => vi.fn(async () => new Response(null, { status }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadMedia (envio direto ao S3, MID-04/MID-05)', () => {
  it('MID-04: envia o form para a url assinada, com os `fields` antes do arquivo', async () => {
    const fetchMock = respond(204);
    vi.stubGlobal('fetch', fetchMock);
    await uploadMedia(UPLOAD, new Blob(['x'], { type: 'image/webp' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(UPLOAD.url);
    expect(init.method).toBe('POST');
    const names = [...(init.body as FormData).keys()];
    expect(names).toEqual([...Object.keys(UPLOAD.fields), 'file']);
  });

  it('MID-05: o S3 recusa (4xx) → MEDIA_INVALID com os números da finalidade', async () => {
    vi.stubGlobal('fetch', respond(400));
    const err = await uploadMedia(UPLOAD, new Blob(['x'])).catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: 'MEDIA_INVALID',
      details: { maxBytes: UPLOAD.maxBytes, width: 1600, height: 600 },
    });
  });

  it('MID-05: o S3 falha (5xx) → MEDIA_NOT_UPLOADED', async () => {
    vi.stubGlobal('fetch', respond(503));
    const err = await uploadMedia(UPLOAD, new Blob(['x'])).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'MEDIA_NOT_UPLOADED' });
  });
});
