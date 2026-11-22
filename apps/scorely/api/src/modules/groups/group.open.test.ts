import type { AppError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import { asPublicUserId, asUserId } from '@scorely/api/src/lib/ids';
import { createGroupService } from '@scorely/api/src/modules/groups/group.service';
import { ANA, BIA, memoryGroups, pid } from '@scorely/api/src/modules/groups/groups.memory';
import type { UserRecord } from '@scorely/api/src/modules/users/user.repository';
import { describe, expect, it } from 'vitest';

// Grupo aberto e pedidos (GRV-25–28) e o pedido que some ao entrar por convite (GRV-22).
// As telas (GRV-14, 32, 38, 39) ficam no roteiro manual.

const T0 = new Date('2026-11-22T10:00:00.000Z');
const MIN = 60 * 1000;
const CAIO = asUserId('33333333-3333-4333-8333-333333333333');
const DUDA = asUserId('44444444-4444-4444-8444-444444444444');
const PUBLIC = {
  [ANA]: asPublicUserId('1AAAAAAA'),
  [BIA]: asPublicUserId('2BBBBBBB'),
  [CAIO]: asPublicUserId('3CCCCCCC'),
  [DUDA]: asPublicUserId('4DDDDDDD'),
} as Record<string, ReturnType<typeof asPublicUserId>>;
const NICK = {
  [ANA]: 'ana',
  [BIA]: 'bia',
  [CAIO]: 'caio',
  [DUDA]: 'duda',
} as Record<string, string>;

function setup() {
  const mem = memoryGroups();
  const clock = { now: T0 };
  const seq = { n: 0 };
  const notified: { userId: UserId; input: { type: string; link?: string } }[] = [];
  const users = {
    getMany: async (ids: readonly UserId[]): Promise<UserRecord[]> =>
      ids
        .filter((id) => PUBLIC[id] !== undefined)
        .map((id) => ({
          id,
          publicId: PUBLIC[id] as UserRecord['publicId'],
          nickname: NICK[id] ?? 'x',
          createdAt: '2026-01-01T00:00:00.000Z',
          version: 1,
        })),
    resolve: async (publicIds: readonly UserRecord['publicId'][]) =>
      new Map(
        Object.entries(PUBLIC)
          .filter(([, p]) => publicIds.includes(p))
          .map(([id, p]) => [p, id as UserId] as const),
      ),
  };
  const emails = {
    emailOf: async () => undefined,
    userIdOf: async () => undefined,
  };
  const notifications = {
    notify: async (userId: UserId, input: { type: string; link?: string }) => {
      notified.push({ userId, input });
    },
  };
  const service = createGroupService({
    groups: mem.repo,
    users,
    emails,
    notifications,
    now: () => clock.now,
    newPublicId: () => pid('K3X9PQ2A'),
    newToken: () => {
      seq.n += 1;
      return `token-${seq.n}`;
    },
  } as unknown as Parameters<typeof createGroupService>[0]);
  return { ...mem, clock, service, notified };
}

async function errorOf(p: Promise<unknown>) {
  return (await p.then(
    () => undefined,
    (e: unknown) => e,
  )) as AppError | undefined;
}

/** Grupo da ANA no modo de convite. */
async function withGroup() {
  const ctx = setup();
  const group = await ctx.service.create(ANA, { name: 'Pelada' });
  return { ...ctx, gid: group.id, version: group.version };
}

/** Grupo da ANA já aberto. */
async function withOpenGroup() {
  const ctx = await withGroup();
  await ctx.service.setJoinMode(ANA, ctx.gid, {
    mode: 'open',
    expectedVersion: ctx.version,
  });
  ctx.notified.length = 0;
  return ctx;
}

describe('groups grupo aberto e pedidos', () => {
  it('GRV-25: o grupo nasce no modo de convite e a resposta traz o joinMode', async () => {
    const { service, gid } = await withGroup();
    expect(await service.get(ANA, gid)).toMatchObject({ joinMode: 'invite' });
  });

  it('GRV-25: quem tem group.edit muda o modo, com a version conferida (sobe a version)', async () => {
    const { service, gid, version } = await withGroup();
    await service.setJoinMode(ANA, gid, {
      mode: 'open',
      expectedVersion: version,
    });
    const after = await service.get(ANA, gid);
    expect(after.joinMode).toBe('open');
    expect(after.version).toBeGreaterThan(version);
  });

  it('GRV-25: version velha → VERSION_CONFLICT (409) e o modo não muda', async () => {
    const { service, gid, version } = await withGroup();
    const err = await errorOf(
      service.setJoinMode(ANA, gid, {
        mode: 'open',
        expectedVersion: version + 5,
      }),
    );
    expect(err?.code).toBe('VERSION_CONFLICT');
    expect(err?.status).toBe(409);
    expect((await service.get(ANA, gid)).joinMode).toBe('invite');
  });

  it('GRV-25: quem não tem group.edit → GROUP_PERMISSION_DENIED (403)', async () => {
    const { service, gid, version } = await withGroup();
    const invite = await service.createInvite(ANA, gid, {
      tier: 'member',
      validityDays: 7,
      maxUses: null,
    });
    await service.joinByInvite(BIA, invite.token);
    const err = await errorOf(service.setJoinMode(BIA, gid, { mode: 'open', expectedVersion: version }));
    expect(err?.code).toBe('GROUP_PERMISSION_DENIED');
    expect(err?.status).toBe(403);
  });

  it('GRV-25: voltar para invite não apaga os pedidos, mas ninguém pede de novo', async () => {
    const { service, gid } = await withOpenGroup();
    await service.request(CAIO, gid);
    const { version } = await service.get(ANA, gid);
    await service.setJoinMode(ANA, gid, {
      mode: 'invite',
      expectedVersion: version,
    });
    expect(await service.listRequests(ANA, gid)).toHaveLength(1);
    expect((await errorOf(service.request(DUDA, gid)))?.code).toBe('GROUP_NOT_FOUND');
  });

  it('GRV-26: no grupo aberto, quem é de fora vê a apresentação pelo código, sem pedido', async () => {
    const { service, gid } = await withOpenGroup();
    const preview = await service.preview(CAIO, gid);
    expect(preview).toMatchObject({
      groupId: gid,
      name: 'Pelada',
      participants: 1,
    });
    expect(preview.myTier).toBeUndefined();
    expect(preview.requestedAt).toBeUndefined();
  });

  it('GRV-26: no grupo de convite ou com código que não existe → GROUP_NOT_FOUND (404)', async () => {
    const { service, gid } = await withGroup();
    const closed = await errorOf(service.preview(CAIO, gid));
    expect(closed?.code).toBe('GROUP_NOT_FOUND');
    expect(closed?.status).toBe(404);
    expect((await errorOf(service.preview(CAIO, pid('9ZZZZZZZ'))))?.code).toBe('GROUP_NOT_FOUND');
  });

  it('GRV-26: com pedido esperando, a apresentação traz a data dele', async () => {
    const { service, gid } = await withOpenGroup();
    await service.request(CAIO, gid);
    expect((await service.preview(CAIO, gid)).requestedAt).toBe(T0.toISOString());
  });

  it('GRV-26: quem já participa recebe a apresentação com a participação (myTier)', async () => {
    const { service, gid } = await withOpenGroup();
    expect(await service.preview(ANA, gid)).toMatchObject({
      groupId: gid,
      myTier: 'member',
    });
  });

  it('GRV-27: pedir grava o pedido, responde a apresentação com a data e avisa quem tem members.invite', async () => {
    const { service, gid, notified } = await withOpenGroup();
    const preview = await service.request(CAIO, gid);
    expect(preview).toMatchObject({
      groupId: gid,
      requestedAt: T0.toISOString(),
    });
    expect(notified).toHaveLength(1);
    expect(notified[0]?.userId).toBe(ANA);
    expect(notified[0]?.input.type).toBe('group_join_requested');
    expect(notified[0]?.input.link).toContain(gid);
  });

  it('GRV-27: pedir de novo não muda nada e não avisa de novo', async () => {
    const { service, gid, notified, clock } = await withOpenGroup();
    const first = await service.request(CAIO, gid);
    clock.now = new Date(T0.getTime() + MIN);
    const again = await service.request(CAIO, gid);
    expect(again.requestedAt).toBe(first.requestedAt);
    expect(notified).toHaveLength(1);
    expect(await service.listRequests(ANA, gid)).toHaveLength(1);
  });

  it('GRV-27: quem já participa → VALIDATION_ERROR', async () => {
    const { service, gid, notified } = await withOpenGroup();
    const err = await errorOf(service.request(ANA, gid));
    expect(err?.code).toBe('VALIDATION_ERROR');
    expect(notified).toHaveLength(0);
  });

  it('GRV-27: no grupo de convite → GROUP_NOT_FOUND', async () => {
    const { service, gid } = await withGroup();
    expect((await errorOf(service.request(CAIO, gid)))?.code).toBe('GROUP_NOT_FOUND');
  });

  it('GRV-27: a pessoa cancela o próprio pedido, em qualquer modo; sem pedido nada muda', async () => {
    const { service, gid } = await withOpenGroup();
    await service.request(CAIO, gid);
    await service.cancelRequest(CAIO, gid);
    expect(await service.listRequests(ANA, gid)).toHaveLength(0);
    await service.cancelRequest(CAIO, gid);
    // modo de convite: cancelar continua valendo
    await service.request(DUDA, gid);
    const { version } = await service.get(ANA, gid);
    await service.setJoinMode(ANA, gid, {
      mode: 'invite',
      expectedVersion: version,
    });
    await service.cancelRequest(DUDA, gid);
    expect(await service.listRequests(ANA, gid)).toHaveLength(0);
  });

  it('GRV-27: cancelar num grupo que não existe → GROUP_NOT_FOUND', async () => {
    const { service } = await withGroup();
    expect((await errorOf(service.cancelRequest(CAIO, pid('9ZZZZZZZ'))))?.code).toBe('GROUP_NOT_FOUND');
  });

  it('GRV-28: quem tem members.invite lista os pedidos, do mais antigo para o mais novo, com o perfil', async () => {
    const { service, gid, clock } = await withOpenGroup();
    await service.request(DUDA, gid);
    clock.now = new Date(T0.getTime() + MIN);
    await service.request(CAIO, gid);
    const list = await service.listRequests(ANA, gid);
    expect(list.map((r) => r.user.id)).toEqual([PUBLIC[DUDA], PUBLIC[CAIO]]);
    expect(list[0]).toMatchObject({
      user: { nickname: 'duda' },
      createdAt: T0.toISOString(),
    });
  });

  it('GRV-28: quem não tem members.invite → GROUP_PERMISSION_DENIED em listar, aceitar e recusar', async () => {
    const { service, gid } = await withOpenGroup();
    const invite = await service.createInvite(ANA, gid, {
      tier: 'member',
      validityDays: 7,
      maxUses: null,
    });
    await service.joinByInvite(BIA, invite.token);
    await service.request(CAIO, gid);
    const target = PUBLIC[CAIO] as ReturnType<typeof asPublicUserId>;
    const codes = await Promise.all([
      errorOf(service.listRequests(BIA, gid)),
      errorOf(service.approveRequest(BIA, gid, target, { tier: 'member' })),
      errorOf(service.declineRequest(BIA, gid, target)),
    ]);
    expect(codes.map((e) => e?.code)).toEqual(Array(3).fill('GROUP_PERMISSION_DENIED'));
  });

  it('GRV-28: aceitar como reserva faz a pessoa participar, apaga o pedido e avisa com o link do grupo', async () => {
    const { service, gid, notified } = await withOpenGroup();
    await service.request(CAIO, gid);
    notified.length = 0;
    await service.approveRequest(ANA, gid, PUBLIC[CAIO] as ReturnType<typeof asPublicUserId>, {
      tier: 'reserve',
    });
    expect(await service.listRequests(ANA, gid)).toHaveLength(0);
    expect(await service.get(CAIO, gid)).toMatchObject({ myTier: 'reserve' });
    expect(notified).toHaveLength(1);
    expect(notified[0]?.userId).toBe(CAIO);
    expect(notified[0]?.input.type).toBe('group_join_approved');
    expect(notified[0]?.input.link).toContain(gid);
  });

  it('GRV-28: aceitar como membro', async () => {
    const { service, gid } = await withOpenGroup();
    await service.request(CAIO, gid);
    await service.approveRequest(ANA, gid, PUBLIC[CAIO] as ReturnType<typeof asPublicUserId>, {
      tier: 'member',
    });
    expect(await service.get(CAIO, gid)).toMatchObject({
      myTier: 'member',
      myRole: 'member',
    });
  });

  it('GRV-28: recusar apaga o pedido, sem aviso, e a pessoa pode pedir de novo', async () => {
    const { service, gid, notified } = await withOpenGroup();
    await service.request(CAIO, gid);
    notified.length = 0;
    await service.declineRequest(ANA, gid, PUBLIC[CAIO] as ReturnType<typeof asPublicUserId>);
    expect(notified).toHaveLength(0);
    expect(await service.listRequests(ANA, gid)).toHaveLength(0);
    expect((await service.request(CAIO, gid)).requestedAt).toBeDefined();
  });

  it('GRV-28: pedido que não existe mais → GROUP_REQUEST_NOT_FOUND (404) ao aceitar e ao recusar', async () => {
    const { service, gid } = await withOpenGroup();
    const target = PUBLIC[CAIO] as ReturnType<typeof asPublicUserId>;
    const approve = await errorOf(service.approveRequest(ANA, gid, target, { tier: 'member' }));
    const decline = await errorOf(service.declineRequest(ANA, gid, target));
    expect(approve?.code).toBe('GROUP_REQUEST_NOT_FOUND');
    expect(approve?.status).toBe(404);
    expect(decline?.code).toBe('GROUP_REQUEST_NOT_FOUND');
    const unknown = await errorOf(service.declineRequest(ANA, gid, asPublicUserId('9ZZZZZZZ')));
    expect(unknown?.code).toBe('GROUP_REQUEST_NOT_FOUND');
  });

  it('GRV-28: aceitar quem entrou por convite ao mesmo tempo só apaga o pedido, sem aviso e sem mudar a participação', async () => {
    const { service, gid, notified, requests } = await withOpenGroup();
    await service.request(CAIO, gid);
    const invite = await service.createInvite(ANA, gid, {
      tier: 'member',
      validityDays: 7,
      maxUses: null,
    });
    // Corrida: a entrada pelo convite grava a participação, e o aceitar ainda acha o pedido.
    const pending = new Map(requests);
    await service.joinByInvite(CAIO, invite.token);
    for (const [key, request] of pending) requests.set(key, request);
    notified.length = 0;
    await service.approveRequest(ANA, gid, PUBLIC[CAIO] as ReturnType<typeof asPublicUserId>, {
      tier: 'reserve',
    });
    expect(notified).toHaveLength(0);
    expect(await service.listRequests(ANA, gid)).toHaveLength(0);
    expect(await service.get(CAIO, gid)).toMatchObject({ myTier: 'member' });
  });

  it('GRV-22: entrar por convite apaga o pedido que a pessoa tinha, na mesma operação', async () => {
    const { service, gid } = await withOpenGroup();
    await service.request(CAIO, gid);
    const invite = await service.createInvite(ANA, gid, {
      tier: 'member',
      validityDays: 7,
      maxUses: null,
    });
    await service.joinByInvite(CAIO, invite.token);
    expect(await service.listRequests(ANA, gid)).toHaveLength(0);
    expect(await service.get(CAIO, gid)).toMatchObject({ myTier: 'member' });
  });
});
