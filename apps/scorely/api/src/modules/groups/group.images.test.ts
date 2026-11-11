import { randomUUID } from 'node:crypto';
import { type ErrorCode, type GroupImageSlot, MEDIA_PURPOSES, type MemberRole } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/errors';
import type { MediaService } from '../media/media.service';
import { createGroupImages } from './group.images';
import type { GroupRepository, StoredGroup } from './group.repository';
import { groupKey } from './group.table';
import type { GroupsDeps } from './groups.deps';

// GRP-35 (docs/modules/grupos.md) e MID-01 (docs/modules/midia.md): só o dono troca e remove o logo e a capa,
// conferido nos dois passos. A mídia é um dublê que grava `<slot>MediaId`/`<slot>Url` no item do grupo, como a
// transação dela faria (MID-08); as regras do arquivo ficam em media/media.service.test.ts.

const OWNER = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
const R = '88888888-8888-4888-8888-888888888888';
const OUTSIDER = '66666666-6666-4666-8666-666666666666';
const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BASE = 'https://uploads.test';

const PURPOSE = { logo: 'group.logo', cover: 'group.cover' } as const;
const SLOTS: GroupImageSlot[] = ['logo', 'cover'];

type MediaCall<K extends keyof MediaService> = Parameters<MediaService[K]>[0];
type Row = StoredGroup & Record<string, unknown>;

/** Objeto que só tem o que o teste usa: qualquer outro método falha alto (a área de imagens não deveria usá-lo). */
function only<T>(impl: Partial<T>, name: string): T {
  return new Proxy(impl as object, {
    get(target, prop) {
      if (prop in target) return (target as Record<PropertyKey, unknown>)[prop];
      if (prop === 'then') return undefined;
      return () => {
        throw new Error(`${name}.${String(prop)} not expected in group images`);
      };
    },
  }) as T;
}

function setup() {
  const clock = { now: new Date('2026-11-10T12:00:00.000Z') };
  const group: Row = {
    id: GROUP_ID,
    createdAt: '2026-11-01T12:00:00.000Z',
    name: 'Vôlei de sexta',
    sport: 'volleyball',
    weekday: 5,
    time: '19:00',
    timeZone: 'America/Sao_Paulo',
    maxMembers: 30,
    maxReserves: 30,
    slots: 12,
    listOpensHoursBefore: 48,
    reservesOpenHoursBefore: 24,
    ownerId: OWNER,
    inviteToken: 'member-token',
    reserveInviteToken: 'reserve-token',
    guestToken: 'guest-token',
  };
  const store = { group };
  const roles = new Map<string, MemberRole>([
    [OWNER, 'member'],
    [A, 'member'],
    [R, 'reserve'],
  ]);

  const groups = only<GroupRepository>(
    {
      get: async (id: string) => (id === GROUP_ID ? structuredClone(store.group) : undefined),
      roleOf: async (groupId: string, userId: string) =>
        groupId === GROUP_ID ? roles.get(userId) : undefined,
    },
    'groups',
  );

  /** O que a transação da mídia grava no item do grupo. */
  const link = (
    key: { PK: string; SK: string },
    field: string,
    value: { mediaId: string; url: string } | null,
  ) => {
    expect(key).toEqual(groupKey(GROUP_ID));
    const next: Row = { ...store.group };
    if (value) {
      next[`${field}MediaId`] = value.mediaId;
      next[`${field}Url`] = value.url;
    } else {
      delete next[`${field}MediaId`];
      delete next[`${field}Url`];
    }
    store.group = next;
  };

  const calls = {
    requestUpload: [] as MediaCall<'requestUpload'>[],
    attach: [] as (MediaCall<'attach'> & { current: string | undefined })[],
    detach: [] as (MediaCall<'detach'> & { current: string | undefined })[],
  };
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
      const url = `${BASE}/public/group/${input.ownerId}/${input.purpose}/${input.mediaId}.webp`;
      link(input.target.key, input.target.field, { mediaId: input.mediaId, url });
      return { url };
    },
    async detach(input) {
      const current = await input.target.readCurrent();
      calls.detach.push({ ...input, current });
      if (current) link(input.target.key, input.target.field, null);
    },
  };

  const deps: GroupsDeps & { media: MediaService } = {
    groups,
    games: only<GroupsDeps['games']>({}, 'games'),
    users: only<GroupsDeps['users']>({}, 'users'),
    notifications: only<GroupsDeps['notifications']>({}, 'notifications'),
    now: () => clock.now,
    media,
  };
  const images = createGroupImages(deps);
  const mediaCalls = () => calls.requestUpload.length + calls.attach.length + calls.detach.length;
  return { images, store, calls, mediaCalls, clock };
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

describe('grupos: logo e capa (GRP-35)', () => {
  it.each(SLOTS)(
    'GRP-35: o dono pede o envio do %s → mídia da finalidade certa, com o grupo como dono',
    async (slot) => {
      const t = setup();
      const upload = await t.images.requestUpload(OWNER, GROUP_ID, slot, { contentType: 'image/webp' });
      expect(t.calls.requestUpload).toEqual([
        { purpose: PURPOSE[slot], ownerId: GROUP_ID, uploadedBy: OWNER, contentType: 'image/webp' },
      ]);
      const policy = MEDIA_PURPOSES[PURPOSE[slot]];
      expect(upload).toMatchObject({ width: policy.width, height: policy.height, maxBytes: 2 * 1024 * 1024 });
    },
  );

  it('GRP-35: o logo é 512×512 e a capa 1600×600', async () => {
    const t = setup();
    const logo = await t.images.requestUpload(OWNER, GROUP_ID, 'logo', { contentType: 'image/webp' });
    const cover = await t.images.requestUpload(OWNER, GROUP_ID, 'cover', { contentType: 'image/webp' });
    expect(logo).toMatchObject({ width: 512, height: 512 });
    expect(cover).toMatchObject({ width: 1600, height: 600 });
  });

  it.each(SLOTS)(
    'GRP-35: o dono confirma o %s → ligado no item do grupo e devolvido no Group, sem o id da mídia',
    async (slot) => {
      const t = setup();
      const mediaId = randomUUID();
      const group = await t.images.attach(OWNER, GROUP_ID, slot, { mediaId });
      expect(t.calls.attach).toHaveLength(1);
      expect(t.calls.attach[0]).toMatchObject({ mediaId, purpose: PURPOSE[slot], ownerId: GROUP_ID });
      expect(t.calls.attach[0]?.target).toMatchObject({ key: groupKey(GROUP_ID), field: slot });
      const url = `${BASE}/public/group/${GROUP_ID}/${PURPOSE[slot]}/${mediaId}.webp`;
      expect(group).toMatchObject({ id: GROUP_ID, [`${slot}Url`]: url });
      expect(group).not.toHaveProperty(`${slot}MediaId`);
    },
  );

  it('GRP-35: trocar o logo → a mídia recebe o id do logo ligado agora, e a capa fica como está', async () => {
    const t = setup();
    const firstLogo = randomUUID();
    const cover = randomUUID();
    await t.images.attach(OWNER, GROUP_ID, 'logo', { mediaId: firstLogo });
    const withCover = await t.images.attach(OWNER, GROUP_ID, 'cover', { mediaId: cover });
    const group = await t.images.attach(OWNER, GROUP_ID, 'logo', { mediaId: randomUUID() });
    expect(t.calls.attach.map((c) => c.current)).toEqual([undefined, undefined, firstLogo]);
    expect(group.coverUrl).toBe(withCover.coverUrl);
  });

  it.each(SLOTS)('GRP-35: o dono remove o %s → a mídia desliga e o Group volta sem a URL', async (slot) => {
    const t = setup();
    const mediaId = randomUUID();
    await t.images.attach(OWNER, GROUP_ID, slot, { mediaId });
    const group = await t.images.detach(OWNER, GROUP_ID, slot);
    expect(t.calls.detach).toHaveLength(1);
    expect(t.calls.detach[0]).toMatchObject({ purpose: PURPOSE[slot], ownerId: GROUP_ID, current: mediaId });
    expect(t.calls.detach[0]?.target).toMatchObject({ key: groupKey(GROUP_ID), field: slot });
    expect(group).not.toHaveProperty(`${slot}Url`);
    expect(group).not.toHaveProperty(`${slot}MediaId`);
  });

  it.each([
    ['membro', A],
    ['reserva', R],
  ])(
    'GRP-35: %s não é dono → GROUP_NOT_OWNER ao pedir o envio, ao confirmar e ao remover, sem chamar a mídia',
    async (_label, who) => {
      const t = setup();
      await expectAppError(
        t.images.requestUpload(who, GROUP_ID, 'logo', { contentType: 'image/webp' }),
        'GROUP_NOT_OWNER',
        403,
      );
      await expectAppError(
        t.images.attach(who, GROUP_ID, 'cover', { mediaId: randomUUID() }),
        'GROUP_NOT_OWNER',
        403,
      );
      await expectAppError(t.images.detach(who, GROUP_ID, 'logo'), 'GROUP_NOT_OWNER', 403);
      expect(t.mediaCalls()).toBe(0);
    },
  );

  it('GRP-35: quem não participa (ou grupo inexistente) → GROUP_NOT_FOUND, sem chamar a mídia', async () => {
    const t = setup();
    await expectAppError(
      t.images.requestUpload(OUTSIDER, GROUP_ID, 'logo', { contentType: 'image/webp' }),
      'GROUP_NOT_FOUND',
      404,
    );
    await expectAppError(
      t.images.attach(OWNER, randomUUID(), 'logo', { mediaId: randomUUID() }),
      'GROUP_NOT_FOUND',
      404,
    );
    expect(t.mediaCalls()).toBe(0);
  });

  it('MID-01: a permissão é conferida de novo ao confirmar: quem deixou de ser dono no meio do envio recebe GROUP_NOT_OWNER', async () => {
    const t = setup();
    const upload = await t.images.requestUpload(OWNER, GROUP_ID, 'logo', { contentType: 'image/webp' });
    t.store.group = { ...t.store.group, ownerId: A };
    await expectAppError(
      t.images.attach(OWNER, GROUP_ID, 'logo', { mediaId: upload.mediaId }),
      'GROUP_NOT_OWNER',
      403,
    );
    expect(t.calls.attach).toEqual([]);
  });

  it('GRP-35: grupo arquivado → trocar e remover respondem GROUP_ARCHIVED, sem chamar a mídia', async () => {
    const t = setup();
    const { inviteToken: _i, reserveInviteToken: _r, guestToken: _g, ...rest } = t.store.group;
    t.store.group = { ...rest, archivedAt: '2026-11-09T12:00:00.000Z' } as Row;
    await expectAppError(
      t.images.attach(OWNER, GROUP_ID, 'logo', { mediaId: randomUUID() }),
      'GROUP_ARCHIVED',
      409,
    );
    await expectAppError(t.images.detach(OWNER, GROUP_ID, 'cover'), 'GROUP_ARCHIVED', 409);
    expect(t.calls.attach).toEqual([]);
    expect(t.calls.detach).toEqual([]);
  });

  it('GRP-35: grupo arquivado → pedir o envio também responde GROUP_ARCHIVED, sem chamar a mídia', async () => {
    const t = setup();
    const { inviteToken: _i, reserveInviteToken: _r, guestToken: _g, ...rest } = t.store.group;
    t.store.group = { ...rest, archivedAt: '2026-11-09T12:00:00.000Z' } as Row;
    await expectAppError(
      t.images.requestUpload(OWNER, GROUP_ID, 'logo', { contentType: 'image/webp' }),
      'GROUP_ARCHIVED',
      409,
    );
    expect(t.mediaCalls()).toBe(0);
  });
});
