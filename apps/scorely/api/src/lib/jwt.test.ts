import { signJwt, verifyJwt } from '@scorely/api/src/lib/jwt';
import { describe, expect, it } from 'vitest';

const SECRET = 'test-secret-with-at-least-32-characters!!';
const claims = { sub: 'user-1', sid: 'session-1', iat: 1_000, exp: 2_000 };

describe('jwt', () => {
  it('valida um token assinado com o mesmo segredo', () => {
    expect(verifyJwt(signJwt(claims, SECRET), SECRET, 1_500)).toEqual(claims);
  });

  it('rejeita token expirado', () => {
    expect(verifyJwt(signJwt(claims, SECRET), SECRET, 2_000)).toBeUndefined();
  });

  it('rejeita outro segredo', () => {
    expect(verifyJwt(signJwt(claims, SECRET), `${SECRET}x`, 1_500)).toBeUndefined();
  });

  it('rejeita payload adulterado', () => {
    const [header, , signature] = signJwt(claims, SECRET).split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: 'admin' })).toString('base64url');
    expect(verifyJwt(`${header}.${forged}.${signature}`, SECRET, 1_500)).toBeUndefined();
  });

  it('rejeita header com outro algoritmo', () => {
    const [, payload, signature] = signJwt(claims, SECRET).split('.');
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    expect(verifyJwt(`${none}.${payload}.${signature}`, SECRET, 1_500)).toBeUndefined();
  });

  it('rejeita lixo', () => {
    expect(verifyJwt('abc', SECRET, 1_500)).toBeUndefined();
    expect(verifyJwt('a.b.c.d', SECRET, 1_500)).toBeUndefined();
  });
});
