import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Token aleatório url-safe (32 bytes = 256 bits por padrão). */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

/** Código numérico de 6 dígitos, uniforme. */
export function randomCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * HMAC-SHA256 com separação por finalidade: o mesmo segredo nunca gera o mesmo hash
 * para usos diferentes (código de login, refresh token, JWT...).
 */
export function hmac(secret: string, purpose: string, value: string) {
  return createHmac('sha256', secret).update(`${purpose}\0${value}`).digest('base64url');
}

/** Comparação em tempo constante. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
