import { asPublicUserId } from '@scorely/api/src/lib/ids';
import {
  ANA,
  BIA,
  CAIO,
  DUDA,
  errorOf,
  PUBLIC,
  setupGroups,
} from '@scorely/api/src/modules/groups/tests/fixtures';
import { describe, expect, it } from 'vitest';

// Convites, entrar, membros, sair e remover (GRV-17–22, 29–31). GRV-37 é tela (roteiro manual).

const T0 = new Date('2026-11-21T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
function setup() {
  return setupGroups({ now: T0 });
}

/** Grupo da Ana, já criado. */
async function withGroup() {
  const ctx = setup();
  const group = await ctx.service.create(ANA, { name: 'Pelada' });
  return { ...ctx, gid: group.id };
}

const MEMBER_INVITE = {
  tier: 'member',
  validityDays: 7,
  maxUses: null,
} as const;
const RESERVE_INVITE = {
  tier: 'reserve',
  validityDays: 7,
  maxUses: null,
} as const;

describe('groups convites', () => {
  it('GRV-17: a reserva vê o grupo e os membros, mas não tem permissão de administrar', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, RESERVE_INVITE);
    const group = await service.joinByInvite(BIA, invite.token);
    expect(group).toMatchObject({
      myTier: 'reserve',
      myRole: { id: 'everyone' },
      myPermissions: [],
    });
    expect((await service.members(BIA, gid)).map((m) => m.tier)).toEqual(['member', 'reserve']);
  });

  it('GRV-18: convite novo guarda tier, validade, limite, quem criou e quando; começa ativo e sem usos', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, {
      tier: 'reserve',
      validityDays: 7,
      maxUses: 10,
    });
    expect(invite).toMatchObject({
      tier: 'reserve',
      maxUses: 10,
      uses: 0,
      status: 'active',
      expiresAt: new Date(T0.getTime() + 7 * DAY).toISOString(),
      createdAt: T0.toISOString(),
      createdBy: { id: PUBLIC[ANA], nickname: 'ana' },
      usedBy: [],
    });
    expect(invite.token).toBeTruthy();
  });

  it('GRV-18: sem prazo e sem limite não grava expiresAt nem maxUses; cada convite tem token próprio', async () => {
    const { service, gid } = await withGroup();
    const a = await service.createInvite(ANA, gid, {
      tier: 'member',
      validityDays: null,
      maxUses: null,
    });
    const b = await service.createInvite(ANA, gid, MEMBER_INVITE);
    expect(a.expiresAt).toBeUndefined();
    expect(a.maxUses).toBeUndefined();
    expect(a.token).not.toBe(b.token);
    expect(a.id).not.toBe(b.id);
  });

  it('GRV-18: o 51º convite ativo → GROUP_INVITE_LIMIT (409) com details.limit', async () => {
    const { service, gid } = await withGroup();
    await Promise.all(Array.from({ length: 50 }, () => service.createInvite(ANA, gid, MEMBER_INVITE)));
    const err = await errorOf(service.createInvite(ANA, gid, MEMBER_INVITE));
    expect(err?.code).toBe('GROUP_INVITE_LIMIT');
    expect(err?.status).toBe(409);
    expect(err?.details).toEqual({ limit: 50 });
  });

  it('GRV-18: convite cancelado deixa de contar nos 50 ativos', async () => {
    const { service, gid } = await withGroup();
    const all = await Promise.all(
      Array.from({ length: 50 }, () => service.createInvite(ANA, gid, MEMBER_INVITE)),
    );
    await service.revokeInvite(ANA, gid, all[0]?.id ?? '');
    expect(await errorOf(service.createInvite(ANA, gid, MEMBER_INVITE))).toBeUndefined();
  });

  it('GRV-18/15: quem participa sem members.invite → GROUP_PERMISSION_DENIED; quem não participa → GROUP_NOT_FOUND', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.joinByInvite(BIA, invite.token);
    const denied = await errorOf(service.createInvite(BIA, gid, MEMBER_INVITE));
    expect(denied?.code).toBe('GROUP_PERMISSION_DENIED');
    expect(denied?.status).toBe(403);
    expect(denied?.details).toEqual({ permission: 'members.invite' });
    expect((await errorOf(service.createInvite(CAIO, gid, MEMBER_INVITE)))?.code).toBe('GROUP_NOT_FOUND');
  });

  it('GRV-19: lista do mais novo para o mais antigo, com a situação calculada', async () => {
    const { service, gid, clock } = await withGroup();
    const old = await service.createInvite(ANA, gid, {
      tier: 'member',
      validityDays: 1,
      maxUses: null,
    });
    clock.now = new Date(T0.getTime() + 1000);
    const fresh = await service.createInvite(ANA, gid, {
      tier: 'member',
      validityDays: 30,
      maxUses: 1,
    });
    clock.now = new Date(T0.getTime() + 2 * DAY);
    await service.joinByInvite(BIA, fresh.token);
    const list = await service.listInvites(ANA, gid);
    expect(list.map((i) => i.id)).toEqual([fresh.id, old.id]);
    expect(list.map((i) => i.status)).toEqual(['exhausted', 'expired']);
  });

  it('GRV-19: traz os usos e quem entrou, em perfis', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, {
      tier: 'member',
      validityDays: 7,
      maxUses: 10,
    });
    await service.joinByInvite(BIA, invite.token);
    await service.joinByInvite(CAIO, invite.token);
    const [listed] = await service.listInvites(ANA, gid);
    expect(listed?.uses).toBe(2);
    expect(listed?.usedBy.map((u) => u.nickname).sort()).toEqual(['bia', 'caio']);
    expect(listed?.usedBy[0]).not.toHaveProperty('email');
  });

  it('GRV-19: cancelado aparece como revoked', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.revokeInvite(ANA, gid, invite.id);
    expect((await service.listInvites(ANA, gid))[0]?.status).toBe('revoked');
  });

  it('GRV-19: convite que deixou de valer some da lista depois de 30 dias', async () => {
    const { service, gid, clock } = await withGroup();
    await service.createInvite(ANA, gid, {
      tier: 'member',
      validityDays: 1,
      maxUses: null,
    });
    clock.now = new Date(T0.getTime() + 1 * DAY + 29 * DAY);
    expect(await service.listInvites(ANA, gid)).toHaveLength(1);
    clock.now = new Date(T0.getTime() + 1 * DAY + 31 * DAY);
    expect(await service.listInvites(ANA, gid)).toHaveLength(0);
  });

  it('GRV-19: sem members.invite → GROUP_PERMISSION_DENIED', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.joinByInvite(BIA, invite.token);
    expect((await errorOf(service.listInvites(BIA, gid)))?.code).toBe('GROUP_PERMISSION_DENIED');
  });

  it('GRV-20: cancelar faz o link parar de valer na hora (revoked)', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.revokeInvite(ANA, gid, invite.id);
    const err = await errorOf(service.previewInvite(BIA, invite.token));
    expect(err?.code).toBe('GROUP_INVITE_INVALID');
    expect(err?.details).toEqual({ reason: 'revoked' });
    expect((await errorOf(service.joinByInvite(BIA, invite.token)))?.details).toEqual({ reason: 'revoked' });
  });

  it('GRV-20: cancelar de novo não muda nada, nem para um que já venceu', async () => {
    const { service, gid, clock } = await withGroup();
    const invite = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.revokeInvite(ANA, gid, invite.id);
    const first = (await service.listInvites(ANA, gid))[0];
    clock.now = new Date(T0.getTime() + 1000);
    await service.revokeInvite(ANA, gid, invite.id);
    expect(await service.listInvites(ANA, gid)).toEqual([first]);

    const short = await service.createInvite(ANA, gid, {
      tier: 'member',
      validityDays: 1,
      maxUses: null,
    });
    clock.now = new Date(T0.getTime() + 3 * DAY);
    expect(await errorOf(service.revokeInvite(ANA, gid, short.id))).toBeUndefined();
    expect((await service.listInvites(ANA, gid)).find((i) => i.id === short.id)?.status).toBe('expired');
  });

  it('GRV-20: cada convite cancela sozinho (os outros continuam valendo)', async () => {
    const { service, gid } = await withGroup();
    const a = await service.createInvite(ANA, gid, MEMBER_INVITE);
    const b = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.revokeInvite(ANA, gid, a.id);
    expect(await errorOf(service.previewInvite(BIA, b.token))).toBeUndefined();
  });

  it('GRV-20: convite que não existe no grupo → GROUP_INVITE_INVALID not_found; sem permissão → negado', async () => {
    const { service, gid } = await withGroup();
    const err = await errorOf(service.revokeInvite(ANA, gid, '99999999-9999-4999-8999-999999999999'));
    expect(err?.code).toBe('GROUP_INVITE_INVALID');
    expect(err?.details).toEqual({ reason: 'not_found' });
    const invite = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.joinByInvite(BIA, invite.token);
    expect((await errorOf(service.revokeInvite(BIA, gid, invite.id)))?.code).toBe('GROUP_PERMISSION_DENIED');
  });

  it('GRV-21: a apresentação traz o grupo, o número de participantes e como a pessoa entra', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, RESERVE_INVITE);
    expect(await service.previewInvite(BIA, invite.token)).toEqual({
      groupId: gid,
      name: 'Pelada',
      participants: 1,
      tier: 'reserve',
    });
  });

  it('GRV-21: quem já participa vê como participa (myTier)', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, RESERVE_INVITE);
    expect(await service.previewInvite(ANA, invite.token)).toMatchObject({
      myTier: 'member',
    });
  });

  it('GRV-21: token desconhecido → GROUP_INVITE_INVALID (404) not_found', async () => {
    const { service } = setup();
    const err = await errorOf(service.previewInvite(BIA, 'nao-existe'));
    expect(err?.code).toBe('GROUP_INVITE_INVALID');
    expect(err?.status).toBe(404);
    expect(err?.details).toEqual({ reason: 'not_found' });
  });

  it('GRV-21: vencido → expired; esgotado → exhausted', async () => {
    const { service, gid, clock } = await withGroup();
    const short = await service.createInvite(ANA, gid, {
      tier: 'member',
      validityDays: 1,
      maxUses: null,
    });
    const single = await service.createInvite(ANA, gid, {
      tier: 'member',
      validityDays: 30,
      maxUses: 1,
    });
    await service.joinByInvite(BIA, single.token);
    expect((await errorOf(service.previewInvite(CAIO, single.token)))?.details).toEqual({
      reason: 'exhausted',
    });
    clock.now = new Date(T0.getTime() + 2 * DAY);
    expect((await errorOf(service.previewInvite(CAIO, short.token)))?.details).toEqual({ reason: 'expired' });
  });
});

describe('groups entrar por convite (GRV-22)', () => {
  it('GRV-22: não participa + convite de membro → entra como membro e a resposta é o grupo', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, MEMBER_INVITE);
    expect(await service.joinByInvite(BIA, invite.token)).toMatchObject({
      id: gid,
      name: 'Pelada',
      myTier: 'member',
      myRole: { id: 'everyone' },
    });
    expect((await service.mine(BIA)).map((g) => g.id)).toEqual([gid]);
  });

  it('GRV-22: não participa + convite de reserva → entra como reserva', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, RESERVE_INVITE);
    expect((await service.joinByInvite(BIA, invite.token)).myTier).toBe('reserve');
  });

  it('GRV-22: reserva + convite de membro → vira membro, mantém a data de entrada e gasta 1 uso', async () => {
    const { service, gid, clock } = await withGroup();
    const reserve = await service.createInvite(ANA, gid, RESERVE_INVITE);
    const member = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.joinByInvite(BIA, reserve.token);
    clock.now = new Date(T0.getTime() + 3 * DAY);
    expect((await service.joinByInvite(BIA, member.token)).myTier).toBe('member');
    const bia = (await service.members(ANA, gid)).find((m) => m.user.id === PUBLIC[BIA]);
    expect(bia).toMatchObject({ tier: 'member', joinedAt: T0.toISOString() });
    const list = await service.listInvites(ANA, gid);
    expect(list.find((i) => i.id === member.id)?.uses).toBe(1);
  });

  it('GRV-22: reserva + convite de reserva → nada muda e não gasta uso', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, {
      tier: 'reserve',
      validityDays: 7,
      maxUses: 5,
    });
    await service.joinByInvite(BIA, invite.token);
    const again = await service.joinByInvite(BIA, invite.token);
    expect(again.myTier).toBe('reserve');
    expect((await service.listInvites(ANA, gid))[0]?.uses).toBe(1);
  });

  it('GRV-22: membro (inclusive o dono) abre convite de membro ou de reserva → nada muda, sem uso e sem rebaixar', async () => {
    const { service, gid } = await withGroup();
    const member = await service.createInvite(ANA, gid, {
      tier: 'member',
      validityDays: 7,
      maxUses: 5,
    });
    const reserve = await service.createInvite(ANA, gid, {
      tier: 'reserve',
      validityDays: 7,
      maxUses: 5,
    });
    expect(await service.joinByInvite(ANA, member.token)).toMatchObject({
      myTier: 'member',
      myRole: { id: 'owner' },
    });
    expect(await service.joinByInvite(ANA, reserve.token)).toMatchObject({
      myTier: 'member',
      myRole: { id: 'owner' },
    });
    await service.joinByInvite(BIA, member.token);
    expect((await service.joinByInvite(BIA, reserve.token)).myTier).toBe('member');
    const list = await service.listInvites(ANA, gid);
    expect(list.map((i) => i.uses).sort()).toEqual([0, 1]);
  });

  it('GRV-22: a participação guarda o convite pelo qual entrou (inviteId)', async () => {
    const { service, gid, members } = await withGroup();
    const invite = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.joinByInvite(BIA, invite.token);
    const stored = [...members.values()].find((m) => m.userId === BIA);
    expect(stored?.inviteId).toBe(invite.id);
  });

  it('GRV-22: usos concorrentes nunca passam do limite; a segunda recebe exhausted', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, {
      tier: 'member',
      validityDays: 7,
      maxUses: 1,
    });
    const [a, b] = await Promise.all([
      errorOf(service.joinByInvite(BIA, invite.token)),
      errorOf(service.joinByInvite(CAIO, invite.token)),
    ]);
    const failed = [a, b].filter((e) => e !== undefined);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.code).toBe('GROUP_INVITE_INVALID');
    expect(failed[0]?.details).toEqual({ reason: 'exhausted' });
    expect((await service.listInvites(ANA, gid))[0]?.uses).toBe(1);
  });

  it('GRV-22: convite que não vale não entra (vencido, cancelado, desconhecido)', async () => {
    const { service, gid, clock } = await withGroup();
    const short = await service.createInvite(ANA, gid, {
      tier: 'member',
      validityDays: 1,
      maxUses: null,
    });
    clock.now = new Date(T0.getTime() + 2 * DAY);
    expect((await errorOf(service.joinByInvite(BIA, short.token)))?.details).toEqual({ reason: 'expired' });
    expect((await errorOf(service.joinByInvite(BIA, 'nada')))?.details).toEqual({ reason: 'not_found' });
    expect((await service.mine(BIA)).length).toBe(0);
  });
});

describe('groups membros, sair e remover (GRV-29–31)', () => {
  it('GRV-29: ordem dono, membros, reservas; dentro de cada um por data de entrada', async () => {
    const { service, gid, clock } = await withGroup();
    const member = await service.createInvite(ANA, gid, MEMBER_INVITE);
    const reserve = await service.createInvite(ANA, gid, RESERVE_INVITE);
    clock.now = new Date(T0.getTime() + 1 * DAY);
    await service.joinByInvite(DUDA, reserve.token);
    clock.now = new Date(T0.getTime() + 2 * DAY);
    await service.joinByInvite(CAIO, member.token);
    clock.now = new Date(T0.getTime() + 3 * DAY);
    await service.joinByInvite(BIA, member.token);
    const list = await service.members(BIA, gid);
    expect(list.map((m) => m.user.nickname)).toEqual(['ana', 'caio', 'bia', 'duda']);
    expect(list.map((m) => m.role)).toEqual([
      { id: 'owner' },
      { id: 'everyone' },
      { id: 'everyone' },
      { id: 'everyone' },
    ]);
    expect(list[1]?.joinedAt).toBe(new Date(T0.getTime() + 2 * DAY).toISOString());
  });

  it('GRV-29: perfil sem email nem nome; invitedBy é o perfil de quem criou o convite; o dono não tem', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.joinByInvite(BIA, invite.token);
    const [owner, bia] = await service.members(ANA, gid);
    expect(owner?.invitedBy).toBeUndefined();
    expect(bia?.invitedBy).toMatchObject({ id: PUBLIC[ANA], nickname: 'ana' });
    expect(bia?.user).not.toHaveProperty('email');
    expect(bia?.user).not.toHaveProperty('name');
  });

  it('GRV-29: quem subiu de reserva a membro mostra o convite pelo qual subiu', async () => {
    const { service, gid } = await withGroup();
    const reserve = await service.createInvite(ANA, gid, RESERVE_INVITE);
    const member = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.joinByInvite(BIA, reserve.token);
    await service.joinByInvite(BIA, member.token);
    expect((await service.members(ANA, gid))[1]?.invitedBy?.nickname).toBe('ana');
  });

  it('GRV-29: quem não participa → GROUP_NOT_FOUND', async () => {
    const { service, gid } = await withGroup();
    expect((await errorOf(service.members(BIA, gid)))?.code).toBe('GROUP_NOT_FOUND');
  });

  it('GRV-30: sair some a participação na hora e o grupo sai dos meus grupos', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.joinByInvite(BIA, invite.token);
    await service.leave(BIA, gid);
    expect(await service.mine(BIA)).toEqual([]);
    expect((await errorOf(service.get(BIA, gid)))?.code).toBe('GROUP_NOT_FOUND');
    expect((await service.members(ANA, gid)).map((m) => m.user.nickname)).toEqual(['ana']);
  });

  it('GRV-30: o dono não sai → GROUP_OWNER_NOT_REMOVABLE (409)', async () => {
    const { service, gid } = await withGroup();
    const err = await errorOf(service.leave(ANA, gid));
    expect(err?.code).toBe('GROUP_OWNER_NOT_REMOVABLE');
    expect(err?.status).toBe(409);
  });

  it('GRV-30: quem saiu volta por convite como alguém novo (nova data de entrada)', async () => {
    const { service, gid, clock } = await withGroup();
    const invite = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.joinByInvite(BIA, invite.token);
    await service.leave(BIA, gid);
    clock.now = new Date(T0.getTime() + 5 * DAY);
    expect((await service.joinByInvite(BIA, invite.token)).myTier).toBe('member');
    const bia = (await service.members(ANA, gid)).find((m) => m.user.id === PUBLIC[BIA]);
    expect(bia?.joinedAt).toBe(clock.now.toISOString());
  });

  it('GRV-31: quem tem members.remove remove membro ou reserva, com o efeito de sair', async () => {
    const { service, gid } = await withGroup();
    const reserve = await service.createInvite(ANA, gid, RESERVE_INVITE);
    const member = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.joinByInvite(BIA, member.token);
    await service.joinByInvite(CAIO, reserve.token);
    await service.removeMember(ANA, gid, PUBLIC[BIA] ?? asPublicUserId('2BBBBBBB'));
    await service.removeMember(ANA, gid, PUBLIC[CAIO] ?? asPublicUserId('3CCCCCCC'));
    expect(await service.mine(BIA)).toEqual([]);
    expect(await service.mine(CAIO)).toEqual([]);
    expect((await service.members(ANA, gid)).map((m) => m.user.nickname)).toEqual(['ana']);
  });

  it('GRV-31: remover não muda os convites (continua ativo, com o uso gasto)', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, {
      tier: 'member',
      validityDays: 7,
      maxUses: 5,
    });
    await service.joinByInvite(BIA, invite.token);
    await service.removeMember(ANA, gid, asPublicUserId('2BBBBBBB'));
    expect((await service.listInvites(ANA, gid))[0]).toMatchObject({
      status: 'active',
      uses: 1,
    });
  });

  it('GRV-31: o dono não é removível; quem não participa → GROUP_MEMBER_NOT_FOUND', async () => {
    const { service, gid } = await withGroup();
    expect((await errorOf(service.removeMember(ANA, gid, asPublicUserId('1AAAAAAA'))))?.code).toBe(
      'GROUP_OWNER_NOT_REMOVABLE',
    );
    expect((await errorOf(service.removeMember(ANA, gid, asPublicUserId('3CCCCCCC'))))?.code).toBe(
      'GROUP_MEMBER_NOT_FOUND',
    );
  });

  it('GRV-31: sem members.remove → GROUP_PERMISSION_DENIED; quem não participa → GROUP_NOT_FOUND', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.joinByInvite(BIA, invite.token);
    await service.joinByInvite(CAIO, invite.token);
    const denied = await errorOf(service.removeMember(BIA, gid, asPublicUserId('3CCCCCCC')));
    expect(denied?.code).toBe('GROUP_PERMISSION_DENIED');
    expect(denied?.details).toEqual({ permission: 'members.remove' });
    expect((await errorOf(service.removeMember(DUDA, gid, asPublicUserId('3CCCCCCC'))))?.code).toBe(
      'GROUP_NOT_FOUND',
    );
  });
});

describe('groups convidado por e id do convite (GRV-29, 37)', () => {
  it('GRV-29: a participação guarda quem criou o convite (invitedBy), ao entrar e ao subir', async () => {
    const { service, gid, members } = await withGroup();
    const reserve = await service.createInvite(ANA, gid, RESERVE_INVITE);
    const member = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.joinByInvite(BIA, reserve.token);
    expect([...members.values()].find((m) => m.userId === BIA)?.invitedBy).toBe(ANA);
    await service.joinByInvite(BIA, member.token);
    const stored = [...members.values()].find((m) => m.userId === BIA);
    expect(stored?.invitedBy).toBe(ANA);
    expect(stored?.inviteId).toBe(member.id);
  });

  it('GRV-29: "convidado por" continua depois que o convite some', async () => {
    const { service, gid, invites } = await withGroup();
    const invite = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.joinByInvite(BIA, invite.token);
    invites.clear();
    const bia = (await service.members(ANA, gid)).find((m) => m.user.id === PUBLIC[BIA]);
    expect(bia?.invitedBy).toMatchObject({ id: PUBLIC[ANA], nickname: 'ana' });
  });

  it('GRV-29/37: inviteId vem só para quem tem members.invite, e é o convite da participação', async () => {
    const { service, gid } = await withGroup();
    const reserve = await service.createInvite(ANA, gid, RESERVE_INVITE);
    const member = await service.createInvite(ANA, gid, MEMBER_INVITE);
    await service.joinByInvite(BIA, reserve.token);
    await service.joinByInvite(CAIO, member.token);
    await service.joinByInvite(BIA, member.token);
    const byOwner = await service.members(ANA, gid);
    expect(byOwner.find((m) => m.user.id === PUBLIC[BIA])?.inviteId).toBe(member.id);
    expect(byOwner.find((m) => m.user.id === PUBLIC[CAIO])?.inviteId).toBe(member.id);
    expect(byOwner[0]?.inviteId).toBeUndefined();
    const byMember = await service.members(BIA, gid);
    expect(byMember.every((m) => m.inviteId === undefined)).toBe(true);
    expect(byMember.find((m) => m.user.id === PUBLIC[CAIO])?.invitedBy?.nickname).toBe('ana');
  });
});
