/**
 * Um uuid v4 em minúsculas. O `crypto.randomUUID` só existe em contexto seguro (https ou localhost); aberto por um IP
 * sem https, ele falta, e o id sai do `crypto.getRandomValues`, que existe em qualquer contexto. Lê o `crypto` a cada
 * chamada.
 */
export function uuid(): string {
  const { crypto } = globalThis;
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // Versão 4 no byte 6 e variante 10xx no byte 8 (RFC 9562).
  const fixed = bytes.map((b, i) => (i === 6 ? (b & 0x0f) | 0x40 : i === 8 ? (b & 0x3f) | 0x80 : b));
  const hex = Array.from(fixed, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
