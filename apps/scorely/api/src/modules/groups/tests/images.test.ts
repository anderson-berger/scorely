import { randomUUID } from 'node:crypto';
import { memoryGroups } from '@scorely/api/src/modules/groups/data/groups.memory';
import type { GroupImagesDeps, GroupsDeps } from '@scorely/api/src/modules/groups/groups.service';
import { createGroup, getGroup, listMyGroups } from '@scorely/api/src/modules/groups/rules/groups';
import { attach, detach, requestUpload } from '@scorely/api/src/modules/groups/rules/images';
import {
  ANA,
  BIA,
  errorOf,
  noEmails,
  noNotifications,
  pid,
} from '@scorely/api/src/modules/groups/tests/fixtures';
import type { MediaService } from '@scorely/api/src/modules/media/media.service';
import { type GroupImageSlot, MEDIA_PURPOSES } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// GRV-09 e GRV-10 (docs/modules/grupos.md) e MID-01 (docs/modules/midia.md). A mídia é um dublê que, como a
// transação dela (MID-08), grava só o `<slot>MediaId` no META do grupo e soma 1 na `version`.

const NOW = new Date('2026-11-20T10:00:00.000Z');
const LATER = new Date('2026-11-21T10:00:00.000Z');
const BASE = 'https://uploads.test';
const CODE = 'K3X9PQ2A';
const PURPOSE = { logo: 'group.logo', cover: 'group.cover' } as const;
const SLOTS: GroupImageSlot[] = ['logo', 'cover'];

type MediaCall<K extends keyof MediaService> = Parameters<MediaService[K]>[0];

async function setup() {
  const mem = memoryGroups();
  const clock = { now: NOW };
  const urlOf = (purpose: string, mediaId: string) => `${BASE}/public/${purpose}/${mediaId}`;
  const calls = {
    requestUpload: [] as MediaCall<'requestUpload'>[],
    attach: [] as (MediaCall<'attach'> & { current: string | undefined })[],
    detach: [] as (MediaCall<'detach'> & { current: string | undefined })[],
  };
  const link = (key: { PK: string; SK: string }, field: string, mediaId: string | null) => {
    const id = key.PK.replace('GROUP#', '');
    const stored = mem.groups.get(id);
    if (!stored || key.SK !== 'META') throw new Error('unexpected target key');
    const { [`${field}MediaId`]: _old, ...rest } = stored as unknown as Record<string, unknown>;
    mem.groups.set(id, {
      ...rest,
      ...(mediaId ? { [`${field}MediaId`]: mediaId } : {}),
      version: stored.version + 1,
      updatedAt: clock.now.toISOString(),
    } as typeof stored);
  };
  const media: MediaService = {
    urlOf,
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
      if (current !== input.mediaId) link(input.target.key, input.target.field, input.mediaId);
      return { url: urlOf(input.purpose, input.mediaId) };
    },
    async detach(input) {
      const current = await input.target.readCurrent();
      calls.detach.push({ ...input, current });
      if (current) link(input.target.key, input.target.field, null);
    },
  };
  const deps: GroupsDeps = {
    groups: mem.repo,
    emails: noEmails,
    notifications: noNotifications,
    users: { getMany: async () => [], resolve: async () => new Map() },
    now: () => clock.now,
    newPublicId: () => pid(CODE),
    media,
  };
  const imageDeps: GroupImagesDeps = { groups: mem.repo, media, now: () => clock.now };
  const group = await createGroup(deps, ANA, { name: 'Pelada' });
  const uuid = [...mem.groups.keys()][0] as string;
  const mediaCalls = () => calls.requestUpload.length + calls.attach.length + calls.detach.length;
  return { ...mem, deps, imageDeps, group, uuid, calls, mediaCalls, clock };
}

describe('groups: logo e capa', () => {
  it.each(SLOTS)(
    'GRV-09: o dono pede o envio do %s → mídia da finalidade, com o uuid do grupo como dono',
    async (slot) => {
      const t = await setup();
      const upload = await requestUpload(t.imageDeps, ANA, pid(CODE), slot, { contentType: 'image/webp' });
      expect(t.calls.requestUpload).toEqual([
        { purpose: PURPOSE[slot], ownerId: t.uuid, uploadedBy: ANA, contentType: 'image/webp' },
      ]);
      expect(upload).toMatchObject({ maxBytes: 2 * 1024 * 1024 });
    },
  );

  it('GRV-09: o logo é 512×512 e a capa 1600×600', async () => {
    const t = await setup();
    const logo = await requestUpload(t.imageDeps, ANA, pid(CODE), 'logo', { contentType: 'image/webp' });
    const cover = await requestUpload(t.imageDeps, ANA, pid(CODE), 'cover', { contentType: 'image/webp' });
    expect(logo).toMatchObject({ width: 512, height: 512 });
    expect(cover).toMatchObject({ width: 1600, height: 600 });
  });

  it.each(SLOTS)('GRV-09: o dono confirma o %s → ligado no META do grupo (GROUP#<uuid>)', async (slot) => {
    const t = await setup();
    const mediaId = randomUUID();
    await attach(t.imageDeps, ANA, pid(CODE), slot, { mediaId });
    expect(t.calls.attach[0]).toMatchObject({ mediaId, purpose: PURPOSE[slot], ownerId: t.uuid });
    expect(t.calls.attach[0]?.target).toMatchObject({
      key: { PK: `GROUP#${t.uuid}`, SK: 'META' },
      field: slot,
    });
    expect(t.groups.get(t.uuid)).toMatchObject({ [`${slot}MediaId`]: mediaId });
  });

  it('GRV-09: trocar e remover somam 1 na version e gravam o updatedAt, sem a pessoa mandar a version', async () => {
    const t = await setup();
    t.clock.now = LATER;
    const attached = await attach(t.imageDeps, ANA, pid(CODE), 'logo', { mediaId: randomUUID() });
    expect(attached.version).toBe(2);
    expect(t.groups.get(t.uuid)).toMatchObject({ version: 2, updatedAt: LATER.toISOString() });
    const removed = await detach(t.imageDeps, ANA, pid(CODE), 'logo');
    expect(removed.version).toBe(3);
  });

  it('GRV-09: trocar o logo → a mídia recebe o id do logo atual e a capa fica como está', async () => {
    const t = await setup();
    const first = randomUUID();
    await attach(t.imageDeps, ANA, pid(CODE), 'logo', { mediaId: first });
    const withCover = await attach(t.imageDeps, ANA, pid(CODE), 'cover', { mediaId: randomUUID() });
    const group = await attach(t.imageDeps, ANA, pid(CODE), 'logo', { mediaId: randomUUID() });
    expect(t.calls.attach.map((c) => c.current)).toEqual([undefined, undefined, first]);
    expect(group.coverUrl).toBe(withCover.coverUrl);
  });

  it('GRV-09: confirmar de novo a mesma imagem não muda nada', async () => {
    const t = await setup();
    const mediaId = randomUUID();
    const first = await attach(t.imageDeps, ANA, pid(CODE), 'logo', { mediaId });
    const again = await attach(t.imageDeps, ANA, pid(CODE), 'logo', { mediaId });
    expect(again).toEqual(first);
  });

  it.each(SLOTS)('GRV-09: o dono remove o %s → a mídia desliga e o grupo volta sem a URL', async (slot) => {
    const t = await setup();
    const mediaId = randomUUID();
    await attach(t.imageDeps, ANA, pid(CODE), slot, { mediaId });
    const group = await detach(t.imageDeps, ANA, pid(CODE), slot);
    expect(t.calls.detach[0]).toMatchObject({ purpose: PURPOSE[slot], ownerId: t.uuid, current: mediaId });
    expect(group).not.toHaveProperty(`${slot}Url`);
    expect(t.groups.get(t.uuid)).not.toHaveProperty(`${slot}MediaId`);
  });

  it('GRV-09: quem não participa, ou código que não existe → GROUP_NOT_FOUND (404), sem chamar a mídia', async () => {
    const t = await setup();
    const a = await errorOf(
      requestUpload(t.imageDeps, BIA, pid(CODE), 'logo', { contentType: 'image/webp' }),
    );
    const b = await errorOf(attach(t.imageDeps, BIA, pid(CODE), 'logo', { mediaId: randomUUID() }));
    const c = await errorOf(detach(t.imageDeps, ANA, pid('00000000'), 'cover'));
    for (const err of [a, b, c]) expect(err).toMatchObject({ code: 'GROUP_NOT_FOUND', status: 404 });
    expect(t.mediaCalls()).toBe(0);
  });

  it('GRV-09: participante que não é o dono → GROUP_PERMISSION_DENIED (403) nos três passos, sem chamar a mídia', async () => {
    const t = await setup();
    t.members.set(`${t.uuid}#${BIA}`, {
      groupId: t.uuid as never,
      userId: BIA,
      tier: 'member',
      role: 'member',
      createdAt: NOW.toISOString(),
    });
    const errs = [
      await errorOf(requestUpload(t.imageDeps, BIA, pid(CODE), 'logo', { contentType: 'image/webp' })),
      await errorOf(attach(t.imageDeps, BIA, pid(CODE), 'cover', { mediaId: randomUUID() })),
      await errorOf(detach(t.imageDeps, BIA, pid(CODE), 'logo')),
    ];
    for (const err of errs) expect(err).toMatchObject({ code: 'GROUP_PERMISSION_DENIED', status: 403 });
    expect(t.mediaCalls()).toBe(0);
  });

  it('MID-01: o dono é conferido de novo ao confirmar: quem deixou de ser o dono no meio do envio é barrado', async () => {
    const t = await setup();
    const upload = await requestUpload(t.imageDeps, ANA, pid(CODE), 'logo', { contentType: 'image/webp' });
    t.members.set(`${t.uuid}#${ANA}`, {
      groupId: t.uuid as never,
      userId: ANA,
      tier: 'member',
      role: 'member',
      createdAt: NOW.toISOString(),
    });
    const err = await errorOf(attach(t.imageDeps, ANA, pid(CODE), 'logo', { mediaId: upload.mediaId }));
    expect(err).toMatchObject({ code: 'GROUP_PERMISSION_DENIED', status: 403 });
    expect(t.calls.attach).toEqual([]);
  });

  it('GRV-10: o grupo vem com logoUrl e coverUrl em GRV-04 e GRV-05, montadas pelo id da mídia, sem o uuid', async () => {
    const t = await setup();
    const logo = randomUUID();
    const cover = randomUUID();
    await attach(t.imageDeps, ANA, pid(CODE), 'logo', { mediaId: logo });
    await attach(t.imageDeps, ANA, pid(CODE), 'cover', { mediaId: cover });
    const logoUrl = `${BASE}/public/group.logo/${logo}`;
    const coverUrl = `${BASE}/public/group.cover/${cover}`;
    expect(await getGroup(t.deps, ANA, pid(CODE))).toMatchObject({ logoUrl, coverUrl });
    expect(await listMyGroups(t.deps, ANA)).toMatchObject([{ logoUrl, coverUrl }]);
    const json = JSON.stringify(await getGroup(t.deps, ANA, pid(CODE)));
    expect(json).not.toContain(t.uuid);
    expect(json).not.toContain('MediaId');
  });

  it('GRV-10: sem imagem, o grupo vem sem logoUrl e sem coverUrl', async () => {
    const t = await setup();
    const group = await getGroup(t.deps, ANA, pid(CODE));
    expect(group).not.toHaveProperty('logoUrl');
    expect(group).not.toHaveProperty('coverUrl');
  });

  it('GRV-10: as respostas das rotas de imagem trazem as URLs (confirmar devolve o grupo com a URL nova)', async () => {
    const t = await setup();
    const mediaId = randomUUID();
    const group = await attach(t.imageDeps, ANA, pid(CODE), 'cover', { mediaId });
    expect(group).toMatchObject({ id: CODE, coverUrl: `${BASE}/public/group.cover/${mediaId}` });
  });
});
