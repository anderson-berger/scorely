import { authRoute, verifyBearer } from '@scorely/api/src/lib/auth';
import { signJwt } from '@scorely/api/src/lib/jwt';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it } from 'vitest';

const secret = 'x'.repeat(32);
const now = 1_000_000;
const token = signJwt({ sub: 'u1', sid: 's1', iat: now, exp: now + 60 }, secret);

describe('verifyBearer', () => {
  it('aceita um Bearer válido', () => {
    expect(verifyBearer(`Bearer ${token}`, secret, now)).toEqual({ userId: 'u1', sessionId: 's1' });
  });

  it.each([
    ['sem header', undefined],
    ['sem Bearer', token],
    ['outro esquema', `Basic ${token}`],
    ['token adulterado', `Bearer ${token}x`],
  ])('recusa %s', (_case, header) => {
    expect(verifyBearer(header, secret, now)).toBeUndefined();
  });

  it('recusa token expirado', () => {
    expect(verifyBearer(`Bearer ${token}`, secret, now + 60)).toBeUndefined();
  });
});

describe('authRoute', () => {
  const route = (event: APIGatewayProxyEventV2) => authRoute(event, async (auth) => auth);
  const eventWith = (authorizer: unknown) =>
    ({ requestContext: { authorizer } }) as unknown as APIGatewayProxyEventV2;

  it('entrega o contexto do authorizer', async () => {
    const res = await route(eventWith({ lambda: { userId: 'u1', sessionId: 's1' } }));
    expect(res).toMatchObject({ statusCode: 200, body: JSON.stringify({ userId: 'u1', sessionId: 's1' }) });
  });

  it('responde 401 se a rota não tiver authorizer', async () => {
    expect(await route(eventWith(undefined))).toMatchObject({ statusCode: 401 });
  });
});
