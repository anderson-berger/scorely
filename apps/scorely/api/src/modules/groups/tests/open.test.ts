import { asPublicUserId } from '@scorely/api/src/lib/ids';
import { createGroup, getGroup } from '@scorely/api/src/modules/groups/rules/groups';
import { createInvite, joinByInvite } from '@scorely/api/src/modules/groups/rules/invites';
import {
  approveRequest,
  cancelRequest,
  declineRequest,
  listRequests,
  preview as previewGroup,
  request,
  setJoinMode,
} from '@scorely/api/src/modules/groups/rules/open';
import {
  ANA,
  BIA,
  CAIO,
  DUDA,
  errorOf,
  PUBLIC,
  pid,
  setupGroups,
} from '@scorely/api/src/modules/groups/tests/fixtures';
import { describe, expect, it } from 'vitest';

// Grupo aberto e pedidos (GRV-25–28) e o pedido que some ao entrar por convite (GRV-22).
// As telas (GRV-14, 32, 38, 39) ficam no roteiro manual.

const T0 = new Date('2026-11-22T10:00:00.000Z');
const MIN = 60 * 1000;
function setup() {
  return setupGroups({ now: T0 });
}

/** Grupo da ANA no modo de convite. */
async function withGroup() {
  const ctx = setup();
  const group = await createGroup(ctx.deps, ANA, { name: 'Pelada' });
  return { ...ctx, gid: group.id, version: group.version };
}

/** Grupo da ANA já aberto. */
async function withOpenGroup() {
  const ctx = await withGroup();
  await setJoinMode(ctx.deps, ANA, ctx.gid, {
    mode: 'open',
    expectedVersion: ctx.version,
  });
  ctx.notified.length = 0;
  return ctx;
}

describe('groups grupo aberto e pedidos', () => {
  it('GRV-25: o grupo nasce no modo de convite e a resposta traz o joinMode', async () => {
    const { gid, deps } = await withGroup();
    expect(await getGroup(deps, ANA, gid)).toMatchObject({ joinMode: 'invite' });
  });

  it('GRV-25: quem tem group.edit muda o modo, com a version conferida (sobe a version)', async () => {
    const { gid, version, deps } = await withGroup();
    await setJoinMode(deps, ANA, gid, {
      mode: 'open',
      expectedVersion: version,
    });
    const after = await getGroup(deps, ANA, gid);
    expect(after.joinMode).toBe('open');
    expect(after.version).toBeGreaterThan(version);
  });

  it('GRV-25: version velha → VERSION_CONFLICT (409) e o modo não muda', async () => {
    const { gid, version, deps } = await withGroup();
    const err = await errorOf(
      setJoinMode(deps, ANA, gid, {
        mode: 'open',
        expectedVersion: version + 5,
      }),
    );
    expect(err?.code).toBe('VERSION_CONFLICT');
    expect(err?.status).toBe(409);
    expect((await getGroup(deps, ANA, gid)).joinMode).toBe('invite');
  });

  it('GRV-25: quem não tem group.edit → GROUP_PERMISSION_DENIED (403)', async () => {
    const { deps, gid, version } = await withGroup();
    const invite = await createInvite(deps, ANA, gid, {
      tier: 'member',
      validityDays: 7,
      maxUses: null,
    });
    await joinByInvite(deps, BIA, invite.token);
    const err = await errorOf(setJoinMode(deps, BIA, gid, { mode: 'open', expectedVersion: version }));
    expect(err?.code).toBe('GROUP_PERMISSION_DENIED');
    expect(err?.status).toBe(403);
  });

  it('GRV-25: voltar para invite não apaga os pedidos, mas ninguém pede de novo', async () => {
    const { gid, deps } = await withOpenGroup();
    await request(deps, CAIO, gid);
    const { version } = await getGroup(deps, ANA, gid);
    await setJoinMode(deps, ANA, gid, {
      mode: 'invite',
      expectedVersion: version,
    });
    expect(await listRequests(deps, ANA, gid)).toHaveLength(1);
    expect((await errorOf(request(deps, DUDA, gid)))?.code).toBe('GROUP_NOT_FOUND');
  });

  it('GRV-26: no grupo aberto, quem é de fora vê a apresentação pelo código, sem pedido', async () => {
    const { deps, gid } = await withOpenGroup();
    const preview = await previewGroup(deps, CAIO, gid);
    expect(preview).toMatchObject({
      groupId: gid,
      name: 'Pelada',
      participants: 1,
    });
    expect(preview.myTier).toBeUndefined();
    expect(preview.requestedAt).toBeUndefined();
  });

  it('GRV-26: no grupo de convite ou com código que não existe → GROUP_NOT_FOUND (404)', async () => {
    const { deps, gid } = await withGroup();
    const closed = await errorOf(previewGroup(deps, CAIO, gid));
    expect(closed?.code).toBe('GROUP_NOT_FOUND');
    expect(closed?.status).toBe(404);
    expect((await errorOf(previewGroup(deps, CAIO, pid('9ZZZZZZZ'))))?.code).toBe('GROUP_NOT_FOUND');
  });

  it('GRV-26: com pedido esperando, a apresentação traz a data dele', async () => {
    const { deps, gid } = await withOpenGroup();
    await request(deps, CAIO, gid);
    expect((await previewGroup(deps, CAIO, gid)).requestedAt).toBe(T0.toISOString());
  });

  it('GRV-26: quem já participa recebe a apresentação com a participação (myTier)', async () => {
    const { deps, gid } = await withOpenGroup();
    expect(await previewGroup(deps, ANA, gid)).toMatchObject({
      groupId: gid,
      myTier: 'member',
    });
  });

  it('GRV-27: pedir grava o pedido, responde a apresentação com a data e avisa quem tem members.invite', async () => {
    const { deps, gid, notified } = await withOpenGroup();
    const preview = await request(deps, CAIO, gid);
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
    const { deps, gid, notified, clock } = await withOpenGroup();
    const first = await request(deps, CAIO, gid);
    clock.now = new Date(T0.getTime() + MIN);
    const again = await request(deps, CAIO, gid);
    expect(again.requestedAt).toBe(first.requestedAt);
    expect(notified).toHaveLength(1);
    expect(await listRequests(deps, ANA, gid)).toHaveLength(1);
  });

  it('GRV-27: quem já participa → VALIDATION_ERROR', async () => {
    const { deps, gid, notified } = await withOpenGroup();
    const err = await errorOf(request(deps, ANA, gid));
    expect(err?.code).toBe('VALIDATION_ERROR');
    expect(notified).toHaveLength(0);
  });

  it('GRV-27: no grupo de convite → GROUP_NOT_FOUND', async () => {
    const { deps, gid } = await withGroup();
    expect((await errorOf(request(deps, CAIO, gid)))?.code).toBe('GROUP_NOT_FOUND');
  });

  it('GRV-27: a pessoa cancela o próprio pedido, em qualquer modo; sem pedido nada muda', async () => {
    const { gid, deps } = await withOpenGroup();
    await request(deps, CAIO, gid);
    await cancelRequest(deps, CAIO, gid);
    expect(await listRequests(deps, ANA, gid)).toHaveLength(0);
    await cancelRequest(deps, CAIO, gid);
    // modo de convite: cancelar continua valendo
    await request(deps, DUDA, gid);
    const { version } = await getGroup(deps, ANA, gid);
    await setJoinMode(deps, ANA, gid, {
      mode: 'invite',
      expectedVersion: version,
    });
    await cancelRequest(deps, DUDA, gid);
    expect(await listRequests(deps, ANA, gid)).toHaveLength(0);
  });

  it('GRV-27: cancelar num grupo que não existe → GROUP_NOT_FOUND', async () => {
    const { deps } = await withGroup();
    expect((await errorOf(cancelRequest(deps, CAIO, pid('9ZZZZZZZ'))))?.code).toBe('GROUP_NOT_FOUND');
  });

  it('GRV-28: quem tem members.invite lista os pedidos, do mais antigo para o mais novo, com o perfil', async () => {
    const { deps, gid, clock } = await withOpenGroup();
    await request(deps, DUDA, gid);
    clock.now = new Date(T0.getTime() + MIN);
    await request(deps, CAIO, gid);
    const list = await listRequests(deps, ANA, gid);
    expect(list.map((r) => r.user.id)).toEqual([PUBLIC[DUDA], PUBLIC[CAIO]]);
    expect(list[0]).toMatchObject({
      user: { nickname: 'duda' },
      createdAt: T0.toISOString(),
    });
  });

  it('GRV-28: quem não tem members.invite → GROUP_PERMISSION_DENIED em listar, aceitar e recusar', async () => {
    const { deps, gid } = await withOpenGroup();
    const invite = await createInvite(deps, ANA, gid, {
      tier: 'member',
      validityDays: 7,
      maxUses: null,
    });
    await joinByInvite(deps, BIA, invite.token);
    await request(deps, CAIO, gid);
    const target = PUBLIC[CAIO] as ReturnType<typeof asPublicUserId>;
    const codes = await Promise.all([
      errorOf(listRequests(deps, BIA, gid)),
      errorOf(approveRequest(deps, BIA, gid, target, { tier: 'member' })),
      errorOf(declineRequest(deps, BIA, gid, target)),
    ]);
    expect(codes.map((e) => e?.code)).toEqual(Array(3).fill('GROUP_PERMISSION_DENIED'));
  });

  it('GRV-28: aceitar como reserva faz a pessoa participar, apaga o pedido e avisa com o link do grupo', async () => {
    const { gid, notified, deps } = await withOpenGroup();
    await request(deps, CAIO, gid);
    notified.length = 0;
    await approveRequest(deps, ANA, gid, PUBLIC[CAIO] as ReturnType<typeof asPublicUserId>, {
      tier: 'reserve',
    });
    expect(await listRequests(deps, ANA, gid)).toHaveLength(0);
    expect(await getGroup(deps, CAIO, gid)).toMatchObject({ myTier: 'reserve' });
    expect(notified).toHaveLength(1);
    expect(notified[0]?.userId).toBe(CAIO);
    expect(notified[0]?.input.type).toBe('group_join_approved');
    expect(notified[0]?.input.link).toContain(gid);
  });

  it('GRV-28: aceitar como membro', async () => {
    const { gid, deps } = await withOpenGroup();
    await request(deps, CAIO, gid);
    await approveRequest(deps, ANA, gid, PUBLIC[CAIO] as ReturnType<typeof asPublicUserId>, {
      tier: 'member',
    });
    expect(await getGroup(deps, CAIO, gid)).toMatchObject({
      myTier: 'member',
      myRole: { id: 'everyone' },
    });
  });

  it('GRV-28: recusar apaga o pedido, sem aviso, e a pessoa pode pedir de novo', async () => {
    const { deps, gid, notified } = await withOpenGroup();
    await request(deps, CAIO, gid);
    notified.length = 0;
    await declineRequest(deps, ANA, gid, PUBLIC[CAIO] as ReturnType<typeof asPublicUserId>);
    expect(notified).toHaveLength(0);
    expect(await listRequests(deps, ANA, gid)).toHaveLength(0);
    expect((await request(deps, CAIO, gid)).requestedAt).toBeDefined();
  });

  it('GRV-28: pedido que não existe mais → GROUP_REQUEST_NOT_FOUND (404) ao aceitar e ao recusar', async () => {
    const { deps, gid } = await withOpenGroup();
    const target = PUBLIC[CAIO] as ReturnType<typeof asPublicUserId>;
    const approve = await errorOf(approveRequest(deps, ANA, gid, target, { tier: 'member' }));
    const decline = await errorOf(declineRequest(deps, ANA, gid, target));
    expect(approve?.code).toBe('GROUP_REQUEST_NOT_FOUND');
    expect(approve?.status).toBe(404);
    expect(decline?.code).toBe('GROUP_REQUEST_NOT_FOUND');
    const unknown = await errorOf(declineRequest(deps, ANA, gid, asPublicUserId('9ZZZZZZZ')));
    expect(unknown?.code).toBe('GROUP_REQUEST_NOT_FOUND');
  });

  it('GRV-28: aceitar quem entrou por convite ao mesmo tempo só apaga o pedido, sem aviso e sem mudar a participação', async () => {
    const { gid, notified, requests, deps } = await withOpenGroup();
    await request(deps, CAIO, gid);
    const invite = await createInvite(deps, ANA, gid, {
      tier: 'member',
      validityDays: 7,
      maxUses: null,
    });
    // Corrida: a entrada pelo convite grava a participação, e o aceitar ainda acha o pedido.
    const pending = new Map(requests);
    await joinByInvite(deps, CAIO, invite.token);
    for (const [key, request] of pending) requests.set(key, request);
    notified.length = 0;
    await approveRequest(deps, ANA, gid, PUBLIC[CAIO] as ReturnType<typeof asPublicUserId>, {
      tier: 'reserve',
    });
    expect(notified).toHaveLength(0);
    expect(await listRequests(deps, ANA, gid)).toHaveLength(0);
    expect(await getGroup(deps, CAIO, gid)).toMatchObject({ myTier: 'member' });
  });

  it('GRV-22: entrar por convite apaga o pedido que a pessoa tinha, na mesma operação', async () => {
    const { gid, deps } = await withOpenGroup();
    await request(deps, CAIO, gid);
    const invite = await createInvite(deps, ANA, gid, {
      tier: 'member',
      validityDays: 7,
      maxUses: null,
    });
    await joinByInvite(deps, CAIO, invite.token);
    expect(await listRequests(deps, ANA, gid)).toHaveLength(0);
    expect(await getGroup(deps, CAIO, gid)).toMatchObject({ myTier: 'member' });
  });
});
