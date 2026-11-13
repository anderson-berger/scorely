import { randomUUID } from 'node:crypto';
import { AppError } from '@scorely/api/src/lib/errors';
import type { InspectedFile, MediaStorage } from '@scorely/api/src/lib/storage';
import type { MediaRepository } from '@scorely/api/src/modules/media/media.repository';
import { createMediaService } from '@scorely/api/src/modules/media/media.service';
import type { MediaRecord, MediaTarget } from '@scorely/api/src/modules/media/media.table';
import { type ErrorCode, MEDIA_PURPOSES, type MediaPurpose } from '@scorely/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

// docs/modules/midia.md: MID-01, MID-02, MID-04 a MID-13. MID-03 (preparo no navegador) fica em web/src/lib/media.test.ts.

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const GROUP = '33333333-3333-4333-8333-333333333333';
const BASE = 'https://uploads.test';
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

type AttachArgs = Parameters<MediaRepository['attach']>[0];
type DetachArgs = Parameters<MediaRepository['detach']>[0];
type AttachResult = Awaited<ReturnType<MediaRepository['attach']>>;
type Field = MediaTarget['field'];
type ItemKey = MediaTarget['key'];

/** Itens da área (usuário, grupo) em memória: só os campos `<field>MediaId`/`<field>Url` que a mídia grava. */
function memoryArea() {
  const items = new Map<string, Record<string, unknown>>();
  const id = (key: ItemKey) => `${key.PK}|${key.SK}`;
  const item = (key: ItemKey) => items.get(id(key)) ?? {};
  const reads = { count: 0 };
  /** O que a área faria na mesma transação da troca (MID-08): grava ou remove o id e a URL. */
  const link = (key: ItemKey, field: Field, value: { mediaId: string; url: string } | null) => {
    const next = { ...item(key) };
    if (value) {
      next[`${field}MediaId`] = value.mediaId;
      next[`${field}Url`] = value.url;
    } else {
      delete next[`${field}MediaId`];
      delete next[`${field}Url`];
    }
    items.set(id(key), next);
  };
  const currentId = (key: ItemKey, field: Field) => item(key)[`${field}MediaId`] as string | undefined;
  const target = (key: ItemKey, field: Field): MediaTarget => ({
    key,
    field,
    async readCurrent() {
      reads.count += 1;
      return currentId(key, field);
    },
  });
  return { item, link, currentId, target, reads };
}

type Area = ReturnType<typeof memoryArea>;

/**
 * Repositório da mídia em memória. O `attach`/`detach` imita a transação (MID-08): a nova precisa estar pendente
 * e o id ligado na área precisa ser o `previous` lido; senão `conflict` e nada muda.
 * `attachScript`: respostas forçadas do `attach`, consumidas na ordem (vazia → comportamento normal).
 */
function memoryMediaRepo(area: Area) {
  const records = new Map<string, MediaRecord>();
  const attachCalls: AttachArgs[] = [];
  const detachCalls: DetachArgs[] = [];
  const attachScript: ((args: AttachArgs) => Promise<AttachResult>)[] = [];

  const naturalAttach = ({ ready, url, target, previous }: AttachArgs): AttachResult => {
    if (records.get(ready.id)?.status !== 'pending') return 'conflict';
    if (area.currentId(target.key, target.field) !== previous?.id) return 'conflict';
    records.set(ready.id, structuredClone(ready));
    area.link(target.key, target.field, { mediaId: ready.id, url });
    if (previous) records.delete(previous.id);
    return 'attached';
  };

  const repo: MediaRepository = {
    get: async (id) => structuredClone(records.get(id)),
    async createPending(media) {
      records.set(media.id, structuredClone(media));
    },
    async attach(args) {
      attachCalls.push(structuredClone(args));
      const scripted = attachScript.shift();
      return scripted ? scripted(args) : naturalAttach(args);
    },
    async detach(args) {
      detachCalls.push(structuredClone(args));
      if (area.currentId(args.target.key, args.target.field) !== args.previous.id) return 'conflict';
      area.link(args.target.key, args.target.field, null);
      records.delete(args.previous.id);
      return 'detached';
    },
  };
  return { repo, records, attachCalls, detachCalls, attachScript };
}

/** Bucket em memória. `failRemove`: keys cujo `remove` falha (MID-11). */
function memoryStorage() {
  const files = new Map<string, InspectedFile>();
  const removed: string[] = [];
  const presigned: { key: string; contentType: string; maxBytes: number }[] = [];
  const failRemove = new Set<string>();
  const storage: MediaStorage = {
    async presignUpload(key, contentType, maxBytes) {
      presigned.push({ key, contentType, maxBytes });
      return { url: `${BASE}/`, fields: { key, 'Content-Type': contentType, Policy: 'p' } };
    },
    inspect: async (key) => structuredClone(files.get(key)),
    async copy(fromKey, toKey) {
      const file = files.get(fromKey);
      if (!file) throw new Error(`no such key: ${fromKey}`);
      files.set(toKey, { ...file });
    },
    async remove(key) {
      if (failRemove.has(key)) throw new Error('S3 down');
      removed.push(key);
      files.delete(key);
    },
    publicUrl: (key) => `${BASE}/${key}`,
  };
  return { storage, files, removed, presigned, failRemove };
}

function setup() {
  const clock = { now: new Date('2026-11-10T12:00:00.000Z') };
  const area = memoryArea();
  const db = memoryMediaRepo(area);
  const bucket = memoryStorage();
  const media = createMediaService({ repo: db.repo, storage: bucket.storage, now: () => clock.now });
  const avatarOf = (userId: string) => area.target({ PK: `USER#${userId}`, SK: 'META' }, 'avatar');
  const groupSlot = (field: 'logo' | 'cover') => area.target({ PK: `GROUP#${GROUP}`, SK: 'META' }, field);

  /** Pede o envio e coloca no `tmp/` um arquivo que passa na política (o `file` sobrescreve o que for dado). */
  const uploaded = async (
    purpose: MediaPurpose = 'avatar',
    ownerId: string = USER,
    file: Partial<InspectedFile> = {},
  ) => {
    const upload = await media.requestUpload({
      purpose,
      ownerId,
      uploadedBy: USER,
      contentType: 'image/webp',
    });
    const policy = MEDIA_PURPOSES[purpose];
    bucket.files.set(`tmp/${upload.mediaId}`, {
      size: 50_000,
      format: 'image/webp',
      width: policy.width,
      height: policy.height,
      ...file,
    });
    return upload;
  };

  /** Confirma a foto de perfil do USER. */
  const attachAvatar = (mediaId: string) =>
    media.attach({ mediaId, purpose: 'avatar', ownerId: USER, target: avatarOf(USER) });

  const userItem = () => area.item({ PK: `USER#${USER}`, SK: 'META' });

  return { clock, area, db, bucket, media, avatarOf, groupSlot, uploaded, attachAvatar, userItem };
}

async function expectAppError(p: Promise<unknown>, code: ErrorCode, status: number): Promise<AppError> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({ code, status });
  return err as AppError;
}

/** Espia os dois canais de log: a regra pede "fica no log", sem dizer o nível. */
function spyLogs() {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  return { logged: () => warn.mock.calls.length + error.mock.calls.length };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mídia: quem decide (MID-01) e política (MID-02)', () => {
  it('MID-01: a mídia não confere permissão: grava quem a área mandou como `uploadedBy`, mesmo não sendo o dono', async () => {
    const t = setup();
    const upload = await t.media.requestUpload({
      purpose: 'group.logo',
      ownerId: GROUP,
      uploadedBy: OTHER_USER,
      contentType: 'image/webp',
    });
    expect(t.db.records.get(upload.mediaId)).toMatchObject({ ownerId: GROUP, uploadedBy: OTHER_USER });
  });

  it.each([
    ['avatar', 'user', 512, 512],
    ['group.logo', 'group', 512, 512],
    ['group.cover', 'group', 1600, 600],
  ] as const)(
    'MID-02: %s → dono %s, %i×%i, até 2 MB, no pedido e no POST assinado',
    async (purpose, ownerType, width, height) => {
      const t = setup();
      const ownerId = ownerType === 'user' ? USER : GROUP;
      const upload = await t.media.requestUpload({
        purpose,
        ownerId,
        uploadedBy: USER,
        contentType: 'image/webp',
      });
      expect(upload).toMatchObject({ maxBytes: 2 * 1024 * 1024, width, height });
      expect(t.bucket.presigned).toEqual([
        { key: `tmp/${upload.mediaId}`, contentType: 'image/webp', maxBytes: 2 * 1024 * 1024 },
      ]);
      expect(t.db.records.get(upload.mediaId)).toMatchObject({ kind: 'image', purpose, ownerType, ownerId });
    },
  );
});

describe('mídia: pedir o envio (MID-04, MID-13)', () => {
  it('MID-04: registra a mídia pendente e devolve o POST assinado para a área temporária, com o nome escolhido pela api', async () => {
    const t = setup();
    const upload = await t.media.requestUpload({
      purpose: 'avatar',
      ownerId: USER,
      uploadedBy: USER,
      contentType: 'image/webp',
    });
    expect(upload.url).toBe(`${BASE}/`);
    expect(upload.fields).toMatchObject({ key: `tmp/${upload.mediaId}`, 'Content-Type': 'image/webp' });
    expect(t.db.records.get(upload.mediaId)).toMatchObject({
      id: upload.mediaId,
      status: 'pending',
      key: `tmp/${upload.mediaId}`,
      uploadedBy: USER,
      createdAt: t.clock.now.toISOString(),
    });
  });

  it('MID-04: dois pedidos → duas mídias, com ids e keys diferentes', async () => {
    const t = setup();
    const a = await t.uploaded();
    const b = await t.uploaded();
    expect(a.mediaId).not.toBe(b.mediaId);
    expect(t.bucket.presigned.map((p) => p.key)).toEqual([`tmp/${a.mediaId}`, `tmp/${b.mediaId}`]);
  });

  it('MID-04: confirmar dentro de 1 hora funciona; depois de 1 hora (mesmo com o item ainda no banco) → MEDIA_NOT_FOUND', async () => {
    const t = setup();
    const fresh = await t.uploaded();
    const stale = await t.uploaded();
    t.clock.now = new Date(t.clock.now.getTime() + 59 * MINUTE);
    await t.attachAvatar(fresh.mediaId);
    t.clock.now = new Date(t.clock.now.getTime() + 2 * MINUTE);
    await expectAppError(t.attachAvatar(stale.mediaId), 'MEDIA_NOT_FOUND', 404);
    expect(t.userItem().avatarMediaId).toBe(fresh.mediaId);
  });

  it('MID-13: a mídia pendente vence pelo TTL: `expiresAt` = criação + 1 h, e o arquivo fica no `tmp/`', async () => {
    const t = setup();
    const upload = await t.uploaded();
    const record = t.db.records.get(upload.mediaId);
    expect(record?.key).toBe(`tmp/${upload.mediaId}`);
    expect(record?.expiresAt).toBe(new Date(t.clock.now.getTime() + HOUR).toISOString());
  });
});

describe('mídia: confirmar (MID-05 a MID-07)', () => {
  it('MID-05: arquivo não enviado → MEDIA_NOT_UPLOADED e nada muda', async () => {
    const t = setup();
    const upload = await t.media.requestUpload({
      purpose: 'avatar',
      ownerId: USER,
      uploadedBy: USER,
      contentType: 'image/webp',
    });
    await expectAppError(t.attachAvatar(upload.mediaId), 'MEDIA_NOT_UPLOADED', 404);
    expect(t.db.attachCalls).toEqual([]);
    expect(t.db.records.get(upload.mediaId)?.status).toBe('pending');
    expect(t.userItem()).toEqual({});
  });

  it.each([
    ['formato que não é aceito', { format: undefined }],
    ['peso acima de 2 MB', { size: 2 * 1024 * 1024 + 1 }],
    ['largura diferente (511×512)', { width: 511 }],
    ['altura diferente (512×513)', { height: 513 }],
    ['maior que o tamanho final (1024×1024)', { width: 1024, height: 1024 }],
  ] as const)(
    'MID-05: arquivo com %s → MEDIA_INVALID { maxBytes, width, height }, o arquivo é apagado e nada muda',
    async (_label, file) => {
      const t = setup();
      const upload = await t.uploaded('avatar', USER, file);
      const err = await expectAppError(t.attachAvatar(upload.mediaId), 'MEDIA_INVALID', 422);
      expect(err.details).toEqual({ maxBytes: 2 * 1024 * 1024, width: 512, height: 512 });
      expect(t.bucket.files.has(`tmp/${upload.mediaId}`)).toBe(false);
      expect(t.db.attachCalls).toEqual([]);
      expect(t.userItem()).toEqual({});
    },
  );

  it('MID-05: a capa confere 1600×600; um quadrado 512×512 reprova com os números da capa', async () => {
    const t = setup();
    const upload = await t.uploaded('group.cover', GROUP, { width: 512, height: 512 });
    const err = await expectAppError(
      t.media.attach({
        mediaId: upload.mediaId,
        purpose: 'group.cover',
        ownerId: GROUP,
        target: t.groupSlot('cover'),
      }),
      'MEDIA_INVALID',
      422,
    );
    expect(err.details).toEqual({ maxBytes: 2 * 1024 * 1024, width: 1600, height: 600 });
  });

  it('MID-05: peso exatamente igual ao máximo é aceito', async () => {
    const t = setup();
    const upload = await t.uploaded('avatar', USER, { size: 2 * 1024 * 1024 });
    await t.attachAvatar(upload.mediaId);
    expect(t.userItem().avatarMediaId).toBe(upload.mediaId);
  });

  it('MID-05: vale o formato lido do arquivo, não o declarado no pedido (pediu WebP, chegou PNG → grava PNG)', async () => {
    const t = setup();
    const upload = await t.uploaded('avatar', USER, { format: 'image/png' });
    await t.attachAvatar(upload.mediaId);
    const record = t.db.records.get(upload.mediaId);
    expect(record?.contentType).toBe('image/png');
    expect(record?.key).toBe(`public/user/${USER}/avatar/${upload.mediaId}.png`);
  });

  it('MID-05: de outro dono, de outra finalidade ou inexistente → o mesmo MEDIA_NOT_FOUND, sem dizer qual foi', async () => {
    const t = setup();
    const avatar = await t.uploaded('avatar', USER);
    const logo = await t.uploaded('group.logo', GROUP);
    const otherOwner = await expectAppError(
      t.media.attach({
        mediaId: avatar.mediaId,
        purpose: 'avatar',
        ownerId: OTHER_USER,
        target: t.avatarOf(OTHER_USER),
      }),
      'MEDIA_NOT_FOUND',
      404,
    );
    const otherPurpose = await expectAppError(
      t.media.attach({
        mediaId: logo.mediaId,
        purpose: 'group.cover',
        ownerId: GROUP,
        target: t.groupSlot('cover'),
      }),
      'MEDIA_NOT_FOUND',
      404,
    );
    const missing = await expectAppError(t.attachAvatar(randomUUID()), 'MEDIA_NOT_FOUND', 404);
    const shape = (e: AppError) => ({
      code: e.code,
      status: e.status,
      message: e.message,
      details: e.details,
    });
    expect(shape(otherPurpose)).toEqual(shape(otherOwner));
    expect(shape(missing)).toEqual(shape(otherOwner));
    expect(t.db.attachCalls).toEqual([]);
    expect(t.area.item({ PK: `USER#${OTHER_USER}`, SK: 'META' })).toEqual({});
  });

  it('MID-06: confirmar grava formato, peso, dimensões e quem enviou; a mídia fica pronta, sem vencimento', async () => {
    const t = setup();
    const upload = await t.uploaded('avatar', USER, { size: 123_456 });
    await t.attachAvatar(upload.mediaId);
    const record = t.db.records.get(upload.mediaId);
    expect(record).toMatchObject({
      id: upload.mediaId,
      kind: 'image',
      purpose: 'avatar',
      ownerType: 'user',
      ownerId: USER,
      status: 'ready',
      key: `public/user/${USER}/avatar/${upload.mediaId}.webp`,
      contentType: 'image/webp',
      size: 123_456,
      width: 512,
      height: 512,
      uploadedBy: USER,
    });
    expect(record?.expiresAt).toBeUndefined();
  });

  it('MID-06: confirmar liga a mídia na área (id e URL pública) e devolve a URL', async () => {
    const t = setup();
    const upload = await t.uploaded('group.cover', GROUP);
    const { url } = await t.media.attach({
      mediaId: upload.mediaId,
      purpose: 'group.cover',
      ownerId: GROUP,
      target: t.groupSlot('cover'),
    });
    const key = `public/group/${GROUP}/group.cover/${upload.mediaId}.webp`;
    expect(url).toBe(`${BASE}/${key}`);
    expect(t.bucket.files.has(key)).toBe(true);
    expect(t.area.item({ PK: `GROUP#${GROUP}`, SK: 'META' })).toEqual({
      coverMediaId: upload.mediaId,
      coverUrl: url,
    });
  });

  it('MID-07: confirmar de novo a mídia já pronta e ligada → mesma URL, sem gravar nem apagar nada', async () => {
    const t = setup();
    const upload = await t.uploaded();
    const first = await t.attachAvatar(upload.mediaId);
    const callsBefore = t.db.attachCalls.length;
    const removedBefore = [...t.bucket.removed];
    const again = await t.attachAvatar(upload.mediaId);
    expect(again.url).toBe(first.url);
    expect(t.db.attachCalls).toHaveLength(callsBefore);
    expect(t.bucket.removed).toEqual(removedBefore);
    expect(t.db.records.get(upload.mediaId)?.status).toBe('ready');
    expect(t.userItem()).toEqual({ avatarMediaId: upload.mediaId, avatarUrl: first.url });
  });

  it('MID-07: duas confirmações da mesma mídia ao mesmo tempo → mesma URL, mídia pronta e ligada, arquivo no ar', async () => {
    const t = setup();
    const upload = await t.uploaded();
    const [a, b] = await Promise.all([t.attachAvatar(upload.mediaId), t.attachAvatar(upload.mediaId)]);
    expect(b.url).toBe(a.url);
    expect(t.userItem()).toEqual({ avatarMediaId: upload.mediaId, avatarUrl: a.url });
    const record = t.db.records.get(upload.mediaId);
    expect(record?.status).toBe('ready');
    expect(record?.key.startsWith('public/')).toBe(true);
    expect(t.bucket.files.has(record?.key ?? '')).toBe(true);
  });
});

describe('mídia: trocar e remover (MID-08 a MID-11)', () => {
  it('MID-08: a transação recebe a nova pronta, a área e a antiga lida, tudo de uma vez', async () => {
    const t = setup();
    const old = await t.uploaded();
    await t.attachAvatar(old.mediaId);
    const next = await t.uploaded();
    await t.attachAvatar(next.mediaId);
    const last = t.db.attachCalls.at(-1);
    expect(last?.ready).toMatchObject({ id: next.mediaId, status: 'ready' });
    expect(last?.target).toMatchObject({ key: { PK: `USER#${USER}`, SK: 'META' }, field: 'avatar' });
    expect(last?.previous?.id).toBe(old.mediaId);
  });

  it('MID-08: a transação falha → nada muda no banco: a antiga continua ligada e a nova continua pendente', async () => {
    const t = setup();
    const old = await t.uploaded();
    const { url: oldUrl } = await t.attachAvatar(old.mediaId);
    const next = await t.uploaded();
    t.db.attachScript.push(async () => {
      throw new Error('TransactionCanceledException');
    });
    await expect(t.attachAvatar(next.mediaId)).rejects.toThrow();
    expect(t.userItem()).toEqual({ avatarMediaId: old.mediaId, avatarUrl: oldUrl });
    expect(t.db.records.get(old.mediaId)?.status).toBe('ready');
    expect(t.db.records.get(next.mediaId)?.status).toBe('pending');
  });

  it('MID-08: outra troca entrou antes (conflict) → relê a mídia ligada e tenta de novo com ela como antiga', async () => {
    const t = setup();
    const rival = await t.uploaded();
    const mine = await t.uploaded();
    t.db.attachScript.push(async () => {
      await t.attachAvatar(rival.mediaId);
      return 'conflict';
    });
    const readsBefore = t.area.reads.count;
    const { url } = await t.attachAvatar(mine.mediaId);
    expect(t.area.reads.count - readsBefore).toBeGreaterThanOrEqual(2);
    expect(t.db.attachCalls.at(-1)?.previous?.id).toBe(rival.mediaId);
    expect(t.userItem()).toEqual({ avatarMediaId: mine.mediaId, avatarUrl: url });
    expect(t.db.records.has(rival.mediaId)).toBe(false);
  });

  it('MID-08: duas trocas ao mesmo tempo → só uma fica ligada e pronta; a outra não sobra no banco', async () => {
    const t = setup();
    const a = await t.uploaded();
    const b = await t.uploaded();
    await Promise.all([t.attachAvatar(a.mediaId), t.attachAvatar(b.mediaId)]);
    const linked = t.userItem().avatarMediaId as string;
    expect([a.mediaId, b.mediaId]).toContain(linked);
    const ready = [...t.db.records.values()].filter((m) => m.ownerId === USER && m.status === 'ready');
    expect(ready.map((m) => m.id)).toEqual([linked]);
    expect(t.userItem().avatarUrl).toBe(`${BASE}/${ready[0]?.key}`);
  });

  it('MID-09: trocar apaga a antiga do banco e do S3; a nova fica', async () => {
    const t = setup();
    const old = await t.uploaded();
    await t.attachAvatar(old.mediaId);
    const oldKey = t.db.records.get(old.mediaId)?.key ?? '';
    const next = await t.uploaded();
    await t.attachAvatar(next.mediaId);
    const newKey = t.db.records.get(next.mediaId)?.key ?? '';
    expect(t.db.records.has(old.mediaId)).toBe(false);
    expect(t.bucket.removed).toContain(oldKey);
    expect(t.bucket.files.has(oldKey)).toBe(false);
    expect(t.bucket.files.has(newKey)).toBe(true);
    expect(t.userItem().avatarMediaId).toBe(next.mediaId);
  });

  it('MID-10: remover desliga da área e apaga a mídia do banco e do S3', async () => {
    const t = setup();
    const upload = await t.uploaded('group.logo', GROUP);
    await t.media.attach({
      mediaId: upload.mediaId,
      purpose: 'group.logo',
      ownerId: GROUP,
      target: t.groupSlot('logo'),
    });
    const key = t.db.records.get(upload.mediaId)?.key ?? '';
    await t.media.detach({ purpose: 'group.logo', ownerId: GROUP, target: t.groupSlot('logo') });
    expect(t.area.item({ PK: `GROUP#${GROUP}`, SK: 'META' })).toEqual({});
    expect(t.db.records.has(upload.mediaId)).toBe(false);
    expect(t.bucket.removed).toContain(key);
    expect(t.bucket.files.has(key)).toBe(false);
  });

  it('MID-10: remover sem mídia ligada → nada a fazer', async () => {
    const t = setup();
    await t.media.detach({ purpose: 'avatar', ownerId: USER, target: t.avatarOf(USER) });
    expect(t.db.detachCalls).toEqual([]);
    expect(t.bucket.removed).toEqual([]);
    expect(t.userItem()).toEqual({});
  });

  it('MID-10: remover o logo não mexe na capa do mesmo grupo', async () => {
    const t = setup();
    const logo = await t.uploaded('group.logo', GROUP);
    const cover = await t.uploaded('group.cover', GROUP);
    await t.media.attach({
      mediaId: logo.mediaId,
      purpose: 'group.logo',
      ownerId: GROUP,
      target: t.groupSlot('logo'),
    });
    const { url } = await t.media.attach({
      mediaId: cover.mediaId,
      purpose: 'group.cover',
      ownerId: GROUP,
      target: t.groupSlot('cover'),
    });
    await t.media.detach({ purpose: 'group.logo', ownerId: GROUP, target: t.groupSlot('logo') });
    expect(t.area.item({ PK: `GROUP#${GROUP}`, SK: 'META' })).toEqual({
      coverMediaId: cover.mediaId,
      coverUrl: url,
    });
    expect(t.db.records.get(cover.mediaId)?.status).toBe('ready');
  });

  it('MID-11: apagar o arquivo antigo no S3 falha → a troca continua valendo e a falha vai para o log', async () => {
    const logs = spyLogs();
    const t = setup();
    const old = await t.uploaded();
    await t.attachAvatar(old.mediaId);
    t.bucket.failRemove.add(t.db.records.get(old.mediaId)?.key ?? '');
    const next = await t.uploaded();
    const { url } = await t.attachAvatar(next.mediaId);
    expect(t.userItem()).toEqual({ avatarMediaId: next.mediaId, avatarUrl: url });
    expect(t.db.records.has(old.mediaId)).toBe(false);
    expect(logs.logged()).toBeGreaterThan(0);
  });

  it('MID-11: apagar o arquivo no S3 falha ao remover → a remoção continua valendo e a falha vai para o log', async () => {
    const logs = spyLogs();
    const t = setup();
    const upload = await t.uploaded();
    await t.attachAvatar(upload.mediaId);
    t.bucket.failRemove.add(t.db.records.get(upload.mediaId)?.key ?? '');
    await t.media.detach({ purpose: 'avatar', ownerId: USER, target: t.avatarOf(USER) });
    expect(t.userItem()).toEqual({});
    expect(t.db.records.has(upload.mediaId)).toBe(false);
    expect(logs.logged()).toBeGreaterThan(0);
  });

  it('MID-10: dois pedidos de remover ao mesmo tempo → os dois resolvem; a área fica vazia e a mídia sai do banco', async () => {
    const t = setup();
    const upload = await t.uploaded();
    await t.attachAvatar(upload.mediaId);
    const remove = () => t.media.detach({ purpose: 'avatar', ownerId: USER, target: t.avatarOf(USER) });
    await expect(Promise.all([remove(), remove()])).resolves.toEqual([undefined, undefined]);
    expect(t.userItem()).toEqual({});
    expect(t.db.records.has(upload.mediaId)).toBe(false);
  });

  it('MID-10: o segundo remover leu a área antes do primeiro gravar e só acha a mídia depois de apagada → resolve sem erro', async () => {
    const t = setup();
    const upload = await t.uploaded();
    await t.attachAvatar(upload.mediaId);
    // Intercala as duas remoções: a 2ª leitura da mídia espera a transação da 1ª terminar.
    const gate: { open: () => void } = { open: () => undefined };
    const firstDetach = {
      promise: new Promise<void>((resolve) => {
        gate.open = resolve;
      }),
      resolve: () => gate.open(),
    };
    const { get, detach } = t.db.repo;
    const gets = { count: 0 };
    t.db.repo.get = async (id) => {
      gets.count += 1;
      if (gets.count === 2) await firstDetach.promise;
      return get(id);
    };
    t.db.repo.detach = async (args) => {
      const result = await detach(args);
      firstDetach.resolve();
      return result;
    };
    const remove = () => t.media.detach({ purpose: 'avatar', ownerId: USER, target: t.avatarOf(USER) });
    await expect(Promise.all([remove(), remove()])).resolves.toEqual([undefined, undefined]);
    expect(t.userItem()).toEqual({});
    expect(t.db.records.has(upload.mediaId)).toBe(false);
  });
});

describe('mídia: acesso (MID-12)', () => {
  it('MID-12: a URL é a pública, dentro de `public/`', async () => {
    const t = setup();
    const upload = await t.uploaded();
    const { url } = await t.attachAvatar(upload.mediaId);
    expect(url.startsWith(`${BASE}/public/`)).toBe(true);
  });

  it('MID-12: cada troca gera uma URL nova', async () => {
    const t = setup();
    const a = await t.uploaded();
    const b = await t.uploaded();
    const first = await t.attachAvatar(a.mediaId);
    const second = await t.attachAvatar(b.mediaId);
    expect(second.url).not.toBe(first.url);
  });

  it('MID-12: o caminho público usa o `ownerRef` do pedido (id público da pessoa), não o `ownerId`', async () => {
    const t = setup();
    const ownerRef = '7K3QX9TA';
    const upload = await t.media.requestUpload({
      purpose: 'avatar',
      ownerId: USER,
      ownerRef,
      uploadedBy: USER,
      contentType: 'image/webp',
    });
    t.bucket.files.set(`tmp/${upload.mediaId}`, {
      size: 50_000,
      format: 'image/webp',
      width: 512,
      height: 512,
    });
    const { url } = await t.attachAvatar(upload.mediaId);
    expect(url).toBe(`${BASE}/public/user/${ownerRef}/avatar/${upload.mediaId}.webp`);
    expect(url).not.toContain(USER);
    expect(t.db.records.get(upload.mediaId)).toMatchObject({ ownerId: USER, ownerRef });
  });

  it('MID-12: sem `ownerRef`, o caminho usa o `ownerId` (o id do grupo)', async () => {
    const t = setup();
    const upload = await t.uploaded('group.logo', GROUP);
    const { url } = await t.media.attach({
      mediaId: upload.mediaId,
      purpose: 'group.logo',
      ownerId: GROUP,
      target: t.groupSlot('logo'),
    });
    expect(url.startsWith(`${BASE}/public/group/${GROUP}/group.logo/`)).toBe(true);
  });
});
