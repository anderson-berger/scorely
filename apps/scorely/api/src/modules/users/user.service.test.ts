import { randomUUID } from 'node:crypto';
import { asUserId, type UserId } from '@scorely/api/src/lib/ids';
import { newPublicId } from '@scorely/api/src/modules/users/public-id';
import type { MeRecord, UserRecord, UserRepository } from '@scorely/api/src/modules/users/user.repository';
import { createUserService, toMe } from '@scorely/api/src/modules/users/user.service';
import {
  type Preferences,
  PUBLIC_USER_ID_ALPHABET,
  type PublicUserId,
  PublicUserIdSchema,
  type UpdateMeInput,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

const EMAIL = 'ana@example.com';
type ReadOpts = { consistent?: boolean };

const pid = (code: string): PublicUserId => PublicUserIdSchema.parse(code);

/**
 * Repositório em memória (usuarios.md, seção 3): perfil (`META`, com `publicId`), email, preferências e os dois
 * lookups (email e id público). `taken` são códigos já em uso por outra conta (USR-15: o código é único).
 * `created` guarda o que cada `create` recebeu.
 */
function memoryUserRepo(taken: readonly string[] = []) {
  const profiles = new Map<UserId, UserRecord>();
  const emails = new Map<UserId, string>();
  const prefs = new Map<UserId, Preferences>();
  const publicIds = new Map<string, UserId>(taken.map((code) => [code, asUserId(randomUUID())]));
  const created: { user: UserRecord; email: string }[] = [];
  const me = (id: UserId): MeRecord | undefined => {
    const profile = profiles.get(id);
    const email = emails.get(id);
    if (!profile || email === undefined) return undefined;
    return structuredClone({ ...profile, email, preferences: prefs.get(id) ?? {} });
  };
  const idOf = (email: string) => [...emails.entries()].find(([, e]) => e === email)?.[0];
  const repo: UserRepository = {
    get: async (id: UserId, _opts?: ReadOpts) => structuredClone(profiles.get(id)),
    getMe: async (id: UserId, _opts?: ReadOpts) => me(id),
    getByEmail: async (email: string, _opts?: ReadOpts) => {
      const id = idOf(email);
      return id === undefined ? undefined : me(id);
    },
    getPreferences: async (id: UserId): Promise<Preferences> => structuredClone(prefs.get(id) ?? {}),
    async create(user: UserRecord, email: string) {
      created.push(structuredClone({ user, email }));
      if (idOf(email) !== undefined) return 'email_taken';
      if (publicIds.has(user.publicId)) return 'public_id_taken';
      profiles.set(user.id, structuredClone(user));
      emails.set(user.id, email);
      prefs.set(user.id, {});
      publicIds.set(user.publicId, user.id);
      return 'created';
    },
    async update(id: UserId, patch: UpdateMeInput) {
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
    async resolve(codes: readonly PublicUserId[]) {
      return new Map(
        codes.flatMap((code) => {
          const id = publicIds.get(code);
          return id === undefined ? [] : [[code, id] as const];
        }),
      );
    },
  };
  return { repo, profiles, emails, created };
}

/** Gerador de códigos fake: devolve os da lista, na ordem, e conta as chamadas. */
function codes(...list: string[]) {
  const state = { calls: 0 };
  const next = (): PublicUserId => {
    const code = list[state.calls] ?? list[list.length - 1] ?? 'ZZZZZZZZ';
    state.calls += 1;
    return pid(code);
  };
  return { next, state };
}

const clock = { now: new Date('2026-11-13T12:00:00.000Z') };

const winnerId = asUserId('00000000-0000-4000-8000-000000000001');
const winner: MeRecord = {
  id: winnerId,
  publicId: pid('7K3QX9TA'),
  createdAt: '2026-01-01T00:00:00.000Z',
  email: EMAIL,
  preferences: {},
};

/** Repo em que o `create` perde a corrida: o email já foi gravado por outro login. */
function racedRepo(visibleToConsistentRead: boolean) {
  const reads: (ReadOpts | undefined)[] = [];
  const visible = (opts?: ReadOpts) => (opts?.consistent && visibleToConsistentRead ? winner : undefined);
  const repo: UserRepository = {
    get: async () => undefined,
    getMe: async (_id: UserId, opts?: ReadOpts) => visible(opts),
    getPreferences: async (): Promise<Preferences> => ({}),
    async getByEmail(_email: string, opts?: ReadOpts) {
      reads.push(opts);
      // A 1ª leitura (antes do create) não vê nada; depois, só a leitura consistente vê o vencedor.
      if (reads.length === 1) return undefined;
      return visible(opts);
    },
    create: async () => 'email_taken' as const,
    update: async () => undefined,
    resolve: async () => new Map(),
  };
  return { repo, reads };
}

describe('conta e email (USR-01, USR-13)', () => {
  it('USR-13: o primeiro login grava o email à parte; o perfil vai sem email', async () => {
    const memory = memoryUserRepo();
    await createUserService(memory.repo, () => clock.now).findOrCreateByEmail(EMAIL);
    expect(memory.created).toHaveLength(1);
    expect(memory.created[0]?.email).toBe(EMAIL);
    expect(memory.created[0]?.user).not.toHaveProperty('email');
    expect(memory.created[0]?.user).not.toHaveProperty('locale');
    expect(memory.created[0]?.user).not.toHaveProperty('timeZone');
  });

  it('USR-13: GET /me devolve o perfil, o email e as preferências (vazias numa conta nova)', async () => {
    const memory = memoryUserRepo();
    const service = createUserService(memory.repo, () => clock.now);
    const { userId, me: first, created } = await service.findOrCreateByEmail(EMAIL);
    expect(created).toBe(true);
    const me = await service.get(userId);
    expect(me).toMatchObject({ id: first.id, email: EMAIL, preferences: {} });
    expect(me).not.toHaveProperty('locale');
    expect(me).not.toHaveProperty('timeZone');
  });

  it('USR-02: a conta nasce sem nome', async () => {
    const service = createUserService(memoryUserRepo().repo, () => clock.now);
    const { userId } = await service.findOrCreateByEmail(EMAIL);
    expect((await service.get(userId)).name).toBeUndefined();
  });

  it('USR-01: cada email tem uma conta só (o segundo login acha a mesma)', async () => {
    const memory = memoryUserRepo();
    const service = createUserService(memory.repo, () => clock.now);
    const first = await service.findOrCreateByEmail(EMAIL);
    const second = await service.findOrCreateByEmail(EMAIL);
    expect(second.created).toBe(false);
    expect(second.userId).toBe(first.userId);
    expect(memory.profiles.size).toBe(1);
  });
});

describe('id público, o código de amigo (USR-15)', () => {
  it('USR-15: o código tem 8 caracteres, só do alfabeto sem I, L, O e U', () => {
    const samples = Array.from({ length: 500 }, () => newPublicId());
    for (const code of samples) {
      expect(code).toHaveLength(8);
      expect(PublicUserIdSchema.safeParse(code).success).toBe(true);
      expect(code).not.toMatch(/[ILOU]/);
    }
  });

  it('USR-15: cada caractere é sorteado entre os 32 do alfabeto', () => {
    const maxes: number[] = [];
    const indexes = [0, 9, 10, 17, 18, 26, 27, 31];
    const code = newPublicId((max: number) => {
      maxes.push(max);
      return indexes[maxes.length - 1] ?? 0;
    });
    expect(maxes).toEqual(Array(8).fill(PUBLIC_USER_ID_ALPHABET.length));
    expect(code).toBe(indexes.map((i) => PUBLIC_USER_ID_ALPHABET[i]).join(''));
    expect(code).toBe('09AHJTVZ');
  });

  it('USR-15: nasce no primeiro login, gravado no perfil junto com o id do sistema (que é outro)', async () => {
    const memory = memoryUserRepo();
    const gen = codes('7K3QX9TA');
    const service = createUserService(memory.repo, () => clock.now, undefined, gen.next);
    const { userId, me } = await service.findOrCreateByEmail(EMAIL);
    expect(memory.created[0]?.user).toMatchObject({ id: userId, publicId: '7K3QX9TA' });
    expect(me.id).toBe('7K3QX9TA');
    expect(userId).not.toBe(me.id);
    expect(userId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('USR-15: o código não muda: o segundo login devolve o mesmo, sem sortear outro', async () => {
    const memory = memoryUserRepo();
    const gen = codes('7K3QX9TA', 'B0B0B0B0');
    const service = createUserService(memory.repo, () => clock.now, undefined, gen.next);
    const first = await service.findOrCreateByEmail(EMAIL);
    const second = await service.findOrCreateByEmail(EMAIL);
    expect(second.me.id).toBe(first.me.id);
    expect(gen.state.calls).toBe(1);
    await service.update(first.userId, { name: 'Ana' });
    expect((await service.get(first.userId)).id).toBe('7K3QX9TA');
  });

  it('USR-15: código sorteado já em uso → sorteia outro e cria com o novo', async () => {
    const memory = memoryUserRepo(['AAAAAAAA']);
    const gen = codes('AAAAAAAA', 'BBBBBBBB');
    const service = createUserService(memory.repo, () => clock.now, undefined, gen.next);
    const { me, created } = await service.findOrCreateByEmail(EMAIL);
    expect(created).toBe(true);
    expect(me.id).toBe('BBBBBBBB');
    expect(memory.created.map((c) => c.user.publicId)).toEqual(['AAAAAAAA', 'BBBBBBBB']);
    expect(memory.profiles.size).toBe(1);
  });

  it('USR-15: três códigos seguidos em uso → USER_CREATE_CONFLICT (409), sem quarta tentativa', async () => {
    const memory = memoryUserRepo(['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC', 'DDDDDDDD']);
    const gen = codes('AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC', 'DDDDDDDD');
    const service = createUserService(memory.repo, () => clock.now, undefined, gen.next);
    const err = await service.findOrCreateByEmail(EMAIL).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'USER_CREATE_CONFLICT', status: 409 });
    expect(memory.created).toHaveLength(3);
    expect(memory.profiles.size).toBe(0);
  });

  it('USR-15: duas contas ganham códigos diferentes', async () => {
    const memory = memoryUserRepo();
    const gen = codes('AAAAAAAA', 'BBBBBBBB');
    const service = createUserService(memory.repo, () => clock.now, undefined, gen.next);
    const ana = await service.findOrCreateByEmail('ana@example.com');
    const bia = await service.findOrCreateByEmail('bia@example.com');
    expect(ana.me.id).not.toBe(bia.me.id);
    expect(ana.userId).not.toBe(bia.userId);
  });
});

describe('o id do sistema não sai (USR-16)', () => {
  it('USR-16: GET /me e PATCH /me devolvem o `id` público, sem o id do sistema nem `publicId`', async () => {
    const memory = memoryUserRepo();
    const service = createUserService(memory.repo, () => clock.now, undefined, codes('7K3QX9TA').next);
    const { userId, me } = await service.findOrCreateByEmail(EMAIL);
    const read = await service.get(userId);
    const patched = await service.update(userId, { name: 'Ana' });
    for (const m of [me, read, patched]) {
      expect(m.id).toBe('7K3QX9TA');
      expect(m).not.toHaveProperty('publicId');
      expect(JSON.stringify(m)).not.toContain(userId);
    }
  });

  it('USR-16: toMe troca o `id` pelo público e tira `publicId` e `avatarMediaId`', () => {
    const record: MeRecord = {
      ...winner,
      name: 'Ana',
      avatarUrl: 'https://cdn.test/public/user/7K3QX9TA/avatar/x.webp',
      avatarMediaId: randomUUID(),
    };
    const me = toMe(record);
    expect(me).toEqual({
      id: '7K3QX9TA',
      createdAt: winner.createdAt,
      name: 'Ana',
      avatarUrl: record.avatarUrl,
      email: EMAIL,
      preferences: {},
    });
  });
});

describe('quem a ação atinge (USR-17)', () => {
  it('USR-17: o perfil é editado pelo id do login (sistema); a outra conta não muda', async () => {
    const memory = memoryUserRepo();
    const gen = codes('AAAAAAAA', 'BBBBBBBB');
    const service = createUserService(memory.repo, () => clock.now, undefined, gen.next);
    const ana = await service.findOrCreateByEmail('ana@example.com');
    const bia = await service.findOrCreateByEmail('bia@example.com');
    await service.update(ana.userId, { name: 'Ana' });
    expect((await service.get(ana.userId)).name).toBe('Ana');
    expect((await service.get(bia.userId)).name).toBeUndefined();
  });

  it('USR-17: o diretório traduz id público → id do sistema; o código desconhecido fica de fora', async () => {
    const memory = memoryUserRepo();
    const service = createUserService(memory.repo, () => clock.now, undefined, codes('AAAAAAAA').next);
    const { userId } = await service.findOrCreateByEmail(EMAIL);
    const map = await memory.repo.resolve([pid('AAAAAAAA'), pid('ZZZZZZZZ')]);
    expect(map.get(pid('AAAAAAAA'))).toBe(userId);
    expect(map.has(pid('ZZZZZZZZ'))).toBe(false);
  });
});

describe('findOrCreateByEmail', () => {
  it('perdeu a corrida: relê o vencedor com leitura consistente (sem sortear outro código)', async () => {
    const { repo, reads } = racedRepo(true);
    const gen = codes('AAAAAAAA');
    const result = await createUserService(repo, () => clock.now, undefined, gen.next).findOrCreateByEmail(
      EMAIL,
    );
    expect(result.created).toBe(false);
    expect(result.userId).toBe(winnerId);
    expect(result.me.id).toBe(winner.publicId);
    expect(reads[1]).toEqual({ consistent: true });
    expect(gen.state.calls).toBe(1);
  });

  it('vencedor sumiu: USER_CREATE_CONFLICT (409), sem o email na mensagem', async () => {
    const { repo } = racedRepo(false);
    const err = await createUserService(repo, () => clock.now)
      .findOrCreateByEmail(EMAIL)
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'USER_CREATE_CONFLICT', status: 409 });
    expect((err as Error).message).not.toContain(EMAIL);
  });
});
