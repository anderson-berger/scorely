import { AppError } from '@scorely/api/src/lib/errors';
import type { InspectedFile, MediaStorage } from '@scorely/api/src/lib/storage';
import type { MediaRepository } from '@scorely/api/src/modules/media/data/media.repository';
import type { MediaRecord } from '@scorely/api/src/modules/media/data/media.table';
import type { MediaTarget } from '@scorely/api/src/modules/media/media.access';
import { createMediaService } from '@scorely/api/src/modules/media/media.service';
import { type ErrorCode, MEDIA_PURPOSES, type MediaPurpose } from '@scorely/contracts';
import { expect, vi } from 'vitest';

// O setup único da mídia (ADR 0021): relógio fake, a área (usuário, grupo), o repositório e o bucket em memória.

export const USER = '11111111-1111-4111-8111-111111111111';
export const OTHER_USER = '22222222-2222-4222-8222-222222222222';
export const GROUP = '33333333-3333-4333-8333-333333333333';
export const BASE = 'https://uploads.test';
export const HOUR = 60 * 60 * 1000;
export const MINUTE = 60 * 1000;

export type AttachArgs = Parameters<MediaRepository['attach']>[0];
export type DetachArgs = Parameters<MediaRepository['detach']>[0];
export type AttachResult = Awaited<ReturnType<MediaRepository['attach']>>;
export type Field = MediaTarget['field'];
export type ItemKey = MediaTarget['key'];

/** Itens da área (usuário, grupo) em memória: só o campo `<field>MediaId` que a mídia grava (MID-12: nenhum item guarda URL). */
export function memoryArea() {
  const items = new Map<string, Record<string, unknown>>();
  const id = (key: ItemKey) => `${key.PK}|${key.SK}`;
  const item = (key: ItemKey) => items.get(id(key)) ?? {};
  const reads = { count: 0 };
  /** O que a área faria na mesma transação da troca (MID-08): grava ou remove só o id da mídia. */
  const link = (key: ItemKey, field: Field, mediaId: string | null) => {
    const next = { ...item(key) };
    if (mediaId) next[`${field}MediaId`] = mediaId;
    else delete next[`${field}MediaId`];
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

export type Area = ReturnType<typeof memoryArea>;

/**
 * Repositório da mídia em memória. O `attach`/`detach` imita a transação (MID-08): a nova precisa estar pendente
 * e o id ligado na área precisa ser o `previous` lido; senão `conflict` e nada muda.
 * `attachScript`: respostas forçadas do `attach`, consumidas na ordem (vazia → comportamento normal).
 */
export function memoryMediaRepo(area: Area) {
  const records = new Map<string, MediaRecord>();
  const attachCalls: AttachArgs[] = [];
  const detachCalls: DetachArgs[] = [];
  const attachScript: ((args: AttachArgs) => Promise<AttachResult>)[] = [];

  const naturalAttach = ({ ready, target, previous }: AttachArgs): AttachResult => {
    if (records.get(ready.id)?.status !== 'pending') return 'conflict';
    if (area.currentId(target.key, target.field) !== previous?.id) return 'conflict';
    records.set(ready.id, structuredClone(ready));
    area.link(target.key, target.field, ready.id);
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
export function memoryStorage() {
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

export function setup() {
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

export async function expectAppError(
  p: Promise<unknown>,
  code: ErrorCode,
  status: number,
): Promise<AppError> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({ code, status });
  return err as AppError;
}

/** Espia os dois canais de log: a regra pede "fica no log", sem dizer o nível. */
export function spyLogs() {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  return { logged: () => warn.mock.calls.length + error.mock.calls.length };
}
