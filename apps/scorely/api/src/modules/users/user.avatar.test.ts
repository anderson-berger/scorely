import { randomUUID } from 'node:crypto';
import { appError } from '@scorely/api/src/lib/errors';
import type { MediaService } from '@scorely/api/src/modules/media/media.service';
import type { UserRepository } from '@scorely/api/src/modules/users/user.repository';
import { createUserService } from '@scorely/api/src/modules/users/user.service';
import { userKey } from '@scorely/api/src/modules/users/user.table';
import { MEDIA_PURPOSES, type Preferences, type UpdateMeInput, type User } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// USR-08 (docs/modules/usuarios.md): a foto é a mídia `avatar`, e só a própria pessoa mexe nela.
// As regras do arquivo (MID-02 a MID-13) são testadas em media/media.service.test.ts; aqui a mídia é um dublê
// que grava `avatarMediaId`/`avatarUrl` no item do usuário, como a transação da mídia faria (MID-08).

const EMAIL = 'ana@example.com';
const BASE = 'https://uploads.test';

type MediaCall<K extends keyof MediaService> = Parameters<MediaService[K]>[0];
/** O usuário como fica no banco: o `avatarMediaId` é interno e não sai na resposta. */
type StoredUser = User & { avatarMediaId?: string };

type ReadOpts = { consistent?: boolean };

/**
 * Repositório em memória com as três partes da pessoa (usuarios.md, seção 3): perfil (`META`), email e
 * preferências. `null` no patch remove o atributo. O `get` devolve o perfil como foi gravado.
 */
function memoryUserRepo() {
  const users = new Map<string, StoredUser>();
  const emails = new Map<string, string>();
  const prefs = new Map<string, Preferences>();
  const me = (id: string) => {
    const profile = users.get(id);
    const email = emails.get(id);
    if (!profile || email === undefined) return undefined;
    return structuredClone({ ...profile, email, preferences: prefs.get(id) ?? {} });
  };
  const idOf = (email: string) => [...emails.entries()].find(([, e]) => e === email)?.[0];
  const write = (target: Record<string, unknown>, part: Record<string, unknown>) =>
    Object.entries(part).forEach(([k, v]) => {
      if (v === null) delete target[k];
      else if (v !== undefined) target[k] = v;
    });
  const impl = {
    get: async (id: string, _opts?: ReadOpts) => structuredClone(users.get(id)),
    getMe: async (id: string, _opts?: ReadOpts) => me(id),
    getByEmail: async (email: string, _opts?: ReadOpts) => {
      const id = idOf(email);
      return id === undefined ? undefined : me(id);
    },
    getPreferences: async (id: string): Promise<Preferences> => structuredClone(prefs.get(id) ?? {}),
    async create(user: User, email: string) {
      if (idOf(email) !== undefined) return false;
      users.set(user.id, structuredClone(user));
      emails.set(user.id, email);
      prefs.set(user.id, {});
      return true;
    },
    async update(id: string, patch: UpdateMeInput) {
      const user = users.get(id);
      const preferences = prefs.get(id);
      if (!user || !preferences) return undefined;
      const { locale, timeZone, ...rest } = patch;
      write(preferences, { locale, timeZone });
      write(user, rest);
      return me(id);
    },
  };
  const repo: UserRepository = impl;
  /** O que a transação da mídia grava no item do usuário (`key` = `userKey(id)`). */
  const link = (key: { PK: string; SK: string }, value: { mediaId: string; url: string } | null) => {
    const user = [...users.values()].find((u) => userKey(u.id).PK === key.PK && key.SK === 'META');
    if (!user) throw new Error('user not found in memory store');
    if (value) {
      user.avatarMediaId = value.mediaId;
      user.avatarUrl = value.url;
    } else {
      delete user.avatarMediaId;
      delete user.avatarUrl;
    }
  };
  return { repo, users, link };
}

/** Dublê da mídia: registra as chamadas e o que `target.readCurrent()` devolveu em cada uma. */
function fakeMedia(link: ReturnType<typeof memoryUserRepo>['link']) {
  const calls = {
    requestUpload: [] as MediaCall<'requestUpload'>[],
    attach: [] as (MediaCall<'attach'> & { current: string | undefined })[],
    detach: [] as (MediaCall<'detach'> & { current: string | undefined })[],
  };
  const failNext: { attach?: Error } = {};
  const media: MediaService = {
    async requestUpload(input) {
      calls.requestUpload.push(input);
      const policy = MEDIA_PURPOSES[input.purpose];
      return {
        mediaId: randomUUID(),
        url: `${BASE}/`,
        fields: { key: 'tmp/x' },
        maxBytes: policy.maxBytes,
        width: policy.width,
        height: policy.height,
      };
    },
    async attach(input) {
      const current = await input.target.readCurrent();
      calls.attach.push({ ...input, current });
      if (failNext.attach) {
        const err = failNext.attach;
        delete failNext.attach;
        throw err;
      }
      const url = `${BASE}/public/user/${input.ownerId}/avatar/${input.mediaId}.webp`;
      link(input.target.key, { mediaId: input.mediaId, url });
      return { url };
    },
    async detach(input) {
      const current = await input.target.readCurrent();
      calls.detach.push({ ...input, current });
      if (current) link(input.target.key, null);
    },
  };
  return { media, calls, failNext };
}

async function withUser() {
  const clock = { now: new Date('2026-11-10T12:00:00.000Z') };
  const memory = memoryUserRepo();
  const fake = fakeMedia(memory.link);
  const service = createUserService(memory.repo, () => clock.now, fake.media);
  const { user } = await service.findOrCreateByEmail(EMAIL);
  return { service, user, calls: fake.calls, failNext: fake.failNext, users: memory.users };
}

const errorOf = (p: Promise<unknown>) => p.catch((e: unknown) => e);

describe('foto de perfil pela mídia (USR-08)', () => {
  it('USR-08: pedir o envio → mídia `avatar` da própria pessoa (dono e quem envia = ela), com 512×512 e 2 MB', async () => {
    const t = await withUser();
    const upload = await t.service.requestAvatarUpload(t.user.id, { contentType: 'image/webp' });
    expect(t.calls.requestUpload).toEqual([
      { purpose: 'avatar', ownerId: t.user.id, uploadedBy: t.user.id, contentType: 'image/webp' },
    ]);
    expect(upload).toMatchObject({ width: 512, height: 512, maxBytes: 2 * 1024 * 1024 });
  });

  it('USR-08: confirmar → liga a mídia no item da própria pessoa (`avatar`) e devolve a pessoa (com email e preferências) com `avatarUrl`', async () => {
    const t = await withUser();
    const mediaId = randomUUID();
    const user = await t.service.setAvatar(t.user.id, { mediaId });
    expect(t.calls.attach).toHaveLength(1);
    expect(t.calls.attach[0]).toMatchObject({ mediaId, purpose: 'avatar', ownerId: t.user.id });
    expect(t.calls.attach[0]?.target).toMatchObject({ key: userKey(t.user.id), field: 'avatar' });
    const url = `${BASE}/public/user/${t.user.id}/avatar/${mediaId}.webp`;
    expect(user).toMatchObject({ id: t.user.id, email: EMAIL, preferences: {}, avatarUrl: url });
    expect((await t.service.get(t.user.id)).avatarUrl).toBe(url);
  });

  it('USR-08: o User devolvido não expõe o `avatarMediaId`', async () => {
    const t = await withUser();
    const user = await t.service.setAvatar(t.user.id, { mediaId: randomUUID() });
    expect(user).not.toHaveProperty('avatarMediaId');
    expect(await t.service.get(t.user.id)).not.toHaveProperty('avatarMediaId');
  });

  it('USR-08: trocar a foto → a mídia recebe, pela área, o id da foto ligada agora', async () => {
    const t = await withUser();
    const first = randomUUID();
    await t.service.setAvatar(t.user.id, { mediaId: first });
    await t.service.setAvatar(t.user.id, { mediaId: randomUUID() });
    expect(t.calls.attach.map((c) => c.current)).toEqual([undefined, first]);
  });

  it('USR-08: erro da mídia ao confirmar (ex.: MEDIA_NOT_FOUND) chega igual e a foto não muda', async () => {
    const t = await withUser();
    t.failNext.attach = appError('MEDIA_NOT_FOUND');
    const err = await errorOf(t.service.setAvatar(t.user.id, { mediaId: randomUUID() }));
    expect(err).toMatchObject({ code: 'MEDIA_NOT_FOUND', status: 404 });
    expect((await t.service.get(t.user.id)).avatarUrl).toBeUndefined();
  });

  it('USR-08: remover → a mídia desliga a foto do item da própria pessoa e o User volta sem `avatarUrl`', async () => {
    const t = await withUser();
    const mediaId = randomUUID();
    await t.service.setAvatar(t.user.id, { mediaId });
    const user = await t.service.clearAvatar(t.user.id);
    expect(t.calls.detach).toHaveLength(1);
    expect(t.calls.detach[0]).toMatchObject({ purpose: 'avatar', ownerId: t.user.id, current: mediaId });
    expect(t.calls.detach[0]?.target).toMatchObject({ key: userKey(t.user.id), field: 'avatar' });
    expect(user.id).toBe(t.user.id);
    expect(user).not.toHaveProperty('avatarUrl');
    expect(user).not.toHaveProperty('avatarMediaId');
    expect(await t.service.get(t.user.id)).not.toHaveProperty('avatarUrl');
  });

  it('USR-08: remover sem foto → devolve o User sem foto', async () => {
    const t = await withUser();
    const user = await t.service.clearAvatar(t.user.id);
    expect(user).toMatchObject({ id: t.user.id, email: EMAIL, preferences: {} });
    expect(user.avatarUrl).toBeUndefined();
  });
});
