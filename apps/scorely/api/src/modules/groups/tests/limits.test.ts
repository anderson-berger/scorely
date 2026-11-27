import type { UserId } from '@scorely/api/src/lib/ids';
import { asPublicUserId, asUserId } from '@scorely/api/src/lib/ids';
import { createGroup, getGroup, listMyGroups } from '@scorely/api/src/modules/groups/rules/groups';
import {
  createInvite,
  joinByInvite,
  listInvites,
  previewInvite,
} from '@scorely/api/src/modules/groups/rules/invites';
import { leave, removeMember } from '@scorely/api/src/modules/groups/rules/members';
import {
  approveRequest,
  listRequests,
  preview,
  request,
  setJoinMode,
} from '@scorely/api/src/modules/groups/rules/open';
import { ANA, BIA, CAIO, errorOf, setupGroups } from '@scorely/api/src/modules/groups/tests/fixtures';
import type { UserRecord } from '@scorely/api/src/modules/users/users.access';
import { GROUP_PARTICIPANT_MAX } from '@scorely/contracts/src/groups';
import { describe, expect, it } from 'vitest';

// Teto de participantes (GRV-54), prazo do convite pessoal (GRV-23) e pedido que vence (GRV-27).

const T0 = new Date('2026-11-26T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const PUBLIC = {
  [ANA]: asPublicUserId('1AAAAAAA'),
  [BIA]: asPublicUserId('2BBBBBBB'),
  [CAIO]: asPublicUserId('3CCCCCCC'),
} as Record<string, ReturnType<typeof asPublicUserId>>;

function setup() {
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
  return setupGroups({ now: T0, users });
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
  const group = await createGroup(ctx.deps, ANA, { name: 'Pelada' });
  const invite = await createInvite(ctx.deps, ANA, group.id, MEMBER_INVITE);
  for (const n of Array.from({ length: GROUP_PARTICIPANT_MAX - 1 }, (_, i) => i + 1)) {
    await joinByInvite(ctx.deps, userN(n), invite.token);
  }
  return { ...ctx, gid: group.id, invite };
}

describe('groups teto de participantes (GRV-54)', () => {
  it('GRV-54: o limite é 100', () => {
    expect(GROUP_PARTICIPANT_MAX).toBe(100);
  });

  it('GRV-54: com 100, entrar por convite → GROUP_FULL (409) com details.limit', async () => {
    const { invite, deps } = await fullGroup();
    const err = await errorOf(joinByInvite(deps, BIA, invite.token));
    expect(err?.code).toBe('GROUP_FULL');
    expect(err?.status).toBe(409);
    expect(err?.details).toEqual({ limit: 100 });
    expect(await listMyGroups(deps, BIA)).toEqual([]);
  });

  it('GRV-54: o convite cheio não gasta uso', async () => {
    const { deps, gid, invite } = await fullGroup();
    const before = (await listInvites(deps, ANA, gid)).find((i) => i.id === invite.id)?.uses;
    await errorOf(joinByInvite(deps, BIA, invite.token));
    const after = (await listInvites(deps, ANA, gid)).find((i) => i.id === invite.id)?.uses;
    expect(after).toBe(before);
  });

  it('GRV-54: o grupo com 99 aceita o 100º, e a apresentação conta 100', async () => {
    const { deps, gid, invite } = await fullGroup();
    await leave(deps, userN(1), gid);
    expect((await previewInvite(deps, BIA, invite.token)).participants).toBe(99);
    await joinByInvite(deps, BIA, invite.token);
    expect((await previewInvite(deps, CAIO, invite.token)).participants).toBe(100);
  });

  it('GRV-54: duas pessoas na última vaga ao mesmo tempo → só uma entra', async () => {
    const { deps, gid, invite } = await fullGroup();
    await leave(deps, userN(1), gid);
    const [a, b] = await Promise.all([
      errorOf(joinByInvite(deps, BIA, invite.token)),
      errorOf(joinByInvite(deps, CAIO, invite.token)),
    ]);
    const failed = [a, b].filter((e) => e !== undefined);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.code).toBe('GROUP_FULL');
    expect((await previewInvite(deps, userN(2), invite.token)).participants).toBe(100);
  });

  it('GRV-54: quem já participa e abre um convite de membro com o grupo cheio não recebe erro (reserva sobe a membro)', async () => {
    const ctx = setup();
    const group = await createGroup(ctx.deps, ANA, { name: 'Pelada' });
    const reserve = await createInvite(ctx.deps, ANA, group.id, {
      tier: 'reserve',
      validityDays: 7,
      maxUses: null,
    });
    const member = await createInvite(ctx.deps, ANA, group.id, MEMBER_INVITE);
    await joinByInvite(ctx.deps, BIA, reserve.token);
    for (const n of Array.from({ length: GROUP_PARTICIPANT_MAX - 2 }, (_, i) => i + 1)) {
      await joinByInvite(ctx.deps, userN(n), member.token);
    }
    expect((await previewInvite(ctx.deps, CAIO, member.token)).participants).toBe(100);
    expect((await joinByInvite(ctx.deps, BIA, member.token)).myTier).toBe('member');
    expect((await previewInvite(ctx.deps, CAIO, member.token)).participants).toBe(100);
  });

  it('GRV-54: aceitar um pedido com o grupo cheio → GROUP_FULL e o pedido continua; pedir com o grupo cheio vale', async () => {
    const { gid, invite, deps } = await fullGroup();
    const group = await getGroup(deps, ANA, gid);
    await setJoinMode(deps, ANA, gid, {
      mode: 'open',
      expectedVersion: group.version,
    });
    const requested = await request(deps, BIA, gid);
    expect(requested.requestedAt).toBe(T0.toISOString());
    const err = await errorOf(
      approveRequest(deps, ANA, gid, PUBLIC[BIA] as ReturnType<typeof asPublicUserId>, { tier: 'member' }),
    );
    expect(err?.code).toBe('GROUP_FULL');
    expect(err?.details).toEqual({ limit: 100 });
    expect(await listRequests(deps, ANA, gid)).toHaveLength(1);
    await leave(deps, userN(1), gid);
    await approveRequest(deps, ANA, gid, PUBLIC[BIA] as ReturnType<typeof asPublicUserId>, {
      tier: 'member',
    });
    expect((await previewInvite(deps, CAIO, invite.token)).participants).toBe(100);
  });

  it('GRV-54/30/31: sair e remover abrem vaga e baixam a conta', async () => {
    const { deps, gid, invite } = await fullGroup();
    await leave(deps, userN(1), gid);
    await removeMember(deps, ANA, gid, asPublicUserId(userN(2).slice(-8)));
    expect((await previewInvite(deps, BIA, invite.token)).participants).toBe(98);
  });
});

describe('groups convite pessoal tem prazo (GRV-23)', () => {
  it('GRV-23: sem prazo para uma pessoa → VALIDATION_ERROR (por id público e por email)', async () => {
    const { deps, gid } = await (async () => {
      const ctx = setup();
      const g = await createGroup(ctx.deps, ANA, { name: 'Pelada' });
      return { ...ctx, gid: g.id };
    })();
    const byId = await errorOf(
      createInvite(deps, ANA, gid, {
        tier: 'member',
        validityDays: null,
        maxUses: null,
        target: { publicId: PUBLIC[BIA] as ReturnType<typeof asPublicUserId> },
      }),
    );
    const byEmail = await errorOf(
      createInvite(deps, ANA, gid, {
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
    const g = await createGroup(ctx.deps, ANA, { name: 'Pelada' });
    const personal = await createInvite(ctx.deps, ANA, g.id, {
      tier: 'member',
      validityDays: 30,
      maxUses: null,
      target: { publicId: PUBLIC[BIA] as ReturnType<typeof asPublicUserId> },
    });
    expect(personal.expiresAt).toBe(new Date(T0.getTime() + 30 * DAY).toISOString());
    const open = await createInvite(ctx.deps, ANA, g.id, {
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
    const g = await createGroup(ctx.deps, ANA, { name: 'Pelada' });
    await setJoinMode(ctx.deps, ANA, g.id, {
      mode: 'open',
      expectedVersion: g.version,
    });
    return { ...ctx, gid: g.id };
  }

  it('GRV-27: o pedido some da lista e da apresentação depois de 90 dias', async () => {
    const { deps, gid, clock } = await openGroup();
    await request(deps, BIA, gid);
    clock.now = new Date(T0.getTime() + 89 * DAY);
    expect(await listRequests(deps, ANA, gid)).toHaveLength(1);
    expect((await preview(deps, BIA, gid)).requestedAt).toBe(T0.toISOString());
    clock.now = new Date(T0.getTime() + 91 * DAY);
    expect(await listRequests(deps, ANA, gid)).toHaveLength(0);
    expect((await preview(deps, BIA, gid)).requestedAt).toBeUndefined();
  });

  it('GRV-27: pedir de novo sobre um vencido grava um pedido novo, com a data de agora', async () => {
    const { deps, gid, clock } = await openGroup();
    await request(deps, BIA, gid);
    clock.now = new Date(T0.getTime() + 91 * DAY);
    const again = await request(deps, BIA, gid);
    expect(again.requestedAt).toBe(clock.now.toISOString());
    expect(await listRequests(deps, ANA, gid)).toHaveLength(1);
  });

  it('GRV-27/28: aceitar um pedido vencido → GROUP_REQUEST_NOT_FOUND', async () => {
    const { deps, gid, clock } = await openGroup();
    await request(deps, BIA, gid);
    clock.now = new Date(T0.getTime() + 91 * DAY);
    const err = await errorOf(
      approveRequest(deps, ANA, gid, PUBLIC[BIA] as ReturnType<typeof asPublicUserId>, { tier: 'member' }),
    );
    expect(err?.code).toBe('GROUP_REQUEST_NOT_FOUND');
  });
});
