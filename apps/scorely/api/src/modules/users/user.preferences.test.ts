import { TimeZoneSchema, UpdateMeInputSchema, type User } from '@scorely/contracts';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { handler, parseBody } from '../../lib/http';
import type { UserRepository } from './user.repository';
import { createUserService } from './user.service';

const EMAIL = 'ana@example.com';

/** Repositório em memória; `writes` conta as gravações (para conferir "nada gravado"). */
function memoryUserRepo() {
  const users = new Map<string, User>();
  const writes = { count: 0 };
  const repo: UserRepository = {
    get: async (id) => structuredClone(users.get(id)),
    getByEmail: async (email) => structuredClone([...users.values()].find((u) => u.email === email)),
    async create(user) {
      if ([...users.values()].some((u) => u.email === user.email)) return false;
      users.set(user.id, structuredClone(user));
      return true;
    },
    async update(id, patch) {
      const user = users.get(id);
      if (!user) return undefined;
      writes.count += 1;
      Object.assign(user, patch);
      return structuredClone(user);
    },
  };
  return { repo, writes };
}

async function withUser() {
  const clock = { now: new Date('2026-11-06T12:00:00.000Z') };
  const memory = memoryUserRepo();
  const service = createUserService(memory.repo, () => clock.now);
  const { user } = await service.findOrCreateByEmail(EMAIL);
  /** Mesmo caminho do `PATCH /me`: parse do body com o schema do contrato → `update`. */
  const patchMe = (body: unknown) =>
    handler(async (event) => service.update(user.id, parseBody(event, UpdateMeInputSchema)))({
      body: JSON.stringify(body),
    } as APIGatewayProxyEventV2);
  return { service, user, writes: memory.writes, patchMe };
}

const bodyOf = (res: unknown) => JSON.parse((res as { body: string }).body);

describe('perfil: idioma e fuso', () => {
  it('caso 1: PATCH /me { locale, timeZone } → 200 com os 2 campos; GET /me devolve os mesmos', async () => {
    const t = await withUser();
    const res = await t.patchMe({ locale: 'en', timeZone: 'Europe/Lisbon' });
    expect(res).toMatchObject({ statusCode: 200 });
    expect(bodyOf(res)).toMatchObject({ locale: 'en', timeZone: 'Europe/Lisbon' });
    expect(await t.service.get(t.user.id)).toMatchObject({ locale: 'en', timeZone: 'Europe/Lisbon' });
  });

  it('caso 2: PATCH /me { timeZone: Mars/Olympus } → 422 VALIDATION_ERROR e nada gravado', async () => {
    const t = await withUser();
    const res = await t.patchMe({ timeZone: 'Mars/Olympus' });
    expect(res).toMatchObject({ statusCode: 422 });
    const { error } = bodyOf(res);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.issues[0]).toMatchObject({ code: 'custom', path: ['timeZone'] });
    expect(t.writes.count).toBe(0);
    expect((await t.service.get(t.user.id)).timeZone).toBeUndefined();
  });

  it('caso 3: PATCH /me { locale: es } → 422 VALIDATION_ERROR', async () => {
    const t = await withUser();
    const res = await t.patchMe({ locale: 'es' });
    expect(res).toMatchObject({ statusCode: 422 });
    const { error } = bodyOf(res);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.issues[0]).toMatchObject({ code: 'invalid_value', path: ['locale'] });
    expect(t.writes.count).toBe(0);
  });

  it('caso 4: TimeZoneSchema.parse(Brazil/East) → nome canônico America/Sao_Paulo', () => {
    expect(TimeZoneSchema.parse('Brazil/East')).toBe('America/Sao_Paulo');
  });

  it('caso 4: PATCH /me grava o fuso no nome canônico', async () => {
    const t = await withUser();
    await t.patchMe({ timeZone: 'Brazil/East' });
    expect((await t.service.get(t.user.id)).timeZone).toBe('America/Sao_Paulo');
  });
});
