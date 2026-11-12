import type { UserRepository } from '@scorely/api/src/modules/users/user.repository';
import { createUserService } from '@scorely/api/src/modules/users/user.service';
import type { Me, Preferences, UpdateMeInput, User } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

const EMAIL = 'ana@example.com';
type ReadOpts = { consistent?: boolean };

/**
 * Repositório em memória no formato da etapa 1 (usuarios.md, seção 3): perfil (`META`), email (`EMAIL`) e
 * preferências (`PREFERENCES`) em três partes. `created` guarda o que o `create` recebeu, para conferir que o
 * email não vai no perfil (USR-13).
 */
function memoryUserRepo() {
  const profiles = new Map<string, User>();
  const emails = new Map<string, string>();
  const prefs = new Map<string, Preferences>();
  const created: { user: User; email: string }[] = [];
  const me = (id: string): Me | undefined => {
    const profile = profiles.get(id);
    const email = emails.get(id);
    if (!profile || email === undefined) return undefined;
    return structuredClone({ ...profile, email, preferences: prefs.get(id) ?? {} });
  };
  const idOf = (email: string) => [...emails.entries()].find(([, e]) => e === email)?.[0];
  const impl = {
    get: async (id: string, _opts?: ReadOpts) => structuredClone(profiles.get(id)),
    getMe: async (id: string, _opts?: ReadOpts) => me(id),
    getByEmail: async (email: string, _opts?: ReadOpts) => {
      const id = idOf(email);
      return id === undefined ? undefined : me(id);
    },
    getPreferences: async (id: string): Promise<Preferences> => structuredClone(prefs.get(id) ?? {}),
    async create(user: User, email: string) {
      created.push(structuredClone({ user, email }));
      if (idOf(email) !== undefined) return false;
      profiles.set(user.id, structuredClone(user));
      emails.set(user.id, email);
      prefs.set(user.id, {});
      return true;
    },
    async update(id: string, patch: UpdateMeInput) {
      const profile = profiles.get(id);
      if (!profile) return undefined;
      const { locale, timeZone, ...rest } = patch;
      Object.assign(prefs.get(id) ?? {}, {
        ...(locale && { locale }),
        ...(timeZone && { timeZone }),
      });
      Object.assign(profile, rest);
      return me(id);
    },
  };
  const repo: UserRepository = impl;
  return { repo, profiles, emails, created };
}

const winnerId = '00000000-0000-4000-8000-000000000001';
const winner: Me = { id: winnerId, createdAt: '2026-01-01T00:00:00.000Z', email: EMAIL, preferences: {} };

/** Repo em que o `create` perde a corrida: o email já foi gravado por outro login. */
function racedRepo(visibleToConsistentRead: boolean) {
  const reads: (ReadOpts | undefined)[] = [];
  const visible = (opts?: ReadOpts) => (opts?.consistent && visibleToConsistentRead ? winner : undefined);
  const impl = {
    get: async () => undefined,
    getMe: async (_id: string, opts?: ReadOpts) => visible(opts),
    getPreferences: async (): Promise<Preferences> => ({}),
    async getByEmail(_email: string, opts?: ReadOpts) {
      reads.push(opts);
      // A 1ª leitura (antes do create) não vê nada; depois, só a leitura consistente vê o vencedor.
      if (reads.length === 1) return undefined;
      return visible(opts);
    },
    create: async () => false,
    update: async () => undefined,
  };
  const repo: UserRepository = impl;
  return { repo, reads };
}

describe('conta e email (USR-01, USR-13)', () => {
  it('USR-13: o primeiro login grava o email à parte; o perfil vai sem email', async () => {
    const memory = memoryUserRepo();
    await createUserService(memory.repo).findOrCreateByEmail(EMAIL);
    expect(memory.created).toHaveLength(1);
    expect(memory.created[0]?.email).toBe(EMAIL);
    expect(memory.created[0]?.user).not.toHaveProperty('email');
    expect(memory.created[0]?.user).not.toHaveProperty('locale');
    expect(memory.created[0]?.user).not.toHaveProperty('timeZone');
  });

  it('USR-13: GET /me devolve o perfil, o email e as preferências (vazias numa conta nova)', async () => {
    const memory = memoryUserRepo();
    const service = createUserService(memory.repo);
    const { user, created } = await service.findOrCreateByEmail(EMAIL);
    expect(created).toBe(true);
    const me = await service.get(user.id);
    expect(me).toMatchObject({ id: user.id, email: EMAIL, preferences: {} });
    expect(me).not.toHaveProperty('locale');
    expect(me).not.toHaveProperty('timeZone');
  });

  it('USR-02: a conta nasce sem nome', async () => {
    const service = createUserService(memoryUserRepo().repo);
    const { user } = await service.findOrCreateByEmail(EMAIL);
    expect((await service.get(user.id)).name).toBeUndefined();
  });

  it('USR-01: cada email tem uma conta só (o segundo login acha a mesma)', async () => {
    const memory = memoryUserRepo();
    const service = createUserService(memory.repo);
    const first = await service.findOrCreateByEmail(EMAIL);
    const second = await service.findOrCreateByEmail(EMAIL);
    expect(second.created).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    expect(memory.profiles.size).toBe(1);
  });
});

describe('findOrCreateByEmail', () => {
  it('perdeu a corrida: relê o vencedor com leitura consistente', async () => {
    const { repo, reads } = racedRepo(true);
    const result = await createUserService(repo).findOrCreateByEmail(EMAIL);
    expect(result.created).toBe(false);
    expect(result.user.id).toBe(winnerId);
    expect(reads[1]).toEqual({ consistent: true });
  });

  it('vencedor sumiu: USER_CREATE_CONFLICT (409), sem o email na mensagem', async () => {
    const { repo } = racedRepo(false);
    const err = await createUserService(repo)
      .findOrCreateByEmail(EMAIL)
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'USER_CREATE_CONFLICT', status: 409 });
    expect((err as Error).message).not.toContain(EMAIL);
  });
});
