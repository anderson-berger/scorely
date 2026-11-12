import { appError } from '@scorely/api/src/lib/errors';
import { created, HttpResponse, route } from '@scorely/api/src/lib/http';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const event = {} as APIGatewayProxyEventV2;
const run = (fn: () => Promise<unknown>) => route(event, fn);

describe('route', () => {
  it('dados → 200 com JSON', async () => {
    expect(await run(async () => ({ ok: true }))).toEqual({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
    });
  });

  it('nada → 204 sem corpo', async () => {
    expect(await run(async () => undefined)).toEqual({ statusCode: 204 });
  });

  it('created → 201', async () => {
    expect(await run(async () => created({ id: '1' }))).toMatchObject({
      statusCode: 201,
      body: '{"id":"1"}',
    });
  });

  it('HttpResponse sem corpo → só o status', async () => {
    expect(await run(async () => new HttpResponse(202))).toEqual({ statusCode: 202 });
  });

  it('appError → status do catálogo e corpo { error }', async () => {
    const res = await run(async () => {
      throw appError('USER_CREATE_CONFLICT');
    });
    expect(res).toMatchObject({
      statusCode: 409,
      body: '{"error":{"code":"USER_CREATE_CONFLICT","message":"Could not create the user due to a concurrent request; retry"}}',
    });
  });

  it('appError com details → details no corpo', async () => {
    const res = await run(async () => {
      throw appError('AUTH_CODE_COOLDOWN', { retryInSeconds: 42 });
    });
    expect(JSON.parse((res as { body: string }).body)).toEqual({
      error: {
        code: 'AUTH_CODE_COOLDOWN',
        message: 'Wait before requesting another login code',
        details: { retryInSeconds: 42 },
      },
    });
  });

  it('ZodError → 422 VALIDATION_ERROR com as issues', async () => {
    const res = await run(async () => z.object({ name: z.string() }).parse({ name: 1 }));
    expect(res).toMatchObject({ statusCode: 422 });
    const { error } = JSON.parse((res as { body: string }).body);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.issues[0]).toMatchObject({ code: 'invalid_type', path: ['name'] });
  });

  it('erro inesperado → 500 sem vazar a mensagem', async () => {
    const spy = console.error;
    console.error = () => {};
    const res = await run(async () => {
      throw new Error('segredo interno');
    });
    console.error = spy;
    expect(res).toMatchObject({ statusCode: 500 });
    expect(JSON.stringify(res)).not.toContain('segredo interno');
    expect(JSON.parse((res as { body: string }).body).error.code).toBe('INTERNAL_ERROR');
  });
});
