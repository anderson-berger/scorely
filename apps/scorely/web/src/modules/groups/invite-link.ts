/** GRV-18: o link do convite, para copiar e compartilhar. */
export function inviteUrl(token: string): string {
  return `${window.location.origin}/join/${encodeURIComponent(token)}`;
}

/** GRV-33: o compartilhar do celular, quando o navegador tem. */
export function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}
