import type { UserId } from '@scorely/api/src/lib/ids';
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

// Convite pessoal (GRV-23, 24) e "Convites para você" (GRV-06, 36: o back é o myInvites).
// A tela (GRV-32 "Convidar para membro", GRV-33 "Para quem") fica no roteiro manual.

const T0 = new Date('2026-11-21T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
function publicOf(id: string): ReturnType<typeof asPublicUserId> {
  return asPublicUserId(PUBLIC[id] ?? '');
}

function setup() {
  const accounts: Record<string, string> = {
    [ANA]: 'ana@x.com',
    [BIA]: 'bia@x.com',
    [CAIO]: 'caio@x.com',
    [DUDA]: 'duda@x.com',
  };
  const emails = {
    emailOf: async (userId: UserId) => accounts[userId],
    userIdOf: async (email: string) => {
      const found = Object.entries(accounts).find(([, e]) => e === email);
      return found ? (found[0] as UserId) : undefined;
    },
  };
  return { ...setupGroups({ now: T0, emails }), accounts };
}

async function withGroup() {
  const ctx = setup();
  const group = await ctx.service.create(ANA, { name: 'Pelada' });
  return { ...ctx, gid: group.id };
}

const FOR_CAIO = {
  tier: 'member',
  validityDays: 7,
  maxUses: null,
  target: { publicId: publicOf(CAIO) },
} as const;
const FOR_CAIO_EMAIL = {
  tier: 'member',
  validityDays: 7,
  maxUses: null,
  target: { email: 'caio@x.com' },
} as const;
const RESERVE_INVITE = { tier: 'reserve', validityDays: 7, maxUses: null } as const;

describe('groups convite pessoal', () => {
  it('GRV-23: pelo id público tem sempre 1 uso (ignora o maxUses), avisa a pessoa com o link e a lista mostra o perfil', async () => {
    const { service, gid, notified } = await withGroup();
    const invite = await service.createInvite(ANA, gid, { ...FOR_CAIO, maxUses: 10 });
    expect(invite.maxUses).toBe(1);
    expect(notified).toHaveLength(1);
    expect(notified[0]?.userId).toBe(CAIO);
    expect(notified[0]?.input).toMatchObject({ type: 'group_invited', link: `/join/${invite.token}` });
    const [listed] = await service.listInvites(ANA, gid);
    expect(listed?.target).toEqual({
      user: expect.objectContaining({ id: publicOf(CAIO), nickname: 'caio' }),
    });
  });

  it('GRV-23: id público que não existe → USER_NOT_FOUND (404)', async () => {
    const { service, gid, notified } = await withGroup();
    const err = await errorOf(
      service.createInvite(ANA, gid, { ...FOR_CAIO, target: { publicId: asPublicUserId('9ZZZZZZZ') } }),
    );
    expect(err?.code).toBe('USER_NOT_FOUND');
    expect(err?.status).toBe(404);
    expect(notified).toHaveLength(0);
  });

  it('GRV-23: pelo email guarda normalizado; com conta existente ela é avisada', async () => {
    const { service, gid, notified } = await withGroup();
    const invite = await service.createInvite(ANA, gid, {
      ...FOR_CAIO_EMAIL,
      target: { email: '  Caio@X.com ' },
    });
    expect(invite.maxUses).toBe(1);
    const [listed] = await service.listInvites(ANA, gid);
    expect(listed?.target).toEqual({ email: 'caio@x.com' });
    expect(notified.map((n) => [n.userId, n.input.type])).toEqual([[CAIO, 'group_invited']]);
  });

  it('GRV-23: pelo email sem conta não avisa ninguém', async () => {
    const { service, gid, notified } = await withGroup();
    await service.createInvite(ANA, gid, { ...FOR_CAIO_EMAIL, target: { email: 'nova@x.com' } });
    expect(notified).toHaveLength(0);
  });

  it('GRV-23: convidar quem já é membro, ou uma reserva para reserva → VALIDATION_ERROR; reserva para membro pode', async () => {
    const { service, gid } = await withGroup();
    const open = await service.createInvite(ANA, gid, RESERVE_INVITE);
    await service.joinByInvite(BIA, open.token);
    await service.joinByInvite(CAIO, (await service.createInvite(ANA, gid, { ...RESERVE_INVITE })).token);
    const member = await errorOf(
      service.createInvite(ANA, gid, { ...FOR_CAIO, target: { publicId: publicOf(ANA) } }),
    );
    expect(member?.code).toBe('VALIDATION_ERROR');
    const reserveToReserve = await errorOf(
      service.createInvite(ANA, gid, { ...FOR_CAIO, tier: 'reserve', target: { publicId: publicOf(BIA) } }),
    );
    expect(reserveToReserve?.code).toBe('VALIDATION_ERROR');
    const byEmail = await errorOf(
      service.createInvite(ANA, gid, { ...FOR_CAIO_EMAIL, target: { email: 'ana@x.com' } }),
    );
    expect(byEmail?.code).toBe('VALIDATION_ERROR');
    expect(
      await errorOf(service.createInvite(ANA, gid, { ...FOR_CAIO, target: { publicId: publicOf(BIA) } })),
    ).toBeUndefined();
  });

  it('GRV-23: só o alvo vê e usa o convite; outra pessoa → GROUP_INVITE_NOT_FOR_YOU (403) sem details', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, FOR_CAIO);
    for (const action of [
      () => service.previewInvite(DUDA, invite.token),
      () => service.joinByInvite(DUDA, invite.token),
    ]) {
      const err = await errorOf(action());
      expect(err?.code).toBe('GROUP_INVITE_NOT_FOR_YOU');
      expect(err?.status).toBe(403);
      expect(err?.details).toBeUndefined();
    }
    expect((await service.previewInvite(CAIO, invite.token)).name).toBe('Pelada');
    expect(await service.joinByInvite(CAIO, invite.token)).toMatchObject({ myTier: 'member' });
  });

  it('GRV-23: pelo email vale para a conta com aquele email e para mais ninguém; esgota no 1º uso', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, FOR_CAIO_EMAIL);
    expect((await errorOf(service.joinByInvite(DUDA, invite.token)))?.code).toBe('GROUP_INVITE_NOT_FOR_YOU');
    await service.joinByInvite(CAIO, invite.token);
    const [listed] = await service.listInvites(ANA, gid);
    expect(listed).toMatchObject({ status: 'exhausted', uses: 1 });
  });

  it('GRV-23: a reserva vira membro por um convite pessoal e mantém a data de entrada', async () => {
    const { service, gid, clock } = await withGroup();
    await service.joinByInvite(BIA, (await service.createInvite(ANA, gid, RESERVE_INVITE)).token);
    clock.now = new Date(T0.getTime() + DAY);
    const invite = await service.createInvite(ANA, gid, { ...FOR_CAIO, target: { publicId: publicOf(BIA) } });
    const group = await service.joinByInvite(BIA, invite.token);
    expect(group.myTier).toBe('member');
    const bia = (await service.members(ANA, gid)).find((m) => m.user.id === publicOf(BIA));
    expect(bia).toMatchObject({ tier: 'member', joinedAt: T0.toISOString() });
    expect(bia?.invitedBy?.id).toBe(publicOf(ANA));
  });

  it('GRV-23: a lista de convites não vaza o email para a apresentação nem para o erro', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, FOR_CAIO_EMAIL);
    const preview = await service.previewInvite(CAIO, invite.token);
    expect(JSON.stringify(preview)).not.toContain('caio@x.com');
    const err = await errorOf(service.previewInvite(DUDA, invite.token));
    expect(JSON.stringify(err?.details ?? '')).not.toContain('caio@x.com');
  });
});

describe('groups convites para mim', () => {
  it('GRV-24: lista os convites que valem, pelo id público e pelo email, do mais novo para o mais antigo, com a apresentação e quem convidou', async () => {
    const { service, gid, clock } = await withGroup();
    const first = await service.createInvite(ANA, gid, FOR_CAIO);
    clock.now = new Date(T0.getTime() + 1000);
    const second = await service.createInvite(ANA, gid, { ...FOR_CAIO_EMAIL, tier: 'reserve' });
    const list = await service.myInvites(CAIO);
    expect(list.map((i) => i.id)).toEqual([second.id, first.id]);
    expect(list[0]).toMatchObject({
      token: second.token,
      groupId: 'K3X9PQ2A',
      name: 'Pelada',
      participants: 1,
      tier: 'reserve',
      invitedBy: { id: publicOf(ANA), nickname: 'ana' },
      createdAt: new Date(T0.getTime() + 1000).toISOString(),
    });
    expect(await service.myInvites(DUDA)).toEqual([]);
  });

  it('GRV-24: convite por email aparece quando a conta é criada depois', async () => {
    const { service, gid, accounts } = await withGroup();
    await service.createInvite(ANA, gid, { ...FOR_CAIO_EMAIL, target: { email: 'nova@x.com' } });
    expect(await service.myInvites(DUDA)).toEqual([]);
    accounts[DUDA] = 'nova@x.com';
    expect(await service.myInvites(DUDA)).toHaveLength(1);
  });

  it('GRV-24: não aparece o que já não vale (vencido, esgotado, cancelado, recusado) nem o de quem já seria só membro', async () => {
    const { service, gid, clock } = await withGroup();
    const expired = await service.createInvite(ANA, gid, { ...FOR_CAIO, validityDays: 1 });
    const revoked = await service.createInvite(ANA, gid, FOR_CAIO);
    const declined = await service.createInvite(ANA, gid, FOR_CAIO);
    const used = await service.createInvite(ANA, gid, FOR_CAIO);
    await service.revokeInvite(ANA, gid, revoked.id);
    await service.declineInvite(CAIO, declined.id);
    await service.joinByInvite(CAIO, used.token);
    clock.now = new Date(T0.getTime() + 2 * DAY);
    const stillThere = await service.createInvite(ANA, gid, {
      ...FOR_CAIO,
      target: { publicId: publicOf(BIA) },
    });
    expect(expired.id).not.toBe(stillThere.id);
    expect(await service.myInvites(CAIO)).toEqual([]);
    expect((await service.myInvites(BIA)).map((i) => i.id)).toEqual([stillThere.id]);
  });

  it('GRV-24: recusar deixa o convite declined na lista do grupo, sem avisar quem convidou', async () => {
    const { service, gid, notified } = await withGroup();
    const invite = await service.createInvite(ANA, gid, FOR_CAIO);
    const before = notified.length;
    await service.declineInvite(CAIO, invite.id);
    expect(notified).toHaveLength(before);
    expect((await service.listInvites(ANA, gid))[0]?.status).toBe('declined');
    expect(await service.myInvites(CAIO)).toEqual([]);
    const preview = await errorOf(service.previewInvite(CAIO, invite.token));
    expect(preview?.code).toBe('GROUP_INVITE_INVALID');
    expect(preview?.details).toMatchObject({ reason: 'declined' });
    const join = await errorOf(service.joinByInvite(CAIO, invite.token));
    expect(join?.details).toMatchObject({ reason: 'declined' });
  });

  it('GRV-24: recusar de novo não muda nada', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, FOR_CAIO);
    await service.declineInvite(CAIO, invite.id);
    expect(await errorOf(service.declineInvite(CAIO, invite.id))).toBeUndefined();
    expect((await service.listInvites(ANA, gid))[0]?.status).toBe('declined');
  });

  it('GRV-24: só o alvo recusa: para outra pessoa, ou convite que não existe → GROUP_INVITE_INVALID not_found', async () => {
    const { service, gid } = await withGroup();
    const invite = await service.createInvite(ANA, gid, FOR_CAIO);
    const other = await errorOf(service.declineInvite(DUDA, invite.id));
    expect(other?.code).toBe('GROUP_INVITE_INVALID');
    expect(other?.details).toMatchObject({ reason: 'not_found' });
    const missing = await errorOf(service.declineInvite(CAIO, '00000000-0000-4000-8000-000000000000'));
    expect(missing?.code).toBe('GROUP_INVITE_INVALID');
    expect(missing?.details).toMatchObject({ reason: 'not_found' });
    expect((await service.listInvites(ANA, gid))[0]?.status).toBe('active');
  });

  it('GRV-06/36: entrar por um convite que veio de "Convites para você" tira o cartão da lista', async () => {
    const { service, gid } = await withGroup();
    await service.createInvite(ANA, gid, FOR_CAIO);
    const [mine] = await service.myInvites(CAIO);
    const group = await service.joinByInvite(CAIO, mine?.token ?? '');
    expect(group.myTier).toBe('member');
    expect(await service.myInvites(CAIO)).toEqual([]);
  });
});
