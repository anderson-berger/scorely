import { randomUUID } from 'node:crypto';
import { appError } from '@scorely/api/src/lib/errors';
import { asUserId } from '@scorely/api/src/lib/ids';
import { memoryUsers } from '@scorely/api/src/modules/users/data/users.memory';
import { userKey } from '@scorely/api/src/modules/users/data/users.table';
import { BASE, EMAIL, errorOf, fakeMedia, PUBLIC_ID } from '@scorely/api/src/modules/users/tests/fixtures';
import { createUserService } from '@scorely/api/src/modules/users/users.service';
import { describe, expect, it } from 'vitest';

// USR-08 (docs/modules/usuarios.md): a foto é a mídia `avatar`, e só a própria pessoa mexe nela.
// As regras do arquivo (MID-02 a MID-13) são testadas em media/tests/media.test.ts; aqui a mídia é um dublê
// que grava só o `avatarMediaId` no item do usuário, como a transação da mídia faria (MID-08); a URL é montada na
// resposta pelo `urlOf` da mídia (MID-12).

async function withUser() {
  const clock = { now: new Date('2026-11-10T12:00:00.000Z') };
  const memory = memoryUsers();
  const fake = fakeMedia(memory.link);
  const getMeOpts: unknown[] = [];
  const repo = {
    ...memory.repo,
    getMe: async (...args: Parameters<typeof memory.repo.getMe>) => {
      getMeOpts.push(args[1]);
      return memory.repo.getMe(...args);
    },
  };
  const service = createUserService(
    repo,
    () => clock.now,
    fake.media,
    () => PUBLIC_ID,
  );
  const { userId, me } = await service.findOrCreateByEmail(EMAIL);
  await service.requestAvatarUpload(userId, { contentType: 'image/webp' });
  fake.calls.requestUpload.length = 0;
  return {
    service,
    userId,
    me,
    calls: fake.calls,
    failNext: fake.failNext,
    users: memory.profiles,
    getMeOpts,
  };
}

describe('foto de perfil pela mídia (USR-08)', () => {
  it('USR-08: pedir o envio → mídia `avatar` da própria pessoa (dono e quem envia = ela), com 512×512 e 2 MB', async () => {
    const t = await withUser();
    const upload = await t.service.requestAvatarUpload(t.userId, {
      contentType: 'image/webp',
    });
    expect(t.calls.requestUpload).toEqual([
      {
        purpose: 'avatar',
        ownerId: t.userId,
        uploadedBy: t.userId,
        contentType: 'image/webp',
      },
    ]);
    expect(upload).toMatchObject({
      width: 512,
      height: 512,
      maxBytes: 2 * 1024 * 1024,
    });
  });

  it('USR-08: confirmar → liga a mídia no item da própria pessoa (`avatar`) e devolve a pessoa (com email e preferências) com `avatarUrl`', async () => {
    const t = await withUser();
    const mediaId = randomUUID();
    const user = await t.service.setAvatar(t.userId, { mediaId });
    expect(t.calls.attach).toHaveLength(1);
    expect(t.calls.attach[0]).toMatchObject({
      mediaId,
      purpose: 'avatar',
      ownerId: t.userId,
    });
    expect(t.calls.attach[0]?.target).toMatchObject({
      key: userKey(t.userId),
      field: 'avatar',
    });
    const url = `${BASE}/public/avatar/${mediaId}`;
    expect(user).toMatchObject({
      id: PUBLIC_ID,
      private: { email: EMAIL },
      preferences: {},
      avatarUrl: url,
    });
    expect((await t.service.get(t.userId)).avatarUrl).toBe(url);
  });

  it('USR-08: o User devolvido não expõe o `avatarMediaId`', async () => {
    const t = await withUser();
    const user = await t.service.setAvatar(t.userId, { mediaId: randomUUID() });
    expect(user).not.toHaveProperty('avatarMediaId');
    expect(await t.service.get(t.userId)).not.toHaveProperty('avatarMediaId');
  });

  it('USR-08: trocar a foto → a mídia recebe, pela área, o id da foto ligada agora', async () => {
    const t = await withUser();
    const first = randomUUID();
    await t.service.setAvatar(t.userId, { mediaId: first });
    await t.service.setAvatar(t.userId, { mediaId: randomUUID() });
    expect(t.calls.attach.map((c) => c.current)).toEqual([undefined, first]);
  });

  it('USR-08: erro da mídia ao confirmar (ex.: MEDIA_NOT_FOUND) chega igual e a foto não muda', async () => {
    const t = await withUser();
    t.failNext.attach = appError('MEDIA_NOT_FOUND');
    const err = await errorOf(t.service.setAvatar(t.userId, { mediaId: randomUUID() }));
    expect(err).toMatchObject({ code: 'MEDIA_NOT_FOUND', status: 404 });
    expect((await t.service.get(t.userId)).avatarUrl).toBeUndefined();
  });

  it('USR-08: remover → a mídia desliga a foto do item da própria pessoa e o User volta sem `avatarUrl`', async () => {
    const t = await withUser();
    const mediaId = randomUUID();
    await t.service.setAvatar(t.userId, { mediaId });
    const user = await t.service.clearAvatar(t.userId);
    expect(t.calls.detach).toHaveLength(1);
    expect(t.calls.detach[0]).toMatchObject({
      purpose: 'avatar',
      ownerId: t.userId,
      current: mediaId,
    });
    expect(t.calls.detach[0]?.target).toMatchObject({
      key: userKey(t.userId),
      field: 'avatar',
    });
    expect(user.id).toBe(PUBLIC_ID);
    expect(user).not.toHaveProperty('avatarUrl');
    expect(user).not.toHaveProperty('avatarMediaId');
    expect(await t.service.get(t.userId)).not.toHaveProperty('avatarUrl');
  });

  it('USR-08: remover sem foto → devolve o User sem foto', async () => {
    const t = await withUser();
    const user = await t.service.clearAvatar(t.userId);
    expect(user).toMatchObject({
      id: PUBLIC_ID,
      private: { email: EMAIL },
      preferences: {},
    });
    expect(user.avatarUrl).toBeUndefined();
  });

  it('MID-12: a URL da foto é só a finalidade e o id da mídia: sem o id do sistema nem o código de amigo (USR-16)', async () => {
    const t = await withUser();
    const mediaId = randomUUID();
    const user = await t.service.setAvatar(t.userId, { mediaId });
    expect(user.avatarUrl).toBe(`${BASE}/public/avatar/${mediaId}`);
    expect(user.avatarUrl).not.toContain(t.userId);
    expect(user.avatarUrl).not.toContain(PUBLIC_ID);
    expect(t.users.get(t.userId)).not.toHaveProperty('avatarUrl');
    expect(t.users.get(t.userId)).toMatchObject({ avatarMediaId: mediaId });
  });
});

describe('foto de perfil soma a version (USR-08, USR-18)', () => {
  const rename = (version: number) => ({ version, private: { name: 'Ana' } });

  it('USR-18: confirmar a foto → a resposta traz a version anterior + 1, igual ao GET /me seguinte', async () => {
    const t = await withUser();
    const user = await t.service.setAvatar(t.userId, { mediaId: randomUUID() });
    expect(user.version).toBe(t.me.version + 1);
    expect((await t.service.get(t.userId)).version).toBe(user.version);
  });

  it('USR-18: trocar a foto (já tinha uma) → a version soma 1 de novo', async () => {
    const t = await withUser();
    const first = await t.service.setAvatar(t.userId, { mediaId: randomUUID() });
    const second = await t.service.setAvatar(t.userId, { mediaId: randomUUID() });
    expect(second.version).toBe(first.version + 1);
  });

  it('USR-18: remover a foto → a resposta traz a version + 1', async () => {
    const t = await withUser();
    const first = await t.service.setAvatar(t.userId, { mediaId: randomUUID() });
    const cleared = await t.service.clearAvatar(t.userId);
    expect(cleared.version).toBe(first.version + 1);
    expect((await t.service.get(t.userId)).version).toBe(cleared.version);
  });

  it('USR-08: remover sem foto → a version não muda', async () => {
    const t = await withUser();
    const user = await t.service.clearAvatar(t.userId);
    expect(user.version).toBe(t.me.version);
  });

  it('USR-08: reconfirmar a foto já ligada (MID-07) → a version não muda', async () => {
    const t = await withUser();
    const mediaId = randomUUID();
    const first = await t.service.setAvatar(t.userId, { mediaId });
    const again = await t.service.setAvatar(t.userId, { mediaId });
    expect(again.version).toBe(first.version);
  });

  it('USR-18: depois de confirmar a foto, PATCH /me com a version da resposta grava; com a de antes dá VERSION_CONFLICT', async () => {
    const t = await withUser();
    const user = await t.service.setAvatar(t.userId, { mediaId: randomUUID() });
    const stale = await errorOf(t.service.update(t.userId, rename(t.me.version)));
    expect(stale).toMatchObject({
      code: 'VERSION_CONFLICT',
      status: 409,
      details: { currentVersion: user.version },
    });
    const patched = await t.service.update(t.userId, rename(user.version));
    expect(patched.version).toBe(user.version + 1);
  });

  it('USR-18: depois de remover a foto, PATCH /me com a version da resposta grava; com a de antes dá VERSION_CONFLICT', async () => {
    const t = await withUser();
    const withPhoto = await t.service.setAvatar(t.userId, { mediaId: randomUUID() });
    const cleared = await t.service.clearAvatar(t.userId);
    const stale = await errorOf(t.service.update(t.userId, rename(withPhoto.version)));
    expect(stale).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: cleared.version },
    });
    const patched = await t.service.update(t.userId, rename(cleared.version));
    expect(patched.version).toBe(cleared.version + 1);
  });

  it('USR-18: setAvatar e clearAvatar terminam relendo o perfil com consistent: true', async () => {
    const t = await withUser();
    await t.service.setAvatar(t.userId, { mediaId: randomUUID() });
    expect(t.getMeOpts.at(-1)).toEqual({ consistent: true });
    await t.service.clearAvatar(t.userId);
    expect(t.getMeOpts.at(-1)).toEqual({ consistent: true });
  });
});

describe('foto de perfil de conta que não existe mais (AUTH-16)', () => {
  const ghost = asUserId('00000000-0000-4000-8000-0000000000ff');
  const ghostService = () => {
    const clock = { now: new Date('2026-11-13T12:00:00.000Z') };
    // A mídia não acha o item para ligar: o dublê só ignora; quem responde é o serviço de usuários.
    const fake = fakeMedia(() => undefined);
    return createUserService(
      memoryUsers().repo,
      () => clock.now,
      fake.media,
      () => PUBLIC_ID,
    );
  };

  it('AUTH-16: POST /me/avatar/upload com conta inexistente → SESSION_INVALID (401)', async () => {
    const err = await errorOf(ghostService().requestAvatarUpload(ghost, { contentType: 'image/webp' }));
    expect(err).toMatchObject({ code: 'SESSION_INVALID', status: 401 });
  });

  it('AUTH-16: PUT /me/avatar com conta inexistente → SESSION_INVALID (401)', async () => {
    const err = await errorOf(ghostService().setAvatar(ghost, { mediaId: randomUUID() }));
    expect(err).toMatchObject({ code: 'SESSION_INVALID', status: 401 });
  });

  it('AUTH-16: DELETE /me/avatar com conta inexistente → SESSION_INVALID (401)', async () => {
    const err = await errorOf(ghostService().clearAvatar(ghost));
    expect(err).toMatchObject({ code: 'SESSION_INVALID', status: 401 });
  });
});
