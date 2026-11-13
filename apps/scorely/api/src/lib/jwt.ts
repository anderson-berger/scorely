import { hmac, safeEqual } from '@scorely/api/src/lib/crypto';

/** Claims do access token. `sid` é a sessão (refresh token) que emitiu o token. */
export interface AccessClaims {
  sub: string;
  sid: string;
  iat: number;
  exp: number;
}

const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const sign = (data: string, secret: string) => hmac(secret, 'jwt', data);

/** JWT HS256 mínimo (só o que a api precisa: assinar e validar os próprios tokens). */
export function signJwt(claims: AccessClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const data = `${HEADER}.${payload}`;
  return `${data}.${sign(data, secret)}`;
}

/** Devolve as claims se a assinatura e a validade baterem; senão `undefined`. */
export function verifyJwt(token: string, secret: string, nowSeconds: number): AccessClaims | undefined {
  const [header, payload, signature, ...rest] = token.split('.');
  if (!header || !payload || !signature || rest.length > 0) return undefined;
  if (header !== HEADER) return undefined;
  if (!safeEqual(signature, sign(`${header}.${payload}`, secret))) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<AccessClaims>;
    if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string') return undefined;
    if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) return undefined;
    return claims as AccessClaims;
  } catch {
    return undefined;
  }
}
