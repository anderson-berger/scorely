import { parseBody, route } from '@scorely/api/src/lib/http';
import type { UserId } from '@scorely/api/src/lib/ids';
import type { MeRecord, UserRecord, UserRepository } from '@scorely/api/src/modules/users/user.repository';
import { createUserService } from '@scorely/api/src/modules/users/user.service';
import {
  type Preferences,
  type PublicUserId,
  PublicUserIdSchema,
  TimeZoneSchema,
  type UpdateMeInput,
  UpdateMeInputSchema,
} from '@scorely/contracts';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it } from 'vitest';

const EMAIL = 'ana@example.com';
const PUBLIC_ID = PublicUserIdSchema.parse('7K3QX9TA');
type ReadOpts = { consistent?: boolean };

/**
 * Repositório em memória com as três partes da pessoa (usuarios.md, seção 3): perfil, email e preferências.
 * `null` no patch remove o atributo; `writes` conta as gravações (para conferir "nada gravado").
 */
function memoryUserRepo() {
  const profiles = new Map<UserId, UserRecord>();
  const emails = new Map<UserId, string>();
  const prefs = new Map<UserId, Preferences>();
  const writes = { count: 0 };
  const me = (id: UserId): MeRecord | undefined => {
    const profile = profiles.get(id);
    const email = emails.get(id);
    if (!profile || email === undefined) return undefined;
    return structuredClone({ ...profile, email, preferences: prefs.get(id) ?? {} });
  };
  const idOf = (email: string) => [...emails.entries()].find(([, e]) => e === email)?.[0];
  const assign = (target: Record<string, unknown>, patch: Record<string, unknown>) =>
    Object.entries(patch).forEach(([k, v]) => {
      if (v === null) delete target[k];
      else if (v !== undefined) target[k] = v;
    });
  const repo: UserRepository = {
    get: async (id: UserId, _opts?: ReadOpts) => structuredClone(profiles.get(id)),
    getMe: async (id: UserId, _opts?: ReadOpts) => me(id),
    getByEmail: async (email: string, _opts?: ReadOpts) => {
      const id = idOf(email);
      return id === undefined ? undefined : me(id);
    },
    getPreferences: async (id: UserId): Promise<Preferences> => structuredClone(prefs.get(id) ?? {}),
    async create(user: UserRecord, email: string) {
      if (idOf(email) !== undefined) return 'email_taken';
      profiles.set(user.id, structuredClone(user));
      emails.set(user.id, email);
      prefs.set(user.id, {});
      return 'created';
    },
    async update(id: UserId, patch: UpdateMeInput) {
      const profile = profiles.get(id);
      const preferences = prefs.get(id);
      if (!profile || !preferences) return undefined;
      writes.count += 1;
      const { locale, timeZone, ...rest } = patch;
      assign(preferences, { locale, timeZone });
      assign(profile, rest);
      return me(id);
    },
    resolve: async (codes: readonly PublicUserId[]) =>
      new Map(
        [...profiles.values()]
          .filter((u) => codes.includes(u.publicId))
          .map((u) => [u.publicId, u.id] as const),
      ),
  };
  return { repo, writes, profiles, prefs };
}

async function withUser() {
  const clock = { now: new Date('2026-11-06T12:00:00.000Z') };
  const memory = memoryUserRepo();
  const service = createUserService(
    memory.repo,
    () => clock.now,
    undefined,
    () => PUBLIC_ID,
  );
  const { userId } = await service.findOrCreateByEmail(EMAIL);
  /** Mesmo caminho do `PATCH /me`: parse do body com o schema do contrato → `update`. */
  const patchMe = (body: unknown) => {
    const event = { body: JSON.stringify(body) } as APIGatewayProxyEventV2;
    return route(event, async () => service.update(userId, parseBody(event, UpdateMeInputSchema)));
  };
  return { service, userId, memory, writes: memory.writes, patchMe };
}

const bodyOf = (res: unknown) => JSON.parse((res as { body: string }).body);

describe('perfil: idioma e fuso nas preferências', () => {
  it('USR-14: PATCH /me { locale, timeZone } → 200 com as preferências; GET /me devolve as mesmas', async () => {
    const t = await withUser();
    const res = await t.patchMe({ locale: 'en', timeZone: 'Europe/Lisbon' });
    expect(res).toMatchObject({ statusCode: 200 });
    const body = bodyOf(res);
    expect(body).toMatchObject({ id: PUBLIC_ID, email: EMAIL });
    expect(body.preferences).toEqual({ locale: 'en', timeZone: 'Europe/Lisbon' });
    expect(body).not.toHaveProperty('locale');
    expect(body).not.toHaveProperty('timeZone');
    expect((await t.service.get(t.userId)).preferences).toEqual({ locale: 'en', timeZone: 'Europe/Lisbon' });
  });

  it('USR-14: idioma e fuso são gravados nas preferências, nunca no perfil', async () => {
    const t = await withUser();
    await t.patchMe({ locale: 'en', timeZone: 'Europe/Lisbon' });
    expect(t.memory.profiles.get(t.userId)).not.toHaveProperty('locale');
    expect(t.memory.profiles.get(t.userId)).not.toHaveProperty('timeZone');
    expect(t.memory.prefs.get(t.userId)).toEqual({ locale: 'en', timeZone: 'Europe/Lisbon' });
  });

  it('USR-03: PATCH /me misto → nome e apelido no perfil, idioma nas preferências', async () => {
    const t = await withUser();
    const res = await t.patchMe({ name: 'Ana Souza', nickname: 'Aninha', locale: 'en' });
    expect(res).toMatchObject({ statusCode: 200 });
    expect(bodyOf(res)).toMatchObject({
      name: 'Ana Souza',
      nickname: 'Aninha',
      preferences: { locale: 'en' },
    });
    expect(t.memory.profiles.get(t.userId)).toMatchObject({ name: 'Ana Souza', nickname: 'Aninha' });
    expect(t.memory.prefs.get(t.userId)).toEqual({ locale: 'en' });
  });

  it('USR-03: PATCH /me só do perfil não mexe nas preferências', async () => {
    const t = await withUser();
    await t.patchMe({ locale: 'en', timeZone: 'Asia/Tokyo' });
    const res = await t.patchMe({ name: 'Ana' });
    expect(bodyOf(res).preferences).toEqual({ locale: 'en', timeZone: 'Asia/Tokyo' });
  });

  it('USR-03: PATCH /me só do idioma não mexe no perfil', async () => {
    const t = await withUser();
    await t.patchMe({ name: 'Ana', nickname: 'Aninha', gender: 'F' });
    const res = await t.patchMe({ locale: 'en' });
    expect(bodyOf(res)).toMatchObject({ name: 'Ana', nickname: 'Aninha', gender: 'F' });
  });

  it('USR-03: apelido null remove o apelido', async () => {
    const t = await withUser();
    await t.patchMe({ name: 'Ana', nickname: 'Aninha' });
    const res = await t.patchMe({ nickname: null });
    expect(bodyOf(res)).not.toHaveProperty('nickname');
  });

  it('USR-05: PATCH /me { timeZone: Mars/Olympus } → 422 VALIDATION_ERROR e nada gravado', async () => {
    const t = await withUser();
    const res = await t.patchMe({ timeZone: 'Mars/Olympus' });
    expect(res).toMatchObject({ statusCode: 422 });
    const { error } = bodyOf(res);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.issues[0]).toMatchObject({ code: 'custom', path: ['timeZone'] });
    expect(t.writes.count).toBe(0);
    expect((await t.service.get(t.userId)).preferences.timeZone).toBeUndefined();
  });

  it('USR-03: PATCH /me { locale: es } → 422 VALIDATION_ERROR', async () => {
    const t = await withUser();
    const res = await t.patchMe({ locale: 'es' });
    expect(res).toMatchObject({ statusCode: 422 });
    const { error } = bodyOf(res);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.issues[0]).toMatchObject({ code: 'invalid_value', path: ['locale'] });
    expect(t.writes.count).toBe(0);
  });

  it('USR-05: TimeZoneSchema.parse(Brazil/East) → nome canônico America/Sao_Paulo', () => {
    expect(TimeZoneSchema.parse('Brazil/East')).toBe('America/Sao_Paulo');
  });

  it('USR-05: PATCH /me grava o fuso das preferências no nome canônico', async () => {
    const t = await withUser();
    await t.patchMe({ timeZone: 'Brazil/East' });
    expect((await t.service.get(t.userId)).preferences.timeZone).toBe('America/Sao_Paulo');
  });
});
