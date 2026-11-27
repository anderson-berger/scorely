import { appError } from '@scorely/api/src/lib/errors';
import { asGroupId, asPublicGroupId, asUserId, type UserId } from '@scorely/api/src/lib/ids';
import type { GroupAccess } from '@scorely/api/src/modules/groups/group.access';
import { createMatchService } from '@scorely/api/src/modules/groups/matches/match.service';
import { memoryMatches } from '@scorely/api/src/modules/groups/matches/matches.memory';
import type { UserRecord } from '@scorely/api/src/modules/users/user.repository';
import type { GroupPermission, GroupTier, MatchEntry, UpdateMatchInput } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Convidados da partida (PAR-11–14). Repositório em memória, grupo falso e relógio fake.

const ANA = asUserId('11111111-1111-4111-8111-111111111111'); // Dono: matches.manage
const BIA = asUserId('22222222-2222-4222-8222-222222222222');
const CAIO = asUserId('33333333-3333-4333-8333-333333333333');
const DUDA = asUserId('44444444-4444-4444-8444-444444444444');
const STRANGER = asUserId('99999999-9999-4999-8999-999999999999');
const PUBLIC_ID = asPublicGroupId('K3X9PQ2A');
const GROUP_ID = asGroupId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const PUB = {
  [ANA]: '1AAAAAAA',
  [BIA]: '2BBBBBBB',
  [CAIO]: '3CCCCCCC',
  [DUDA]: '4DDDDDDD',
} as Record<string, string>;

const HOUR = 3_600_000;
const T0 = '2026-11-23T10:00:00.000Z';
const START = '2026-11-27T22:00:00.000Z';
const END = '2026-11-28T00:00:00.000Z';
const MEMBERS_AT = '2026-11-24T22:00:00.000Z';
const GUESTS_AT = '2026-11-27T16:00:00.000Z';
const iso = (base: string, hours: number) => new Date(Date.parse(base) + hours * HOUR).toISOString();

const JOINED_AT = '2026-01-01T00:00:00.000Z';

function setup() {
  const clock = { now: new Date(T0) };
  const sent: { userId: UserId; type: string; link?: string | undefined }[] = [];
  const state = {
    participants: new Map<UserId, GroupTier>([
      [ANA, 'member'],
      [BIA, 'member'],
      [CAIO, 'member'],
      [DUDA, 'reserve'],
    ]),
    managers: new Set<UserId>([ANA]),
  };
  const groups: GroupAccess = {
    access: async (userId, publicId) => {
      const tier = state.participants.get(userId);
      if (tier === undefined || publicId !== PUBLIC_ID) throw appError('GROUP_NOT_FOUND');
      const permissions: GroupPermission[] = state.managers.has(userId) ? ['matches.manage'] : [];
      return {
        groupId: GROUP_ID,
        publicId: PUBLIC_ID,
        name: 'Pelada de sexta',
        tier,
        permissions,
      };
    },
    participants: async () =>
      new Map([...state.participants].map(([id, tier]) => [id, { tier, joinedAt: JOINED_AT }])),
    holders: async () => [...state.managers],
  };
  const users = {
    getMany: async (ids: readonly UserId[]): Promise<UserRecord[]> =>
      ids
        .filter((id) => PUB[id] !== undefined)
        .map((id) => ({
          id,
          publicId: PUB[id] as UserRecord['publicId'],
          nickname: (PUB[id] as string).toLowerCase(),
          createdAt: '2026-01-01T00:00:00.000Z',
          version: 1,
        })),
    resolve: async (publicIds: readonly UserRecord['publicId'][]) =>
      new Map(
        Object.entries(PUB)
          .filter(([, pub]) => publicIds.includes(pub as UserRecord['publicId']))
          .map(([id, pub]) => [pub as UserRecord['publicId'], id as UserId]),
      ),
  };
  const notifications = {
    notify: async (userId: UserId, n: { type: string; link?: string }) => {
      sent.push({ userId, type: n.type, link: n.link });
    },
  };
  const service = createMatchService({
    matches: memoryMatches().repo,
    groups,
    users,
    notifications: notifications as never,
    now: () => clock.now,
  });
  const at = (when: string) => {
    clock.now = new Date(when);
  };
  return { service, at, sent, state };
}
type T = ReturnType<typeof setup>;

type Settings = Omit<UpdateMatchInput, 'expectedVersion'>;

function input(over: Partial<Settings> = {}): Settings {
  return {
    startsAt: START,
    endsAt: END,
    teams: 1,
    playersPerTeam: 2,
    membersHours: 72,
    reservesHours: 24,
    guestsHours: 6,
    noGuests: false,
    closeHours: 0,
    resultMode: 'day',
    ...over,
  };
}

/** Cria só com início e fim (PAR-01) e ajusta as configurações (PAR-06). */
async function createWith(t: T, over: Partial<Settings> = {}) {
  const first = await t.service.create(ANA, PUBLIC_ID, {
    startsAt: START,
    endsAt: END,
  });
  return t.service.update(ANA, PUBLIC_ID, first.id, {
    ...input(over),
    expectedVersion: first.version,
  });
}

/** Cria a partida e põe o relógio na onda de convidados. */
async function open(t: T, over: Partial<Settings> = {}) {
  const m = await createWith(t, over);
  t.at(GUESTS_AT);
  return m;
}
const ask = (t: T, user: UserId, matchId: string, name: string) =>
  t.service.requestGuest(user, PUBLIC_ID, matchId, { name });
const approve = (t: T, user: UserId, matchId: string, guestId: string) =>
  t.service.approveGuest(user, PUBLIC_ID, matchId, guestId);
const remove = (t: T, user: UserId, matchId: string, guestId: string) =>
  t.service.removeGuest(user, PUBLIC_ID, matchId, guestId);
const get = (t: T, user: UserId, matchId: string) => t.service.get(user, PUBLIC_ID, matchId);
const go = (t: T, user: UserId, matchId: string) =>
  t.service.setAttendance(user, PUBLIC_ID, matchId, { status: 'going' });
const names = (entries: readonly MatchEntry[]) =>
  entries.map((e) => (e.kind === 'player' ? e.user.id : e.name));
const link = (matchId: string) => `/groups/${PUBLIC_ID}/matches/${matchId}`;

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return err as { code: string; status: number; details?: unknown };
  }
}

/** Pede o convidado como `BIA` e devolve o id dele. */
async function pending(t: T, matchId: string, name = 'Primo do Edu', by: UserId = BIA) {
  const m = await ask(t, by, matchId, name);
  const found = m.guestRequests.find((g) => g.name === name);
  if (!found) throw new Error('request not found');
  return found.id;
}

describe('PAR-12: pedir um convidado', () => {
  it('PAR-12: quem participa pede só com o nome; fica pending, fora da lista, e não precisa ter dito "vou"', async () => {
    const t = setup();
    const m = await open(t);
    const after = await ask(t, BIA, m.id, 'Primo do Edu');
    expect(after.in).toEqual([]);
    expect(after.guestRequests).toHaveLength(1);
    expect(after.guestRequests[0]).toMatchObject({
      name: 'Primo do Edu',
      requestedBy: { id: PUB[BIA] },
    });
  });

  it('PAR-12: antes da onda de convidados responde MATCH_NOT_OPEN_FOR_YOU', async () => {
    const t = setup();
    const m = await createWith(t);
    t.at('2026-11-27T15:59:00.000Z');
    const err = await failure(ask(t, BIA, m.id, 'Joao'));
    expect(err?.code).toBe('MATCH_NOT_OPEN_FOR_YOU');
    expect(err?.status).toBe(409);
  });

  it('PAR-12, PAR-05: com a onda aberta à mão, o pedido passa', async () => {
    const t = setup();
    const m = await createWith(t, { guestsHours: undefined, noGuests: true });
    t.at(MEMBERS_AT);
    await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'guests' });
    expect((await ask(t, BIA, m.id, 'Joao')).guestRequests).toHaveLength(1);
  });

  it('PAR-12, PAR-03: sem a abertura configurada, o pedido passa desde a criação', async () => {
    const t = setup();
    const m = await t.service.create(ANA, PUBLIC_ID, {
      startsAt: START,
      endsAt: END,
    });
    expect((await ask(t, BIA, m.id, 'Joao')).guestRequests).toHaveLength(1);
    expect((await get(t, BIA, m.id)).actions.requestGuest).toBe(true);
  });

  it('PAR-12, PAR-03: com "sem convidados" o pedido responde MATCH_NOT_OPEN_FOR_YOU, sem details.opensAt', async () => {
    const t = setup();
    const m = await createWith(t, { noGuests: true, guestsHours: undefined });
    t.at(GUESTS_AT);
    const err = await failure(ask(t, BIA, m.id, 'Joao'));
    expect(err?.code).toBe('MATCH_NOT_OPEN_FOR_YOU');
    expect(err?.status).toBe(409);
    expect(err?.details ?? {}).not.toHaveProperty('opensAt');
    expect((await get(t, BIA, m.id)).actions.requestGuest).toBe(false);
  });

  it('PAR-12: depois do fechamento responde MATCH_CLOSED', async () => {
    const t = setup();
    const m = await open(t, { closeHours: 1 });
    t.at(iso(START, -1));
    expect((await failure(ask(t, BIA, m.id, 'Joao')))?.code).toBe('MATCH_CLOSED');
  });

  it('PAR-12: quem não participa recebe GROUP_NOT_FOUND', async () => {
    const t = setup();
    const m = await open(t);
    expect((await failure(ask(t, STRANGER, m.id, 'Joao')))?.code).toBe('GROUP_NOT_FOUND');
  });

  it('PAR-12: o nome tem de 1 a 40 caracteres, sem os espaços das pontas (contrato)', async () => {
    const { MatchGuestNameSchema } = await import('@scorely/contracts');
    expect(MatchGuestNameSchema.parse('  Joao  ')).toBe('Joao');
    expect(MatchGuestNameSchema.safeParse('   ').success).toBe(false);
    expect(MatchGuestNameSchema.safeParse('a'.repeat(41)).success).toBe(false);
    expect(MatchGuestNameSchema.safeParse('a'.repeat(40)).success).toBe(true);
  });

  it('PAR-12: o nome repetido (sem diferenciar maiúsculas, acentos e espaços repetidos) responde MATCH_GUEST_DUPLICATE', async () => {
    const t = setup();
    const m = await open(t);
    await ask(t, BIA, m.id, 'João  Silva');
    const err = await failure(ask(t, CAIO, m.id, 'joao silva'));
    expect(err?.code).toBe('MATCH_GUEST_DUPLICATE');
    expect(err?.status).toBe(409);
  });

  it('PAR-12: um nome recusado, desistido ou removido pode ser pedido de novo', async () => {
    const t = setup();
    const m = await open(t);
    const declined = await pending(t, m.id, 'Joao');
    await t.service.declineGuest(ANA, PUBLIC_ID, m.id, declined);
    const again = await ask(t, BIA, m.id, 'Joao');
    expect(again.guestRequests).toHaveLength(1);
    await remove(t, BIA, m.id, again.guestRequests[0]?.id as string);
    expect((await ask(t, CAIO, m.id, 'Joao')).guestRequests).toHaveLength(1);
  });

  it('PAR-12: o 31º convidado pending ou approved responde MATCH_GUEST_LIMIT com details.limit = 30', async () => {
    const t = setup();
    const m = await open(t);
    for (const n of Array.from({ length: 30 }, (_, i) => i)) await ask(t, BIA, m.id, `Convidado ${n}`);
    const err = await failure(ask(t, BIA, m.id, 'Convidado 31'));
    expect(err?.code).toBe('MATCH_GUEST_LIMIT');
    expect(err?.status).toBe(409);
    expect(err?.details).toMatchObject({ limit: 30 });
  });

  it('PAR-12: pedidos ao mesmo tempo nunca passam dos 30 nem repetem o nome', async () => {
    const t = setup();
    const m = await open(t);
    const results = await Promise.allSettled(
      Array.from({ length: 35 }, (_, i) => ask(t, BIA, m.id, `G${i}`)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(30);
    const same = await Promise.allSettled([ask(t, CAIO, m.id, 'Repetido'), ask(t, DUDA, m.id, 'repetido')]);
    expect(same.filter((r) => r.status === 'rejected').length).toBeGreaterThanOrEqual(1);
  });

  it('PAR-12: quem tem matches.manage e pede cria o convidado já approved (na lista), sem aviso', async () => {
    const t = setup();
    const m = await open(t);
    const after = await ask(t, ANA, m.id, 'Joao');
    expect(names(after.in)).toEqual(['Joao']);
    expect(after.guestRequests).toEqual([]);
    expect(t.sent).toEqual([]);
  });

  it('PAR-12: quem tem matches.manage recebe match_guest_requested com o link; quem pediu não é avisado', async () => {
    const t = setup();
    const m = await open(t);
    await ask(t, BIA, m.id, 'Joao');
    expect(t.sent).toEqual([{ userId: ANA, type: 'match_guest_requested', link: link(m.id) }]);
  });

  it('PAR-12: o pedido só aparece para quem tem matches.manage e para quem pediu', async () => {
    const t = setup();
    const m = await open(t);
    await ask(t, BIA, m.id, 'Joao');
    const seenBy = async (user: UserId) => (await t.service.get(user, PUBLIC_ID, m.id)).guestRequests;
    expect(await seenBy(ANA)).toHaveLength(1);
    expect(await seenBy(BIA)).toHaveLength(1);
    expect(await seenBy(CAIO)).toEqual([]);
  });
});

describe('PAR-11: situações do convidado', () => {
  it('PAR-11: pending não está na lista e conta no limite; approved entra na lista', async () => {
    const t = setup();
    const m = await open(t);
    const id = await pending(t, m.id);
    expect((await t.service.get(ANA, PUBLIC_ID, m.id)).in).toEqual([]);
    const after = await approve(t, ANA, m.id, id);
    expect(names(after.in)).toEqual(['Primo do Edu']);
    expect(after.guestRequests).toEqual([]);
  });

  it('PAR-11: declined não volta: aprovar depois responde MATCH_GUEST_NOT_PENDING com details.status', async () => {
    const t = setup();
    const m = await open(t);
    const id = await pending(t, m.id);
    await t.service.declineGuest(ANA, PUBLIC_ID, m.id, id);
    const err = await failure(approve(t, ANA, m.id, id));
    expect(err?.code).toBe('MATCH_GUEST_NOT_PENDING');
    expect(err?.details).toMatchObject({ status: 'declined' });
  });

  it('PAR-11: o recusado, o desistido e o removido não contam no limite', async () => {
    const t = setup();
    const m = await open(t);
    const ids = [] as string[];
    for (const n of Array.from({ length: 30 }, (_, i) => i)) ids.push(await pending(t, m.id, `G${n}`));
    await t.service.declineGuest(ANA, PUBLIC_ID, m.id, ids[0] as string);
    expect((await ask(t, BIA, m.id, 'Novo')).guestRequests.some((g) => g.name === 'Novo')).toBe(true);
  });
});

describe('PAR-13: liberar e recusar', () => {
  it('PAR-13: liberar põe o convidado na lista, com o nome e quem o trouxe', async () => {
    const t = setup();
    const m = await open(t);
    const id = await pending(t, m.id, 'Joao');
    const after = await approve(t, ANA, m.id, id);
    expect(after.in[0]).toMatchObject({
      kind: 'guest',
      name: 'Joao',
      guestId: id,
      requestedBy: { id: PUB[BIA] },
    });
  });

  it('PAR-13, PAR-09: a posição é a da liberação, não a do pedido', async () => {
    const t = setup();
    const m = await open(t, { playersPerTeam: 2 });
    const id = await pending(t, m.id, 'Joao');
    t.at(iso(GUESTS_AT, 0.1));
    await go(t, CAIO, m.id);
    t.at(iso(GUESTS_AT, 0.2));
    await approve(t, ANA, m.id, id);
    t.at(iso(GUESTS_AT, 0.3));
    const after = await go(t, BIA, m.id);
    expect(names(after.in)).toEqual([PUB[CAIO], 'Joao']);
    expect(names(after.queue)).toEqual([PUB[BIA]]);
  });

  it('PAR-13, PAR-09: com as vagas cheias, o convidado liberado vai para a fila', async () => {
    const t = setup();
    const m = await open(t, { playersPerTeam: 1 });
    await go(t, CAIO, m.id);
    t.at(iso(GUESTS_AT, 0.1));
    const id = await pending(t, m.id, 'Joao');
    t.at(iso(GUESTS_AT, 0.2));
    const after = await approve(t, ANA, m.id, id);
    expect(names(after.in)).toEqual([PUB[CAIO]]);
    expect(names(after.queue)).toEqual(['Joao']);
  });

  it('PAR-13: só quem tem matches.manage libera e recusa (GROUP_PERMISSION_DENIED)', async () => {
    const t = setup();
    const m = await open(t);
    const id = await pending(t, m.id);
    expect((await failure(approve(t, BIA, m.id, id)))?.code).toBe('GROUP_PERMISSION_DENIED');
    expect((await failure(t.service.declineGuest(BIA, PUBLIC_ID, m.id, id)))?.code).toBe(
      'GROUP_PERMISSION_DENIED',
    );
  });

  it('PAR-13: liberar pede a lista não fechada (MATCH_CLOSED); recusar vale até o início', async () => {
    const t = setup();
    const m = await open(t, { closeHours: 1 });
    const id = await pending(t, m.id, 'Joao');
    const other = await pending(t, m.id, 'Maria');
    t.at(iso(START, -0.5));
    expect((await failure(approve(t, ANA, m.id, id)))?.code).toBe('MATCH_CLOSED');
    expect(
      (await t.service.declineGuest(ANA, PUBLIC_ID, m.id, other)).guestRequests.map((g) => g.name),
    ).toEqual(['Joao']);
  });

  it('PAR-13: recusar sai sem aviso para ninguém', async () => {
    const t = setup();
    const m = await open(t);
    const id = await pending(t, m.id);
    t.sent.length = 0;
    await t.service.declineGuest(ANA, PUBLIC_ID, m.id, id);
    expect(t.sent).toEqual([]);
  });

  it('PAR-13: decidir um pedido que já não está pending responde MATCH_GUEST_NOT_PENDING (409) com a situação', async () => {
    const t = setup();
    const m = await open(t);
    const id = await pending(t, m.id);
    await approve(t, ANA, m.id, id);
    const err = await failure(t.service.declineGuest(ANA, PUBLIC_ID, m.id, id));
    expect(err?.code).toBe('MATCH_GUEST_NOT_PENDING');
    expect(err?.status).toBe(409);
    expect(err?.details).toMatchObject({ status: 'approved' });
  });

  it('PAR-13: quem pediu desistiu antes da decisão (o pedido foi apagado): decidir responde MATCH_GUEST_NOT_FOUND (404)', async () => {
    const t = setup();
    const m = await open(t);
    const id = await pending(t, m.id);
    await remove(t, BIA, m.id, id);
    const approved = await failure(approve(t, ANA, m.id, id));
    expect(approved?.code).toBe('MATCH_GUEST_NOT_FOUND');
    expect(approved?.status).toBe(404);
    expect((await failure(t.service.declineGuest(ANA, PUBLIC_ID, m.id, id)))?.code).toBe(
      'MATCH_GUEST_NOT_FOUND',
    );
  });

  it('PAR-13: um id que não existe responde MATCH_GUEST_NOT_FOUND (404)', async () => {
    const t = setup();
    const m = await open(t);
    const err = await failure(approve(t, ANA, m.id, '00000000-0000-4000-8000-000000000000'));
    expect(err?.code).toBe('MATCH_GUEST_NOT_FOUND');
    expect(err?.status).toBe(404);
  });

  it('PAR-13: a decisão do pedido marca decidable para quem tem matches.manage, e só para ele', async () => {
    const t = setup();
    const m = await open(t);
    await pending(t, m.id);
    const forAna = (await t.service.get(ANA, PUBLIC_ID, m.id)).guestRequests[0];
    const forBia = (await t.service.get(BIA, PUBLIC_ID, m.id)).guestRequests[0];
    expect(forAna).toMatchObject({ decidable: true, cancellable: false });
    expect(forBia).toMatchObject({ decidable: false, cancellable: true });
  });
});

describe('PAR-14: tirar o convidado', () => {
  it('PAR-14: um pending só quem pediu tira (o pedido é apagado); outro membro e quem organiza recebem GROUP_PERMISSION_DENIED', async () => {
    const t = setup();
    const m = await open(t);
    const id = await pending(t, m.id);
    expect((await failure(remove(t, CAIO, m.id, id)))?.code).toBe('GROUP_PERMISSION_DENIED');
    expect((await failure(remove(t, ANA, m.id, id)))?.code).toBe('GROUP_PERMISSION_DENIED');
    const after = await remove(t, BIA, m.id, id);
    expect(after.guestRequests).toEqual([]);
    expect(after.in).toEqual([]);
  });

  it('PAR-14: quem desiste do pedido pode pedir o mesmo nome de novo, e desistir de novo responde MATCH_GUEST_NOT_FOUND', async () => {
    const t = setup();
    const m = await open(t);
    const id = await pending(t, m.id, 'Joao');
    await remove(t, BIA, m.id, id);
    expect((await failure(remove(t, BIA, m.id, id)))?.code).toBe('MATCH_GUEST_NOT_FOUND');
    const again = await ask(t, BIA, m.id, 'Joao');
    expect(again.guestRequests).toHaveLength(1);
    expect(again.guestRequests[0]?.id).not.toBe(id);
  });

  it('PAR-14: um approved, quem pediu tira (vira removed) e a fila sobe com o aviso ao promovido', async () => {
    const t = setup();
    const m = await open(t, { playersPerTeam: 1 });
    const id = await pending(t, m.id, 'Joao');
    await approve(t, ANA, m.id, id);
    t.at(iso(GUESTS_AT, 0.1));
    await go(t, CAIO, m.id);
    t.sent.length = 0;
    const after = await remove(t, BIA, m.id, id);
    expect(names(after.in)).toEqual([PUB[CAIO]]);
    expect(t.sent).toEqual([{ userId: CAIO, type: 'match_promoted', link: link(m.id) }]);
  });

  it('PAR-14: um approved, quem tem matches.manage também tira; outro membro não', async () => {
    const t = setup();
    const m = await open(t);
    const id = await pending(t, m.id, 'Joao');
    await approve(t, ANA, m.id, id);
    expect((await failure(remove(t, CAIO, m.id, id)))?.code).toBe('GROUP_PERMISSION_DENIED');
    expect((await remove(t, ANA, m.id, id)).in).toEqual([]);
  });

  it('PAR-14: a lista marca removable para quem pode tirar o convidado liberado', async () => {
    const t = setup();
    const m = await open(t);
    const id = await pending(t, m.id, 'Joao');
    await approve(t, ANA, m.id, id);
    const removable = async (user: UserId) => {
      const entry = (await t.service.get(user, PUBLIC_ID, m.id)).in[0];
      return entry?.kind === 'guest' && entry.removable;
    };
    expect(await removable(BIA)).toBe(true);
    expect(await removable(ANA)).toBe(true);
    expect(await removable(CAIO)).toBe(false);
  });

  it('PAR-14: um convidado que já saiu responde MATCH_GUEST_NOT_PENDING com a situação', async () => {
    const t = setup();
    const m = await open(t);
    const id = await pending(t, m.id, 'Joao');
    await approve(t, ANA, m.id, id);
    await remove(t, BIA, m.id, id);
    const err = await failure(remove(t, BIA, m.id, id));
    expect(err?.code).toBe('MATCH_GUEST_NOT_PENDING');
    expect(err?.details).toMatchObject({ status: 'removed' });
  });

  it('PAR-14: depois do início responde MATCH_STARTED', async () => {
    const t = setup();
    const m = await open(t);
    const id = await pending(t, m.id);
    t.at(START);
    await t.service.start(ANA, PUBLIC_ID, m.id);
    expect((await failure(remove(t, BIA, m.id, id)))?.code).toBe('MATCH_STARTED');
  });

  it('PAR-07, PAR-14: cancelada a partida, mexer nos convidados responde MATCH_CANCELLED', async () => {
    const t = setup();
    const m = await open(t);
    const id = await pending(t, m.id);
    await t.service.cancel(ANA, PUBLIC_ID, m.id);
    expect((await failure(approve(t, ANA, m.id, id)))?.code).toBe('MATCH_CANCELLED');
    expect((await failure(remove(t, BIA, m.id, id)))?.code).toBe('MATCH_CANCELLED');
    expect((await failure(ask(t, BIA, m.id, 'Outro')))?.code).toBe('MATCH_CANCELLED');
  });

  it('PAR-09: o convidado liberado não recebe aviso (não tem conta); a promoção só avisa quem tem', async () => {
    const t = setup();
    const m = await open(t, { playersPerTeam: 1 });
    await go(t, CAIO, m.id);
    t.at(iso(GUESTS_AT, 0.1));
    const id = await pending(t, m.id, 'Joao');
    t.at(iso(GUESTS_AT, 0.2));
    await approve(t, ANA, m.id, id);
    t.sent.length = 0;
    await t.service.setAttendance(CAIO, PUBLIC_ID, m.id, {
      status: 'not_going',
    });
    expect(t.sent).toEqual([]);
    expect(names((await t.service.get(ANA, PUBLIC_ID, m.id)).in)).toEqual(['Joao']);
  });
});
