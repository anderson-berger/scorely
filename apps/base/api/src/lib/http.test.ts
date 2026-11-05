import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { created, HttpError, HttpResponse, handler, handlers } from './http';

const event = {} as APIGatewayProxyEventV2;
const run = (fn: () => Promise<unknown>) => handler(fn)(event);

describe('handler', () => {
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

describe('handlers', () => {
  it('envelopa cada método com o handler', async () => {
    const { a, b } = handlers({
      async a() {
        return { from: 'a' };
      },
      async b() {},
    });
    expect(await a(event)).toMatchObject({ statusCode: 200, body: '{"from":"a"}' });
    expect(await b(event)).toEqual({ statusCode: 204 });
  });
});
