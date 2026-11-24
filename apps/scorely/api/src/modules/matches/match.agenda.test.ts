import { appError } from '@scorely/api/src/lib/errors';
import { asGroupId, asPublicGroupId, asUserId, type UserId } from '@scorely/api/src/lib/ids';
import type { GroupAccess } from '@scorely/api/src/modules/groups/group.access';
import { createMatchService } from '@scorely/api/src/modules/matches/match.service';
import { memoryMatches } from '@scorely/api/src/modules/matches/matches.memory';
import type { UserRecord } from '@scorely/api/src/modules/users/user.repository';
import type { GroupTier } from '@scorely/contracts';
import { describe, expect, it, vi } from 'vitest';

// Rotina matchesAgenda isolada por item (partidas.md, seção 3, "A rotina"; PAR-21, 24).

const ANA = asUserId('11111111-1111-4111-8111-111111111111');
const CAIO = asUserId('33333333-3333-4333-8333-333333333333');
const PUBLIC_ID = asPublicGroupId('K3X9PQ2A');
const GROUP_ID = asGroupId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const HOUR = 3_600_000;
const T0 = '2026-11-23T10:00:00.000Z';
const iso = (base: string, hours: number) => new Date(Date.parse(base) + hours * HOUR).toISOString();
const link = (matchId: string) => `/groups/${PUBLIC_ID}/matches/${matchId}`;

function setup() {
  const clock = { now: new Date(T0) };
  const sent: { userId: UserId; link?: string | undefined }[] = [];
  const failing = { link: '', matchId: '' };
  const participants = new Map<UserId, GroupTier>([
    [ANA, 'member'],
    [CAIO, 'member'],
  ]);
  const groups: GroupAccess = {
    access: async (userId, publicId) => {
      const tier = participants.get(userId);
      if (tier === undefined || publicId !== PUBLIC_ID) throw appError('GROUP_NOT_FOUND');
      return {
        groupId: GROUP_ID,
        publicId: PUBLIC_ID,
        name: 'Pelada',
        tier,
        permissions: ['matches.manage'],
      };
    },
    participants: async () => new Map(participants),
    holders: async () => [ANA],
  };
  const users = {
    getMany: async (ids: readonly UserId[]): Promise<UserRecord[]> =>
      ids.map((id) => ({
        id,
        publicId: (id === ANA ? '1AAAAAAA' : '3CCCCCCC') as UserRecord['publicId'],
        nickname: id === ANA ? '1aaaaaaa' : '3ccccccc',
        createdAt: '2026-01-01T00:00:00.000Z',
        version: 1,
      })),
  };
  const notifications = {
    notify: async (userId: UserId, n: { type: string; link?: string }) => {
      if (n.link === failing.link) throw new Error('boom');
      sent.push({ userId, link: n.link });
    },
  };
  const base = memoryMatches().repo;
  const matches: typeof base = {
    ...base,
    getMatch: async (groupId, matchId, read) => {
      if (matchId === failing.matchId) throw new Error('read failed');
      return base.getMatch(groupId, matchId, read);
    },
  };
  const service = createMatchService({
    matches,
    groups,
    users,
    notifications: notifications as never,
    now: () => clock.now,
  });
  return { service, clock, sent, failing };
}

const configured = async (t: ReturnType<typeof setup>, startsAt: string) => {
  const first = await t.service.create(ANA, PUBLIC_ID, { startsAt, endsAt: iso(startsAt, 2) });
  return t.service.update(ANA, PUBLIC_ID, first.id, {
    startsAt,
    endsAt: iso(startsAt, 2),
    membersHours: 72,
    reservesHours: 24,
    guestsHours: 6,
    noGuests: false,
    closeHours: 0,
    expectedVersion: first.version,
  });
};

describe('PAR-21, 24: a rotina trata cada item da agenda sozinho', () => {
  it('PAR-24: um item que falha antes de marcar a onda não impede os outros, fica na agenda e a próxima execução trata ele', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = setup();
    const a = await configured(t, '2026-11-27T22:00:00.000Z'); // abre 24/11 22h
    const b = await configured(t, '2026-11-27T23:00:00.000Z'); // abre 24/11 23h
    t.failing.matchId = a.id;
    t.clock.now = new Date('2026-11-25T00:00:00.000Z');
    await expect(t.service.runAgenda()).resolves.not.toThrow();
    const sentToB = t.sent.filter((n) => n.link === link(b.id)).length;
    expect(sentToB).toBeGreaterThan(0);
    expect(t.sent.filter((n) => n.link === link(a.id))).toEqual([]);
    t.failing.matchId = '';
    t.clock.now = new Date('2026-11-25T00:15:00.000Z');
    await t.service.runAgenda();
    expect(t.sent.some((n) => n.userId === CAIO && n.link === link(a.id))).toBe(true);
    t.clock.now = new Date('2026-11-25T00:30:00.000Z');
    await t.service.runAgenda();
    expect(t.sent.filter((n) => n.link === link(b.id))).toHaveLength(sentToB);
  });

  it('PAR-24: o aviso que falha no envio depois de marcar a onda não sai de novo (limite do doc)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = setup();
    const a = await configured(t, '2026-11-27T22:00:00.000Z');
    const b = await configured(t, '2026-11-27T23:00:00.000Z');
    t.failing.link = link(a.id);
    t.clock.now = new Date('2026-11-25T00:00:00.000Z');
    await expect(t.service.runAgenda()).resolves.not.toThrow();
    expect(t.sent.filter((n) => n.link === link(b.id)).length).toBeGreaterThan(0);
    t.failing.link = '';
    t.clock.now = new Date('2026-11-25T00:15:00.000Z');
    await t.service.runAgenda();
    t.clock.now = new Date('2026-11-25T00:30:00.000Z');
    await t.service.runAgenda();
    expect(t.sent.filter((n) => n.link === link(a.id))).toEqual([]);
  });
});
