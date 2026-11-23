// Como o grupo aparece sem imagem (GRV-11): a cor fixa do id público e as iniciais do nome.

/** Cor fixa do grupo (1–6) a partir do id público, no lugar do logo e da capa que faltam (GRV-11). */
export function groupColor(id: string): 1 | 2 | 3 | 4 | 5 | 6 {
  const hash = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return ((hash % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
}

/** Iniciais da primeira e da última palavra, em maiúscula; "?" sem nome (GRV-11). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? '') : '';
  return (first + last).toUpperCase();
}
