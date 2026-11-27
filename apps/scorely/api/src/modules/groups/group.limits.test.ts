import type { AppError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import { asPublicUserId, asUserId } from '@scorely/api/src/lib/ids';
import { createGroupService } from '@scorely/api/src/modules/groups/group.service';
import {
  ANA,
  BIA,
  memoryGroups,
  noEmails,
  noNotifications,
  pid,
} from '@scorely/api/src/modules/groups/groups.memory';
import type { UserRecord } from '@scorely/api/src/modules/users/user.repository';
import { GROUP_PARTICIPANT_MAX } from '@scorely/contracts/src/groups';
import { describe, expect, it } from 'vitest';

// Teto de participantes (GRV-54), prazo do convite pessoal (GRV-23) e pedido que vence (GRV-27).

const T0 = new Date('2026-11-26T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const CAIO = asUserId('33333333-3333-4333-8333-333333333333');
const PUBLIC = {
  [ANA]: asPublicUserId('1AAAAAAA'),
  [BIA]: asPublicUserId('2BBBBBBB'),
  [CAIO]: asPublicUserId('3CCCCCCC'),
} as Record<string, ReturnType<typeof asPublicUserId>>;

function setup() {
  const mem = memoryGroups();
  const clock = { now: T0 };
  const seq = { n: 0 };
  const users = {
    getMany: async (ids: readonly UserId[]): Promise<UserRecord[]> =>
      ids.map((id) => ({
        id,
        publicId: (PUBLIC[id] ?? asPublicUserId(id.slice(-8).toUpperCase())) as UserRecord['publicId'],
        nickname: 'x',
        createdAt: '2026-01-01T00:00:00.000Z',
        version: 1,
      })),
    resolve: async (publicIds: readonly UserRecord['publicId'][]) =>
      new Map(
        publicIds.map(
          (p) =>
            [
              p,
              (Object.entries(PUBLIC).find(([, v]) => v === p)?.[0] ??
                `aaaaaaaa-0000-4000-8000-0000${String(p).toLowerCase()}`) as UserId,
            ] as const,
        ),
      ),
  };
  const service = createGroupService({
    groups: mem.repo,
    emails: noEmails,
    notifications: noNotifications,
    users,
    now: () => clock.now,
    newPublicId: () => pid('K3X9PQ2A'),
    newToken: () => {
      seq.n += 1;
      return `token-${seq.n}`;
    },
  });
  return { ...mem, clock, service };
}

async function errorOf(p: Promise<unknown>) {
  return (await p.then(
    () => undefined,
    (e: unknown) => e,
  )) as AppError | undefined;
}

const MEMBER_INVITE = {
  tier: 'member',
  validityDays: 7,
  maxUses: null,
} as const;

function userN(n: number): UserId {
  return asUserId(`aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`);
}

/** Grupo da Ana já com 100 participantes (a Ana mais 99), e um convite sem limite de usos. */
async function fullGroup() {
  const ctx = setup();
  const group = await ctx.service.create(ANA, { name: 'Pelada' });
  const invite = await ctx.service.createInvite(ANA, group.id, MEMBER_INVITE);
  for (const n of Array.from({ length: GROUP_PARTICIPANT_MAX - 1 }, (_, i) => i + 1)) {
    await ctx.service.joinByInvite(userN(n), invite.token);
  }
  return { ...ctx, gid: group.id, invite };
}

describe('groups teto de participantes (GRV-54)', () => {
  it('GRV-54: o limite é 100', () => {
    expect(GROUP_PARTICIPANT_MAX).toBe(100);
  });

  it('GRV-54: com 100, entrar por convite → GROUP_FULL (409) com details.limit', async () => {
    const { service, invite } = await fullGroup();
    const err = await errorOf(service.joinByInvite(BIA, invite.token));
    expect(err?.code).toBe('GROUP_FULL');
    expect(err?.status).toBe(409);
    expect(err?.details).toEqual({ limit: 100 });
    expect(await service.mine(BIA)).toEqual([]);
  });

  it('GRV-54: o convite cheio não gasta uso', async () => {
    const { service, gid, invite } = await fullGroup();
    const before = (await service.listInvites(ANA, gid)).find((i) => i.id === invite.id)?.uses;
    await errorOf(service.joinByInvite(BIA, invite.token));
    const after = (await service.listInvites(ANA, gid)).find((i) => i.id === invite.id)?.uses;
    expect(after).toBe(before);
  });

  it('GRV-54: o grupo com 99 aceita o 100º, e a apresentação conta 100', async () => {
    const { service, gid, invite } = await fullGroup();
    await service.leave(userN(1), gid);
    expect((await service.previewInvite(BIA, invite.token)).participants).toBe(99);
    await service.joinByInvite(BIA, invite.token);
    expect((await service.previewInvite(CAIO, invite.token)).participants).toBe(100);
  });

  it('GRV-54: duas pessoas na última vaga ao mesmo tempo → só uma entra', async () => {
    const { service, gid, invite } = await fullGroup();
    await service.leave(userN(1), gid);
    const [a, b] = await Promise.all([
      errorOf(service.joinByInvite(BIA, invite.token)),
      errorOf(service.joinByInvite(CAIO, invite.token)),
    ]);
    const failed = [a, b].filter((e) => e !== undefined);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.code).toBe('GROUP_FULL');
    expect((await service.previewInvite(userN(2), invite.token)).participants).toBe(100);
  });

  it('GRV-54: quem já participa e abre um convite de membro com o grupo cheio não recebe erro (reserva sobe a membro)', async () => {
    const ctx = setup();
    const group = await ctx.service.create(ANA, { name: 'Pelada' });
    const reserve = await ctx.service.createInvite(ANA, group.id, {
      tier: 'reserve',
      validityDays: 7,
      maxUses: null,
    });
    const member = await ctx.service.createInvite(ANA, group.id, MEMBER_INVITE);
    await ctx.service.joinByInvite(BIA, reserve.token);
    for (const n of Array.from({ length: GROUP_PARTICIPANT_MAX - 2 }, (_, i) => i + 1)) {
      await ctx.service.joinByInvite(userN(n), member.token);
    }
    expect((await ctx.service.previewInvite(CAIO, member.token)).participants).toBe(100);
    expect((await ctx.service.joinByInvite(BIA, member.token)).myTier).toBe('member');
    expect((await ctx.service.previewInvite(CAIO, member.token)).participants).toBe(100);
  });

  it('GRV-54: aceitar um pedido com o grupo cheio → GROUP_FULL e o pedido continua; pedir com o grupo cheio vale', async () => {
    const { service, gid, invite } = await fullGroup();
    const group = await service.get(ANA, gid);
    await service.setJoinMode(ANA, gid, {
      mode: 'open',
      expectedVersion: group.version,
    });
    const requested = await service.request(BIA, gid);
    expect(requested.requestedAt).toBe(T0.toISOString());
    const err = await errorOf(
      service.approveRequest(ANA, gid, PUBLIC[BIA] as ReturnType<typeof asPublicUserId>, { tier: 'member' }),
    );
    expect(err?.code).toBe('GROUP_FULL');
    expect(err?.details).toEqual({ limit: 100 });
    expect(await service.listRequests(ANA, gid)).toHaveLength(1);
    await service.leave(userN(1), gid);
    await service.approveRequest(ANA, gid, PUBLIC[BIA] as ReturnType<typeof asPublicUserId>, {
      tier: 'member',
    });
    expect((await service.previewInvite(CAIO, invite.token)).participants).toBe(100);
  });

  it('GRV-54/30/31: sair e remover abrem vaga e baixam a conta', async () => {
    const { service, gid, invite } = await fullGroup();
    await service.leave(userN(1), gid);
    await service.removeMember(ANA, gid, asPublicUserId(userN(2).slice(-8)));
    expect((await service.previewInvite(BIA, invite.token)).participants).toBe(98);
  });
});

describe('groups convite pessoal tem prazo (GRV-23)', () => {
  it('GRV-23: sem prazo para uma pessoa → VALIDATION_ERROR (por id público e por email)', async () => {
    const { service, gid } = await (async () => {
      const ctx = setup();
      const g = await ctx.service.create(ANA, { name: 'Pelada' });
      return { ...ctx, gid: g.id };
    })();
    const byId = await errorOf(
      service.createInvite(ANA, gid, {
        tier: 'member',
        validityDays: null,
        maxUses: null,
        target: { publicId: PUBLIC[BIA] as ReturnType<typeof asPublicUserId> },
      }),
    );
    const byEmail = await errorOf(
      service.createInvite(ANA, gid, {
        tier: 'member',
        validityDays: null,
        maxUses: null,
        target: { email: 'x@x.com' },
      }),
    );
    expect(byId?.code).toBe('VALIDATION_ERROR');
    expect(byEmail?.code).toBe('VALIDATION_ERROR');
  });

  it('GRV-23: com prazo de 30 dias para uma pessoa funciona; o convite comum continua podendo ser sem prazo', async () => {
    const ctx = setup();
    const g = await ctx.service.create(ANA, { name: 'Pelada' });
    const personal = await ctx.service.createInvite(ANA, g.id, {
      tier: 'member',
      validityDays: 30,
      maxUses: null,
      target: { publicId: PUBLIC[BIA] as ReturnType<typeof asPublicUserId> },
    });
    expect(personal.expiresAt).toBe(new Date(T0.getTime() + 30 * DAY).toISOString());
    const open = await ctx.service.createInvite(ANA, g.id, {
      tier: 'member',
      validityDays: null,
      maxUses: null,
    });
    expect(open.expiresAt).toBeUndefined();
  });
});

describe('groups pedido vence em 90 dias (GRV-27)', () => {
  async function openGroup() {
    const ctx = setup();
    const g = await ctx.service.create(ANA, { name: 'Pelada' });
    await ctx.service.setJoinMode(ANA, g.id, {
      mode: 'open',
      expectedVersion: g.version,
    });
    return { ...ctx, gid: g.id };
  }

  it('GRV-27: o pedido some da lista e da apresentação depois de 90 dias', async () => {
    const { service, gid, clock } = await openGroup();
    await service.request(BIA, gid);
    clock.now = new Date(T0.getTime() + 89 * DAY);
    expect(await service.listRequests(ANA, gid)).toHaveLength(1);
    expect((await service.preview(BIA, gid)).requestedAt).toBe(T0.toISOString());
    clock.now = new Date(T0.getTime() + 91 * DAY);
    expect(await service.listRequests(ANA, gid)).toHaveLength(0);
    expect((await service.preview(BIA, gid)).requestedAt).toBeUndefined();
  });

  it('GRV-27: pedir de novo sobre um vencido grava um pedido novo, com a data de agora', async () => {
    const { service, gid, clock } = await openGroup();
    await service.request(BIA, gid);
    clock.now = new Date(T0.getTime() + 91 * DAY);
    const again = await service.request(BIA, gid);
    expect(again.requestedAt).toBe(clock.now.toISOString());
    expect(await service.listRequests(ANA, gid)).toHaveLength(1);
  });

  it('GRV-27/28: aceitar um pedido vencido → GROUP_REQUEST_NOT_FOUND', async () => {
    const { service, gid, clock } = await openGroup();
    await service.request(BIA, gid);
    clock.now = new Date(T0.getTime() + 91 * DAY);
    const err = await errorOf(
      service.approveRequest(ANA, gid, PUBLIC[BIA] as ReturnType<typeof asPublicUserId>, { tier: 'member' }),
    );
    expect(err?.code).toBe('GROUP_REQUEST_NOT_FOUND');
  });
});
