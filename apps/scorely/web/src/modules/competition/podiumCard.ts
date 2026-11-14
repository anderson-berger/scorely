/**
 * CMP-40: o card do pódio para compartilhar, montado no aparelho (um `<canvas>` 1080 × 1350, no visual do app). O texto
 * já vem traduzido de quem chama. Fora do navegador (testes), não é usado.
 */
export interface PodiumCardText {
  group: string;
  season: string;
  lines: string[];
}

const W = 1080;
const H = 1350;

/** Desenha o card e devolve a imagem PNG. */
export async function podiumCardImage(text: PodiumCardText): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  const css = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;

  ctx.fillStyle = color('--sc-bg', '#0b0f14');
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = color('--sc-accent', '#f5c518');
  ctx.font = '700 96px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏆', W / 2, 220);
  ctx.font = '700 72px sans-serif';
  ctx.fillText(text.season, W / 2, 360, W - 120);
  ctx.fillStyle = color('--sc-text', '#ffffff');
  ctx.font = '400 44px sans-serif';
  ctx.fillText(text.group, W / 2, 440, W - 120);
  ctx.font = '600 54px sans-serif';
  text.lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, 620 + i * 110, W - 120);
  });
  ctx.fillStyle = color('--sc-muted', '#8a94a6');
  ctx.font = '400 36px sans-serif';
  ctx.fillText('scorely', W / 2, H - 80);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))), 'image/png');
  });
}

/**
 * CMP-40: compartilha a imagem pelo sistema (WhatsApp, Instagram...) quando o navegador deixa. Senão, baixa a imagem
 * e copia o texto. Devolve o que fez.
 */
export async function sharePodium(
  image: Blob,
  fileName: string,
  text: string,
): Promise<'shared' | 'downloaded' | 'downloadedOnly'> {
  const file = new File([image], fileName, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], text });
    return 'shared';
  }
  const url = URL.createObjectURL(image);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  try {
    await navigator.clipboard.writeText(text);
    return 'downloaded';
  } catch {
    // Sem permissão de copiar: a imagem baixada já basta, e a mensagem não diz que copiou.
    return 'downloadedOnly';
  }
}
