import { parseBody, route } from '@scorely/api/src/lib/http';
import { createUserService } from '@scorely/api/src/modules/users/user.service';
import { memoryUsers } from '@scorely/api/src/modules/users/users.memory';
import { PublicUserIdSchema, TimeZoneSchema, UpdateMeInputSchema } from '@scorely/contracts';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it } from 'vitest';

const EMAIL = 'ana@example.com';
const PUBLIC_ID = PublicUserIdSchema.parse('7K3QX9TA');
async function withUser() {
  const clock = { now: new Date('2026-11-06T12:00:00.000Z') };
  const memory = memoryUsers();
  const service = createUserService(
    memory.repo,
    () => clock.now,
    undefined,
    () => PUBLIC_ID,
  );
  const { userId } = await service.findOrCreateByEmail(EMAIL);
  /** Mesmo caminho do `PATCH /me`: parse do body com o schema do contrato → `update`. */
  /** A tela manda a `version` do perfil que mostrou (USR-18); o teste completa com a atual. */
  const patchMe = (body: unknown) => {
    const version = memory.profiles.get(userId)?.version ?? 0;
    const withVersion =
      body && typeof body === 'object' && !Array.isArray(body) ? { version, ...body } : body;
    const event = {
      body: JSON.stringify(withVersion),
    } as APIGatewayProxyEventV2;
    return route(event, async () => service.update(userId, parseBody(event, UpdateMeInputSchema)));
  };
  return { service, userId, memory, writes: memory.writes, patchMe };
}

const bodyOf = (res: unknown) => JSON.parse((res as { body: string }).body);

describe('perfil: idioma e fuso nas preferências', () => {
  it('USR-14: PATCH /me { preferences: { locale, timeZone } } → 200 com as preferências; GET /me devolve as mesmas', async () => {
    const t = await withUser();
    const res = await t.patchMe({
      preferences: { locale: 'en', timeZone: 'Europe/Lisbon' },
    });
    expect(res).toMatchObject({ statusCode: 200 });
    const body = bodyOf(res);
    expect(body).toMatchObject({ id: PUBLIC_ID, private: { email: EMAIL } });
    expect(body).not.toHaveProperty('email');
    expect(body.preferences).toEqual({
      locale: 'en',
      timeZone: 'Europe/Lisbon',
    });
    expect(body).not.toHaveProperty('locale');
    expect(body).not.toHaveProperty('timeZone');
    expect((await t.service.get(t.userId)).preferences).toEqual({
      locale: 'en',
      timeZone: 'Europe/Lisbon',
    });
  });

  it('USR-14: idioma e fuso são gravados nas preferências, nunca no perfil', async () => {
    const t = await withUser();
    await t.patchMe({
      preferences: { locale: 'en', timeZone: 'Europe/Lisbon' },
    });
    expect(t.memory.profiles.get(t.userId)).not.toHaveProperty('locale');
    expect(t.memory.profiles.get(t.userId)).not.toHaveProperty('timeZone');
    expect(t.memory.prefs.get(t.userId)).toEqual({
      locale: 'en',
      timeZone: 'Europe/Lisbon',
    });
  });

  it('USR-03: PATCH /me misto → apelido no perfil, nome na parte privada (USR-13), idioma nas preferências', async () => {
    const t = await withUser();
    const res = await t.patchMe({
      private: { name: 'Ana Souza' },
      nickname: 'Aninha',
      preferences: { locale: 'en' },
    });
    expect(res).toMatchObject({ statusCode: 200 });
    expect(bodyOf(res)).toMatchObject({
      private: { name: 'Ana Souza' },
      nickname: 'Aninha',
      preferences: { locale: 'en' },
    });
    expect(t.memory.profiles.get(t.userId)).toMatchObject({
      nickname: 'Aninha',
    });
    expect(t.memory.profiles.get(t.userId)).not.toHaveProperty('name');
    expect(t.memory.privates.get(t.userId)).toEqual({
      email: EMAIL,
      name: 'Ana Souza',
    });
    expect(t.memory.prefs.get(t.userId)).toEqual({ locale: 'en' });
  });

  it('USR-03: PATCH /me só do perfil não mexe nas preferências', async () => {
    const t = await withUser();
    await t.patchMe({ preferences: { locale: 'en', timeZone: 'Asia/Tokyo' } });
    const res = await t.patchMe({ private: { name: 'Ana' } });
    expect(bodyOf(res).preferences).toEqual({
      locale: 'en',
      timeZone: 'Asia/Tokyo',
    });
  });

  it('USR-03: PATCH /me só do idioma não mexe no perfil', async () => {
    const t = await withUser();
    await t.patchMe({
      private: { name: 'Ana' },
      nickname: 'Aninha',
      gender: 'F',
    });
    const res = await t.patchMe({ preferences: { locale: 'en' } });
    expect(bodyOf(res)).toMatchObject({
      private: { name: 'Ana' },
      nickname: 'Aninha',
      gender: 'F',
    });
  });

  it('USR-03: apelido null → 422 VALIDATION_ERROR, nada gravado e o apelido continua', async () => {
    const t = await withUser();
    await t.patchMe({ nickname: 'Aninha' });
    const before = t.writes.count;
    const res = await t.patchMe({ nickname: null });
    expect(res).toMatchObject({ statusCode: 422 });
    const { error } = bodyOf(res);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.issues[0]).toMatchObject({ path: ['nickname'] });
    expect(t.writes.count).toBe(before);
    expect((await t.service.get(t.userId)).nickname).toBe('Aninha');
  });

  it('USR-03: apelido vazio (só espaços) → 422 VALIDATION_ERROR e o apelido continua o código (USR-02)', async () => {
    const t = await withUser();
    const res = await t.patchMe({ nickname: '   ' });
    expect(res).toMatchObject({ statusCode: 422 });
    expect(bodyOf(res).error.code).toBe('VALIDATION_ERROR');
    expect(t.writes.count).toBe(0);
    expect((await t.service.get(t.userId)).nickname).toBe(PUBLIC_ID);
  });

  it('USR-03: apelido com 40 caracteres passa; com 41 → 422 VALIDATION_ERROR', async () => {
    const t = await withUser();
    expect(await t.patchMe({ nickname: 'a'.repeat(40) })).toMatchObject({
      statusCode: 200,
    });
    expect(await t.patchMe({ nickname: 'a'.repeat(41) })).toMatchObject({
      statusCode: 422,
    });
  });

  it('USR-05: PATCH /me { timeZone: Mars/Olympus } → 422 VALIDATION_ERROR e nada gravado', async () => {
    const t = await withUser();
    const res = await t.patchMe({ preferences: { timeZone: 'Mars/Olympus' } });
    expect(res).toMatchObject({ statusCode: 422 });
    const { error } = bodyOf(res);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.issues[0]).toMatchObject({
      code: 'custom',
      path: ['preferences', 'timeZone'],
    });
    expect(t.writes.count).toBe(0);
    expect((await t.service.get(t.userId)).preferences.timeZone).toBeUndefined();
  });

  it('USR-03: PATCH /me { locale: es } → 422 VALIDATION_ERROR', async () => {
    const t = await withUser();
    const res = await t.patchMe({ preferences: { locale: 'es' } });
    expect(res).toMatchObject({ statusCode: 422 });
    const { error } = bodyOf(res);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.issues[0]).toMatchObject({
      code: 'invalid_value',
      path: ['preferences', 'locale'],
    });
    expect(t.writes.count).toBe(0);
  });

  it('USR-03: PATCH /me só do fuso grava nas preferências, soma 1 na version e não mexe no resto', async () => {
    const t = await withUser();
    const before = t.memory.profiles.get(t.userId)?.version ?? 0;
    const res = await t.patchMe({
      preferences: { timeZone: 'America/Manaus' },
    });
    expect(res).toMatchObject({ statusCode: 200 });
    expect(bodyOf(res)).toMatchObject({
      version: before + 1,
      preferences: { timeZone: 'America/Manaus' },
    });
    expect(t.memory.prefs.get(t.userId)).toEqual({
      timeZone: 'America/Manaus',
    });
    expect(t.memory.privates.get(t.userId)).toEqual({ email: EMAIL });
  });

  it('USR-03: PATCH /me só com grupo vazio (`preferences: {}`) → 422 VALIDATION_ERROR e nada gravado', async () => {
    const t = await withUser();
    const res = await t.patchMe({ preferences: {} });
    expect(res).toMatchObject({ statusCode: 422 });
    expect(bodyOf(res).error.code).toBe('VALIDATION_ERROR');
    expect(t.writes.count).toBe(0);
  });

  it('USR-05: TimeZoneSchema.parse(Brazil/East) → nome canônico America/Sao_Paulo', () => {
    expect(TimeZoneSchema.parse('Brazil/East')).toBe('America/Sao_Paulo');
  });

  it('USR-05: PATCH /me grava o fuso das preferências no nome canônico', async () => {
    const t = await withUser();
    await t.patchMe({ preferences: { timeZone: 'Brazil/East' } });
    expect((await t.service.get(t.userId)).preferences.timeZone).toBe('America/Sao_Paulo');
  });
});
