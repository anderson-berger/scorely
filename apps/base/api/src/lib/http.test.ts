import { created, HttpError, HttpResponse, route } from '@base/api/src/lib/http';
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

  it('HttpError → status e corpo { error }', async () => {
    const res = await run(async () => {
      throw new HttpError(409, 'CONFLICT', 'Já existe');
    });
    expect(res).toMatchObject({
      statusCode: 409,
      body: '{"error":{"code":"CONFLICT","message":"Já existe"}}',
    });
  });

  it('ZodError → 422', async () => {
    expect(await run(async () => z.string().parse(1))).toMatchObject({ statusCode: 422 });
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
  });
});
