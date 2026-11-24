import { appError } from '@scorely/api/src/lib/errors';
import { asGroupId, asPublicGroupId, asUserId, type UserId } from '@scorely/api/src/lib/ids';
import type { GroupAccess } from '@scorely/api/src/modules/groups/group.access';
import { createMatchService } from '@scorely/api/src/modules/matches/match.service';
import { memoryMatches } from '@scorely/api/src/modules/matches/matches.memory';
import type { UserRecord } from '@scorely/api/src/modules/users/user.repository';
import {
  CreateMatchInputSchema,
  type GroupPermission,
  type GroupTier,
  type MatchEntry,
  type UpdateMatchInput,
  UpdateMatchInputSchema,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Partidas: criar, ondas, responder, fila, editar, cancelar e ver (PAR-01–10, 15, 16). Convidados: match.guests.test.ts.
// Repositório em memória, grupo falso e relógio fake. Os avisos são conferidos por tipo, destinatário e link.

const ANA = asUserId('11111111-1111-4111-8111-111111111111'); // Dono: matches.manage
const BIA = asUserId('22222222-2222-4222-8222-222222222222');
const CAIO = asUserId('33333333-3333-4333-8333-333333333333');
const DUDA = asUserId('44444444-4444-4444-8444-444444444444'); // reserva
const EDU = asUserId('55555555-5555-4555-8555-555555555555');
const STRANGER = asUserId('99999999-9999-4999-8999-999999999999');
const PUBLIC_ID = asPublicGroupId('K3X9PQ2A');
const GROUP_ID = asGroupId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const PUB = {
  [ANA]: '1AAAAAAA',
  [BIA]: '2BBBBBBB',
  [CAIO]: '3CCCCCCC',
  [DUDA]: '4DDDDDDD',
  [EDU]: '5EEEEEEE',
} as Record<string, string>;

const HOUR = 3_600_000;
const T0 = '2026-11-23T10:00:00.000Z';
/** Sexta, 27/11, 19h em São Paulo. */
const START = '2026-11-27T22:00:00.000Z';
const END = '2026-11-28T00:00:00.000Z';
const MEMBERS_AT = '2026-11-24T22:00:00.000Z'; // 72 h antes
const RESERVES_AT = '2026-11-26T22:00:00.000Z'; // 24 h antes
const GUESTS_AT = '2026-11-27T16:00:00.000Z'; // 6 h antes
const iso = (base: string, hours: number) => new Date(Date.parse(base) + hours * HOUR).toISOString();

function setup() {
  const clock = { now: new Date(T0) };
  const sent: { userId: UserId; type: string; link?: string | undefined }[] = [];
  const state = {
    participants: new Map<UserId, GroupTier>([
      [ANA, 'member'],
      [BIA, 'member'],
      [CAIO, 'member'],
      [DUDA, 'reserve'],
      [EDU, 'member'],
    ]),
    managers: new Set<UserId>([ANA]),
  };
  const groups: GroupAccess = {
    access: async (userId, publicId) => {
      const tier = state.participants.get(userId);
      if (tier === undefined || publicId !== PUBLIC_ID) throw appError('GROUP_NOT_FOUND');
      const permissions: GroupPermission[] = state.managers.has(userId) ? ['matches.manage'] : [];
      return { groupId: GROUP_ID, publicId: PUBLIC_ID, name: 'Pelada de sexta', tier, permissions };
    },
    participants: async () => new Map(state.participants),
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
  return { service, clock, at, sent, state };
}
type T = ReturnType<typeof setup>;

/** As configurações da partida (PAR-06), com um formato pequeno (1 × 2) para os testes de fila. */
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
    ...over,
  };
}

/** Cria só com o início e o fim (PAR-01) e ajusta as configurações como a tela faz (PAR-06). */
async function create(t: T, over: Partial<Settings> = {}, by: UserId = ANA) {
  const first = await t.service.create(by, PUBLIC_ID, {
    startsAt: over.startsAt ?? START,
    endsAt: over.endsAt ?? END,
  });
  return t.service.update(by, PUBLIC_ID, first.id, { ...input(over), expectedVersion: first.version });
}
const go = (t: T, user: UserId, matchId: string, status: 'going' | 'not_going' = 'going') =>
  t.service.setAttendance(user, PUBLIC_ID, matchId, { status });
const get = (t: T, user: UserId, matchId: string) => t.service.get(user, PUBLIC_ID, matchId);
const publicIds = (entries: readonly MatchEntry[]) =>
  entries.map((e) => (e.kind === 'player' ? e.user.id : e.name));
const pub = (user: UserId) => PUB[user];
const link = (matchId: string) => `/groups/${PUBLIC_ID}/matches/${matchId}`;

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return err as { code: string; status: number; details?: unknown };
  }
}

/** A lista fica aberta para os membros e dois entram, em ordem, com um minuto entre cada. */
async function fill(t: T, matchId: string, users: UserId[]) {
  t.at(MEMBERS_AT);
  for (const [i, user] of users.entries()) {
    t.at(iso(MEMBERS_AT, (i + 1) / 60));
    await go(t, user, matchId);
  }
}

describe('PAR-01: criar a partida', () => {
  it('PAR-01: cria só com início e fim, e a partida nasce limpa (sem formato, sem horas, aberta, fecha no início)', async () => {
    const t = setup();
    const m = await t.service.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    expect(m).toMatchObject({
      startsAt: START,
      endsAt: END,
      noGuests: false,
      closeHours: 0,
      status: 'open',
      wave: 'guests',
      version: 1,
      confirmed: 0,
      in: [],
      queue: [],
      notGoing: [],
    });
    expect(m.teams).toBeUndefined();
    expect(m.playersPerTeam).toBeUndefined();
    expect(m.membersHours).toBeUndefined();
    expect(m.reservesHours).toBeUndefined();
    expect(m.guestsHours).toBeUndefined();
    expect(m).not.toHaveProperty('note');
    expect(m).not.toHaveProperty('place');
    expect(m.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(m.createdAt).toBe(T0);
    expect(await get(t, BIA, m.id)).toMatchObject({ id: m.id, status: 'open' });
  });

  it('PAR-01: o corpo do criar é só { startsAt, endsAt }: formato e horas mandados são ignorados', async () => {
    const times = { startsAt: START, endsAt: END };
    expect(CreateMatchInputSchema.parse({ ...times, teams: 5, note: 'x', place: 'Quadra' })).toEqual(times);
    const t = setup();
    const m = await t.service.create(ANA, PUBLIC_ID, { ...times, teams: 5, membersHours: 1 } as never);
    expect(m.teams).toBeUndefined();
    expect(m.membersHours).toBeUndefined();
  });

  it('PAR-01: quem participa sem a permissão recebe GROUP_PERMISSION_DENIED (403)', async () => {
    const t = setup();
    const err = await failure(t.service.create(BIA, PUBLIC_ID, { startsAt: START, endsAt: END }));
    expect(err?.code).toBe('GROUP_PERMISSION_DENIED');
    expect(err?.status).toBe(403);
  });

  it('PAR-01: quem não participa recebe GROUP_NOT_FOUND', async () => {
    const t = setup();
    expect(
      (await failure(t.service.create(STRANGER, PUBLIC_ID, { startsAt: START, endsAt: END })))?.code,
    ).toBe('GROUP_NOT_FOUND');
  });

  it('PAR-01: início no passado responde VALIDATION_ERROR (422)', async () => {
    const t = setup();
    const err = await failure(
      create(t, { startsAt: '2026-11-22T22:00:00.000Z', endsAt: '2026-11-23T00:00:00.000Z' }),
    );
    expect(err?.code).toBe('VALIDATION_ERROR');
    expect(err?.status).toBe(422);
  });

  it('PAR-01: início a mais de 90 dias responde VALIDATION_ERROR; com exatos 90 dias passa', async () => {
    const t = setup();
    const far = '2027-02-22T10:00:00.000Z'; // T0 + 91 dias
    expect((await failure(create(t, { startsAt: far, endsAt: iso(far, 2) })))?.code).toBe('VALIDATION_ERROR');
    const ok = '2027-02-21T10:00:00.000Z'; // T0 + 90 dias
    expect((await create(t, { startsAt: ok, endsAt: iso(ok, 2) })).startsAt).toBe(ok);
  });

  it('PAR-01: o fim depois do início e até 24 h', () => {
    const ok = { startsAt: START, endsAt: END };
    expect(CreateMatchInputSchema.safeParse(ok).success).toBe(true);
    expect(CreateMatchInputSchema.safeParse({ ...ok, endsAt: START }).success).toBe(false);
    expect(CreateMatchInputSchema.safeParse({ ...ok, endsAt: iso(START, 25) }).success).toBe(false);
    expect(CreateMatchInputSchema.safeParse({ ...ok, endsAt: iso(START, 24) }).success).toBe(true);
  });

  it('PAR-06: formato e limites das configurações; o local e o recado não existem mais', () => {
    const ok = { ...input(), expectedVersion: 1 };
    expect(UpdateMatchInputSchema.safeParse(ok).success).toBe(true);
    expect(UpdateMatchInputSchema.parse({ ...ok, note: 'Trazer colete' })).not.toHaveProperty('note');
    expect(UpdateMatchInputSchema.safeParse({ ...ok, teams: 0 }).success).toBe(false);
    expect(UpdateMatchInputSchema.safeParse({ ...ok, teams: 11 }).success).toBe(false);
    expect(UpdateMatchInputSchema.safeParse({ ...ok, playersPerTeam: 51 }).success).toBe(false);
    expect(UpdateMatchInputSchema.parse({ ...ok, place: 'Quadra' })).not.toHaveProperty('place');
  });

  it('PAR-06: o formato é inteiro ou nenhum, e as horas são opcionais; o fechamento vai sempre', () => {
    const { teams: _t, playersPerTeam: _p, ...noFormat } = input();
    expect(UpdateMatchInputSchema.safeParse({ ...noFormat, expectedVersion: 1 }).success).toBe(true);
    const { teams: _t2, ...onlyPlayers } = input();
    expect(UpdateMatchInputSchema.safeParse({ ...onlyPlayers, expectedVersion: 1 }).success).toBe(false);
    const { playersPerTeam: _p2, ...onlyTeams } = input();
    expect(UpdateMatchInputSchema.safeParse({ ...onlyTeams, expectedVersion: 1 }).success).toBe(false);
    const clean = { startsAt: START, endsAt: END, noGuests: false, closeHours: 0, expectedVersion: 1 };
    expect(UpdateMatchInputSchema.safeParse(clean).success).toBe(true);
    const { closeHours: _c, ...noClose } = clean;
    expect(UpdateMatchInputSchema.safeParse(noClose).success).toBe(false);
  });

  it('PAR-01: a 21ª partida por vir responde MATCH_LIMIT com details.limit = 20', async () => {
    const t = setup();
    for (const n of Array.from({ length: 20 }, (_, i) => i)) {
      await create(t, { startsAt: iso(START, n), endsAt: iso(END, n) });
    }
    const err = await failure(create(t));
    expect(err?.code).toBe('MATCH_LIMIT');
    expect(err?.status).toBe(409);
    expect(err?.details).toMatchObject({ limit: 20 });
  });

  it('PAR-01: as partidas que já terminaram não contam no limite', async () => {
    const t = setup();
    for (const n of Array.from({ length: 20 }, (_, i) => i)) {
      await create(t, { startsAt: iso(START, n), endsAt: iso(END, n) });
    }
    t.at('2026-11-29T00:00:00.000Z');
    const next = '2026-12-05T22:00:00.000Z';
    expect((await create(t, { startsAt: next, endsAt: iso(next, 2) })).startsAt).toBe(next);
  });
});

describe('PAR-02, 03, 04: vagas e ondas', () => {
  it('PAR-02: as vagas são times × pessoas por time: 2 × 6 deixa 12 dentro e o resto na fila', async () => {
    const t = setup();
    const m = await create(t, { teams: 2, playersPerTeam: 6 });
    expect((m.teams ?? 0) * (m.playersPerTeam ?? 0)).toBe(12);
  });

  it('PAR-02: sem formato não há limite: todos que dizem "vou" estão dentro, e não há fila', async () => {
    const t = setup();
    const m = await t.service.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    const users = [BIA, CAIO, EDU, ANA, DUDA];
    for (const [i, user] of users.entries()) {
      t.at(iso(T0, (i + 1) / 60));
      await go(t, user, m.id);
    }
    const seen = await get(t, ANA, m.id);
    expect(publicIds(seen.in)).toEqual(users.map(pub));
    expect(seen.queue).toEqual([]);
    expect(seen.confirmed).toBe(5);
    expect((await t.service.list(ANA, PUBLIC_ID))[0]).toMatchObject({ confirmed: 5 });
  });

  it('PAR-02, PAR-06: configurar o formato abaixo de quem já está dentro responde MATCH_SLOTS_BELOW_CONFIRMED', async () => {
    const t = setup();
    const m = await t.service.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    for (const [i, user] of [BIA, CAIO, EDU].entries()) {
      t.at(iso(T0, (i + 1) / 60));
      await go(t, user, m.id);
    }
    const err = await failure(
      t.service.update(ANA, PUBLIC_ID, m.id, {
        ...input({ teams: 1, playersPerTeam: 2 }),
        expectedVersion: m.version,
      }),
    );
    expect(err?.code).toBe('MATCH_SLOTS_BELOW_CONFIRMED');
    expect(err?.details).toMatchObject({ confirmed: 3 });
  });

  it('PAR-02, PAR-06: tirar o formato volta a não ter limite, e a fila inteira entra', async () => {
    const t = setup();
    const m = await create(t, { playersPerTeam: 1 });
    await fill(t, m.id, [BIA, CAIO, EDU]);
    const edited = await t.service.update(ANA, PUBLIC_ID, m.id, {
      ...input({ teams: undefined, playersPerTeam: undefined }),
      expectedVersion: m.version,
    });
    expect(edited.teams).toBeUndefined();
    expect(publicIds(edited.in)).toEqual([pub(BIA), pub(CAIO), pub(EDU)]);
    expect(edited.queue).toEqual([]);
  });

  it('PAR-02: mais de 100 vagas é recusado pelo contrato', () => {
    expect(
      UpdateMatchInputSchema.safeParse({ ...input({ teams: 10, playersPerTeam: 11 }), expectedVersion: 1 })
        .success,
    ).toBe(false);
    expect(
      UpdateMatchInputSchema.safeParse({ ...input({ teams: 10, playersPerTeam: 10 }), expectedVersion: 1 })
        .success,
    ).toBe(true);
  });

  it('PAR-03: as ondas abrem em horas antes do início e a resposta traz a hora de cada uma', async () => {
    const t = setup();
    const m = await create(t);
    expect(m.waves).toEqual({ members: MEMBERS_AT, reserves: RESERVES_AT, guests: GUESTS_AT, close: START });
  });

  it('PAR-03: cada partida tem as suas horas, e os convidados podem ser desligados (noGuests)', async () => {
    const t = setup();
    const m = await create(t, {
      membersHours: 48,
      reservesHours: 12,
      guestsHours: undefined,
      noGuests: true,
      closeHours: 2,
    });
    expect(m.waves.members).toBe(iso(START, -48));
    expect(m.waves.reserves).toBe(iso(START, -12));
    expect(m.waves.guests).toBeUndefined();
    expect(m.waves.close).toBe(iso(START, -2));
  });

  it('PAR-03: a ordem membros ≥ reservas ≥ convidados ≥ fechamento é exigida pelo contrato, com o campo', () => {
    const fieldOf = (over: Partial<Settings>) => {
      const r = UpdateMatchInputSchema.safeParse({ ...input(over), expectedVersion: 1 });
      return r.success ? undefined : r.error.issues[0]?.path[0];
    };
    expect(fieldOf({ membersHours: 10, reservesHours: 24 })).toBe('reservesHours');
    expect(fieldOf({ reservesHours: 5, guestsHours: 6 })).toBe('guestsHours');
    expect(fieldOf({ guestsHours: 2, closeHours: 3 })).toBe('closeHours');
    expect(fieldOf({ guestsHours: undefined, reservesHours: 4, closeHours: 5 })).toBe('closeHours');
    expect(fieldOf({ membersHours: 337 })).toBeDefined();
    expect(fieldOf({ membersHours: 336, reservesHours: 24 })).toBeUndefined();
  });

  it('PAR-03: a onda sem hora abre junto com a anterior (contando só as configuradas na ordem)', async () => {
    const t = setup();
    const m = await create(t, { membersHours: 48, reservesHours: undefined, guestsHours: undefined });
    expect(m.waves).toEqual({
      members: iso(START, -48),
      reserves: iso(START, -48),
      guests: iso(START, -48),
      close: START,
    });
    t.at(iso(START, -48));
    expect((await go(t, DUDA, m.id)).myAttendance).toBe('in');
    const fieldOf = (over: Partial<Settings>) => {
      const r = UpdateMatchInputSchema.safeParse({ ...input(over), expectedVersion: 1 });
      return r.success ? undefined : r.error.issues[0]?.path[0];
    };
    expect(fieldOf({ membersHours: 10, reservesHours: undefined, guestsHours: 11, closeHours: 0 })).toBe(
      'guestsHours',
    );
    expect(fieldOf({ reservesHours: 4, guestsHours: undefined, noGuests: true, closeHours: 5 })).toBe(
      'closeHours',
    );
  });

  it('PAR-03: sem nada configurado, a lista está aberta a todos desde a criação e fecha no início', async () => {
    const t = setup();
    const m = await t.service.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    expect(m.waves).toEqual({ members: T0, reserves: T0, guests: T0, close: START });
    expect((await go(t, BIA, m.id)).myAttendance).toBe('in');
    expect((await go(t, DUDA, m.id)).myAttendance).toBe('in');
    t.at(iso(START, -0.01));
    expect((await get(t, CAIO, m.id)).status).toBe('open');
    t.at(START);
    expect((await get(t, CAIO, m.id)).status).toBe('in_progress');
  });

  it('PAR-03, PAR-04: só o fechamento configurado: a lista fica aberta desde a criação e fecha na hora', async () => {
    const t = setup();
    const m = await t.service.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    const edited = await t.service.update(ANA, PUBLIC_ID, m.id, {
      startsAt: START,
      endsAt: END,
      noGuests: false,
      closeHours: 2,
      expectedVersion: m.version,
    });
    expect(edited.waves.close).toBe(iso(START, -2));
    expect((await go(t, BIA, m.id)).myAttendance).toBe('in');
    t.at(iso(START, -2));
    const err = await failure(go(t, CAIO, m.id));
    expect(err?.code).toBe('MATCH_CLOSED');
  });

  it('PAR-03, PAR-16: a situação sai da hora: scheduled → open → closed → in_progress → finished', async () => {
    const t = setup();
    const m = await create(t, { closeHours: 1 });
    const statusAt = async (when: string) => {
      t.at(when);
      return (await get(t, BIA, m.id)).status;
    };
    expect(await statusAt('2026-11-24T21:59:59.000Z')).toBe('scheduled');
    expect(await statusAt(MEMBERS_AT)).toBe('open');
    expect(await statusAt(iso(START, -1.5))).toBe('open');
    expect(await statusAt(iso(START, -1))).toBe('closed');
    expect(await statusAt(START)).toBe('in_progress');
    expect(await statusAt(END)).toBe('finished');
  });

  it('PAR-03, PAR-16: a onda atual sai da hora: members, reserves, guests; antes dos membros não há onda', async () => {
    const t = setup();
    const m = await create(t);
    const waveAt = async (when: string) => {
      t.at(when);
      return (await get(t, BIA, m.id)).wave;
    };
    expect(await waveAt(T0)).toBeUndefined();
    expect(await waveAt(MEMBERS_AT)).toBe('members');
    expect(await waveAt(RESERVES_AT)).toBe('reserves');
    expect(await waveAt(GUESTS_AT)).toBe('guests');
  });

  it('PAR-03: abrir uma onda pela hora não avisa ninguém', async () => {
    const t = setup();
    const m = await create(t);
    t.at(RESERVES_AT);
    await get(t, BIA, m.id);
    expect(t.sent).toEqual([]);
  });

  it('PAR-04: depois do fechamento ninguém entra (MATCH_CLOSED), mas quem está dentro ainda desiste', async () => {
    const t = setup();
    const m = await create(t, { closeHours: 1 });
    t.at(MEMBERS_AT);
    await go(t, BIA, m.id);
    t.at(iso(START, -1));
    const err = await failure(go(t, CAIO, m.id));
    expect(err?.code).toBe('MATCH_CLOSED');
    expect(err?.status).toBe(409);
    expect((await go(t, BIA, m.id, 'not_going')).confirmed).toBe(0);
  });
});

describe('PAR-05: abrir a onda antes da hora', () => {
  it('PAR-05: abrir para as reservas deixa a reserva confirmar na hora, e a hora da onda vira agora', async () => {
    const t = setup();
    const m = await create(t);
    t.at(MEMBERS_AT);
    expect((await failure(go(t, DUDA, m.id)))?.code).toBe('MATCH_NOT_OPEN_FOR_YOU');
    t.at('2026-11-25T12:00:00.000Z');
    const advanced = await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'reserves' });
    expect(advanced.wave).toBe('reserves');
    expect(advanced.waves.reserves).toBe('2026-11-25T12:00:00.000Z');
    expect((await go(t, DUDA, m.id)).myAttendance).toBe('in');
  });

  it('PAR-05: abrir para convidados abre as reservas junto, mesmo com a onda de convidados desligada', async () => {
    const t = setup();
    const m = await create(t, { guestsHours: undefined, noGuests: true });
    t.at('2026-11-25T12:00:00.000Z');
    const advanced = await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'guests' });
    expect(advanced.wave).toBe('guests');
    expect(advanced.waves.reserves).toBe('2026-11-25T12:00:00.000Z');
    expect(advanced.waves.guests).toBe('2026-11-25T12:00:00.000Z');
  });

  it('PAR-05: abrir uma onda que já está aberta não muda nada', async () => {
    const t = setup();
    const m = await create(t);
    t.at('2026-11-27T00:00:00.000Z');
    const advanced = await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'reserves' });
    expect(advanced.waves.reserves).toBe(RESERVES_AT);
    expect(advanced.version).toBe(m.version);
  });

  it('PAR-05: sem a abertura configurada tudo já está aberto: não há o que abrir, e nada muda', async () => {
    const t = setup();
    const m = await t.service.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    const advanced = await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'guests' });
    expect(advanced.version).toBe(m.version);
    expect(advanced.waves).toEqual(m.waves);
    expect(advanced.wave).toBe('guests');
  });

  it('PAR-05: quem não tem matches.manage recebe GROUP_PERMISSION_DENIED', async () => {
    const t = setup();
    const m = await create(t);
    expect((await failure(t.service.advance(BIA, PUBLIC_ID, m.id, { wave: 'reserves' })))?.code).toBe(
      'GROUP_PERMISSION_DENIED',
    );
  });

  it('PAR-05: depois do fechamento responde MATCH_CLOSED', async () => {
    const t = setup();
    const closing = await create(t, { closeHours: 2 });
    t.at(iso(START, -1));
    const err = await failure(t.service.advance(ANA, PUBLIC_ID, closing.id, { wave: 'guests' }));
    expect(err?.code).toBe('MATCH_CLOSED');
    expect(err?.status).toBe(409);
  });

  it('PAR-05: a onda aberta à mão não fecha mais, nem pela edição das horas', async () => {
    const t = setup();
    const m = await create(t);
    t.at('2026-11-24T00:00:00.000Z');
    const advanced = await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'reserves' });
    const edited = await t.service.update(ANA, PUBLIC_ID, m.id, {
      ...input({ reservesHours: 2, guestsHours: 1 }),
      expectedVersion: advanced.version,
    });
    expect(edited.wave).toBe('reserves');
  });
});

describe('PAR-16: a hora de cada onda aberta antes da hora fica guardada', () => {
  const T1 = '2026-11-25T12:00:00.000Z';
  const T2 = '2026-11-25T18:00:00.000Z';

  it('PAR-16, PAR-05: aberta à mão, a onda mostra a hora do pedido em toda leitura, mesmo com o relógio adiantado', async () => {
    const t = setup();
    const m = await create(t);
    t.at(T1);
    await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'reserves' });
    t.at('2026-11-26T01:00:00.000Z'); // antes da hora natural das reservas
    expect((await get(t, BIA, m.id)).waves.reserves).toBe(T1);
    t.at('2026-11-26T20:00:00.000Z');
    expect((await get(t, BIA, m.id)).waves.reserves).toBe(T1);
    expect((await get(t, CAIO, m.id)).waves.reserves).toBe(T1);
  });

  it('PAR-16, PAR-05: abrir as reservas e depois os convidados guarda as duas horas', async () => {
    const t = setup();
    const m = await create(t);
    t.at(T1);
    await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'reserves' });
    t.at(T2);
    await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'guests' });
    t.at('2026-11-26T01:00:00.000Z');
    const seen = await get(t, BIA, m.id);
    expect(seen.waves.reserves).toBe(T1);
    expect(seen.waves.guests).toBe(T2);
  });

  it('PAR-16, PAR-05: abrir de novo uma onda já aberta à mão não troca a hora dela', async () => {
    const t = setup();
    const m = await create(t);
    t.at(T1);
    await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'reserves' });
    t.at(T2);
    await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'reserves' });
    expect((await get(t, BIA, m.id)).waves.reserves).toBe(T1);
  });

  it('PAR-16, PAR-06: a edição que segura aberta uma onda aberta pela hora guarda a hora que ela mostrava', async () => {
    const t = setup();
    const m = await create(t);
    t.at(iso(RESERVES_AT, 2));
    expect((await get(t, BIA, m.id)).waves.reserves).toBe(RESERVES_AT);
    const later = iso(START, 48);
    await t.service.update(ANA, PUBLIC_ID, m.id, {
      ...input({ startsAt: later, endsAt: iso(later, 2) }),
      expectedVersion: m.version,
    });
    t.at(iso(RESERVES_AT, 30));
    const seen = await get(t, BIA, m.id);
    expect(seen.wave).toBe('reserves');
    expect(seen.waves.members).toBe(MEMBERS_AT);
    expect(seen.waves.reserves).toBe(RESERVES_AT);
  });

  it('PAR-16, PAR-06: a edição que segura aberta uma onda aberta à mão mantém a hora do pedido', async () => {
    const t = setup();
    const m = await create(t);
    t.at(T1);
    const advanced = await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'reserves' });
    t.at(T2);
    const later = iso(START, 48);
    const edited = await t.service.update(ANA, PUBLIC_ID, m.id, {
      ...input({ startsAt: later, endsAt: iso(later, 2) }),
      expectedVersion: advanced.version,
    });
    expect(edited.waves.reserves).toBe(T1);
    t.at(iso(T2, 24));
    expect((await get(t, BIA, m.id)).waves.reserves).toBe(T1);
  });
});

describe('PAR-06: editar a partida', () => {
  it('PAR-06: edita com a expectedVersion, sobe a version e devolve a partida', async () => {
    const t = setup();
    const m = await create(t);
    const edited = await t.service.update(ANA, PUBLIC_ID, m.id, {
      ...input({ closeHours: 2 }),
      expectedVersion: m.version,
    });
    expect(edited).toMatchObject({ closeHours: 2, version: m.version + 1 });
    expect(edited).not.toHaveProperty('note');
  });

  it('PAR-06: version velha responde VERSION_CONFLICT (409)', async () => {
    const t = setup();
    const m = await create(t);
    await t.service.update(ANA, PUBLIC_ID, m.id, { ...input({ closeHours: 1 }), expectedVersion: m.version });
    const err = await failure(
      t.service.update(ANA, PUBLIC_ID, m.id, { ...input({ closeHours: 2 }), expectedVersion: m.version }),
    );
    expect(err?.code).toBe('VERSION_CONFLICT');
    expect(err?.status).toBe(409);
  });

  it('PAR-06: só quem tem matches.manage edita', async () => {
    const t = setup();
    const m = await create(t);
    const err = await failure(
      t.service.update(BIA, PUBLIC_ID, m.id, { ...input(), expectedVersion: m.version }),
    );
    expect(err?.code).toBe('GROUP_PERMISSION_DENIED');
  });

  it('PAR-06: depois do início responde MATCH_STARTED (409)', async () => {
    const t = setup();
    const m = await create(t);
    t.at(START);
    const err = await failure(
      t.service.update(ANA, PUBLIC_ID, m.id, { ...input(), expectedVersion: m.version }),
    );
    expect(err?.code).toBe('MATCH_STARTED');
    expect(err?.status).toBe(409);
  });

  it('PAR-06: diminuir as vagas abaixo de quem está dentro responde MATCH_SLOTS_BELOW_CONFIRMED com details.confirmed', async () => {
    const t = setup();
    const m = await create(t, { playersPerTeam: 3 });
    await fill(t, m.id, [BIA, CAIO, EDU]);
    const err = await failure(
      t.service.update(ANA, PUBLIC_ID, m.id, { ...input({ playersPerTeam: 2 }), expectedVersion: m.version }),
    );
    expect(err?.code).toBe('MATCH_SLOTS_BELOW_CONFIRMED');
    expect(err?.details).toMatchObject({ confirmed: 3 });
  });

  it('PAR-06, PAR-09: aumentar as vagas faz a fila subir, e cada promovido recebe match_promoted com o link', async () => {
    const t = setup();
    const m = await create(t, { playersPerTeam: 1 });
    await fill(t, m.id, [BIA, CAIO, EDU]);
    t.sent.length = 0;
    const edited = await t.service.update(ANA, PUBLIC_ID, m.id, {
      ...input({ playersPerTeam: 3 }),
      expectedVersion: m.version,
    });
    expect(publicIds(edited.in)).toEqual([pub(BIA), pub(CAIO), pub(EDU)]);
    expect(edited.queue).toEqual([]);
    const promoted = t.sent.filter((n) => n.type === 'match_promoted');
    expect(promoted.map((n) => n.userId).sort()).toEqual([CAIO, EDU].sort());
    expect(promoted.every((n) => n.link === link(m.id))).toBe(true);
  });

  it('PAR-06: mudar a hora não tira ninguém da lista', async () => {
    const t = setup();
    const m = await create(t);
    await fill(t, m.id, [BIA, CAIO]);
    const later = iso(START, 24);
    const edited = await t.service.update(ANA, PUBLIC_ID, m.id, {
      ...input({ startsAt: later, endsAt: iso(later, 2) }),
      expectedVersion: m.version,
    });
    expect(publicIds(edited.in)).toEqual([pub(BIA), pub(CAIO)]);
  });

  it('PAR-06: a onda atual nunca volta: com as reservas abertas pela hora, mover o início para depois mantém a onda', async () => {
    const t = setup();
    const m = await create(t);
    t.at(RESERVES_AT);
    expect((await get(t, BIA, m.id)).wave).toBe('reserves');
    const later = iso(START, 48);
    const edited = await t.service.update(ANA, PUBLIC_ID, m.id, {
      ...input({ startsAt: later, endsAt: iso(later, 2) }),
      expectedVersion: m.version,
    });
    expect(edited.wave).toBe('reserves');
    t.at(iso(RESERVES_AT, 1));
    expect((await get(t, BIA, m.id)).wave).toBe('reserves');
  });

  it('PAR-06, PAR-03: a primeira configuração da abertura passa a valer: quem não respondeu espera a hora da onda', async () => {
    const t = setup();
    const m = await t.service.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    expect(m.wave).toBe('guests');
    const edited = await t.service.update(ANA, PUBLIC_ID, m.id, { ...input(), expectedVersion: m.version });
    expect(edited.wave).toBeUndefined();
    expect(edited.status).toBe('scheduled');
    const err = await failure(go(t, DUDA, m.id));
    expect(err?.code).toBe('MATCH_NOT_OPEN_FOR_YOU');
    expect(err?.details).toMatchObject({ opensAt: RESERVES_AT });
    expect((await failure(go(t, BIA, m.id)))?.code).toBe('MATCH_NOT_OPEN_FOR_YOU');
  });

  it('PAR-06, PAR-09: quem confirmou na partida limpa continua na lista depois da primeira configuração', async () => {
    const t = setup();
    const m = await t.service.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    await go(t, BIA, m.id);
    t.at(iso(T0, 1 / 60));
    await go(t, DUDA, m.id);
    const edited = await t.service.update(ANA, PUBLIC_ID, m.id, { ...input(), expectedVersion: m.version });
    expect(publicIds(edited.in)).toEqual([pub(BIA), pub(DUDA)]);
    expect((await get(t, BIA, m.id)).myAttendance).toBe('in');
    expect((await get(t, DUDA, m.id)).myAttendance).toBe('in');
  });

  it('PAR-06: sem onda aberta antes da edição, o início para depois move as ondas junto', async () => {
    const t = setup();
    const m = await create(t);
    const later = iso(START, 48);
    const edited = await t.service.update(ANA, PUBLIC_ID, m.id, {
      ...input({ startsAt: later, endsAt: iso(later, 2) }),
      expectedVersion: m.version,
    });
    expect(edited.waves.members).toBe(iso(later, -72));
    expect(edited.wave).toBeUndefined();
  });
});

describe('PAR-07: cancelar a partida', () => {
  it('PAR-07: cancela, marca cancelledAt e a situação cancelled, e a lista fica como estava', async () => {
    const t = setup();
    const m = await create(t);
    await fill(t, m.id, [BIA, CAIO]);
    t.at('2026-11-25T10:00:00.000Z');
    const cancelled = await t.service.cancel(ANA, PUBLIC_ID, m.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledAt).toBe('2026-11-25T10:00:00.000Z');
    expect(publicIds(cancelled.in)).toEqual([pub(BIA), pub(CAIO)]);
  });

  it('PAR-07: todos da lista (dentro e fila), menos quem cancelou, recebem match_cancelled com o link', async () => {
    const t = setup();
    const m = await create(t, { playersPerTeam: 1 });
    await fill(t, m.id, [ANA, BIA, CAIO]);
    t.sent.length = 0;
    await t.service.cancel(ANA, PUBLIC_ID, m.id);
    const cancelled = t.sent.filter((n) => n.type === 'match_cancelled');
    expect(cancelled.map((n) => n.userId).sort()).toEqual([BIA, CAIO].sort());
    expect(cancelled.every((n) => n.link === link(m.id))).toBe(true);
  });

  it('PAR-07: quem disse "não vou" não recebe o aviso', async () => {
    const t = setup();
    const m = await create(t);
    t.at(MEMBERS_AT);
    await go(t, BIA, m.id, 'not_going');
    t.sent.length = 0;
    await t.service.cancel(ANA, PUBLIC_ID, m.id);
    expect(t.sent).toEqual([]);
  });

  it('PAR-07: cancelada, ninguém responde (MATCH_CANCELLED, 409)', async () => {
    const t = setup();
    const m = await create(t);
    await t.service.cancel(ANA, PUBLIC_ID, m.id);
    t.at(MEMBERS_AT);
    const err = await failure(go(t, BIA, m.id));
    expect(err?.code).toBe('MATCH_CANCELLED');
    expect(err?.status).toBe(409);
  });

  it('PAR-07: cancelar de novo não muda nada e não avisa de novo', async () => {
    const t = setup();
    const m = await create(t);
    await fill(t, m.id, [BIA]);
    t.at('2026-11-25T10:00:00.000Z');
    const first = await t.service.cancel(ANA, PUBLIC_ID, m.id);
    t.at('2026-11-25T11:00:00.000Z');
    t.sent.length = 0;
    const second = await t.service.cancel(ANA, PUBLIC_ID, m.id);
    expect(second.cancelledAt).toBe(first.cancelledAt);
    expect(t.sent).toEqual([]);
  });

  it('PAR-07: a partida cancelada continua na lista das próximas, marcada como cancelada', async () => {
    const t = setup();
    const m = await create(t);
    await t.service.cancel(ANA, PUBLIC_ID, m.id);
    const list = await t.service.list(BIA, PUBLIC_ID);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: m.id, status: 'cancelled' });
  });

  it('PAR-07: só quem tem matches.manage cancela; depois do início, MATCH_STARTED', async () => {
    const t = setup();
    const m = await create(t);
    expect((await failure(t.service.cancel(BIA, PUBLIC_ID, m.id)))?.code).toBe('GROUP_PERMISSION_DENIED');
    t.at(START);
    expect((await failure(t.service.cancel(ANA, PUBLIC_ID, m.id)))?.code).toBe('MATCH_STARTED');
  });
});

describe('PAR-08: responder', () => {
  it('PAR-08: o membro confirma a partir da onda dos membros; antes, MATCH_NOT_OPEN_FOR_YOU com details.opensAt', async () => {
    const t = setup();
    const m = await create(t);
    t.at('2026-11-24T21:00:00.000Z');
    const err = await failure(go(t, BIA, m.id));
    expect(err?.code).toBe('MATCH_NOT_OPEN_FOR_YOU');
    expect(err?.status).toBe(409);
    expect(err?.details).toMatchObject({ opensAt: MEMBERS_AT });
    t.at(MEMBERS_AT);
    expect((await go(t, BIA, m.id)).myAttendance).toBe('in');
  });

  it('PAR-08: a reserva só a partir da onda das reservas; opensAt é a hora delas', async () => {
    const t = setup();
    const m = await create(t);
    t.at(MEMBERS_AT);
    const err = await failure(go(t, DUDA, m.id));
    expect(err?.code).toBe('MATCH_NOT_OPEN_FOR_YOU');
    expect(err?.details).toMatchObject({ opensAt: RESERVES_AT });
    t.at(RESERVES_AT);
    const after = await go(t, DUDA, m.id);
    expect(after.myAttendance).toBe('in');
    expect(after.in[0]).toMatchObject({ kind: 'player', tier: 'reserve' });
  });

  it('PAR-08: "não vou" vale a qualquer momento, mesmo antes da onda da pessoa abrir', async () => {
    const t = setup();
    const m = await create(t);
    const bia = await go(t, BIA, m.id, 'not_going');
    expect(bia.myAttendance).toBe('not_going');
    expect(bia.notGoing.map((n) => n.user.id)).toEqual([pub(BIA)]);
    expect((await go(t, DUDA, m.id, 'not_going')).notGoing).toHaveLength(2);
  });

  it('PAR-08: de "vou" para "não vou" tira da lista, até depois do fechamento; depois do início, MATCH_STARTED', async () => {
    const t = setup();
    const m = await create(t, { closeHours: 1 });
    await fill(t, m.id, [BIA, CAIO]);
    t.at(iso(START, -0.5));
    const left = await go(t, BIA, m.id, 'not_going');
    expect(publicIds(left.in)).toEqual([pub(CAIO)]);
    t.at(START);
    const err = await failure(go(t, CAIO, m.id, 'not_going'));
    expect(err?.code).toBe('MATCH_STARTED');
  });

  it('PAR-08: responder o mesmo de novo não muda nada, nem a posição', async () => {
    const t = setup();
    const m = await create(t);
    await fill(t, m.id, [BIA, CAIO]);
    t.at(iso(MEMBERS_AT, 1));
    const again = await go(t, BIA, m.id);
    expect(publicIds(again.in)).toEqual([pub(BIA), pub(CAIO)]);
  });

  it('PAR-08, PAR-09: quem sai e volta para o "vou" vai para o fim da lista', async () => {
    const t = setup();
    const m = await create(t);
    await fill(t, m.id, [BIA, CAIO]);
    t.at(iso(MEMBERS_AT, 1));
    await go(t, BIA, m.id, 'not_going');
    t.at(iso(MEMBERS_AT, 2));
    const back = await go(t, BIA, m.id);
    expect(publicIds(back.in)).toEqual([pub(CAIO), pub(BIA)]);
  });

  it('PAR-08: quem não respondeu não aparece em nenhuma lista', async () => {
    const t = setup();
    const m = await create(t);
    await fill(t, m.id, [BIA]);
    const seen = await get(t, CAIO, m.id);
    expect([...publicIds(seen.in), ...publicIds(seen.queue), ...seen.notGoing.map((n) => n.user.id)]).toEqual(
      [pub(BIA)],
    );
    expect(seen.myAttendance).toBeUndefined();
  });

  it('PAR-08: quem não participa do grupo recebe GROUP_NOT_FOUND', async () => {
    const t = setup();
    const m = await create(t);
    t.at(MEMBERS_AT);
    expect((await failure(go(t, STRANGER, m.id)))?.code).toBe('GROUP_NOT_FOUND');
  });
});

describe('PAR-09: ordem de chegada e fila', () => {
  it('PAR-09: os primeiros até as vagas estão dentro; os outros, na fila, na ordem de chegada', async () => {
    const t = setup();
    const m = await create(t);
    await fill(t, m.id, [BIA, CAIO, EDU]);
    const seen = await get(t, ANA, m.id);
    expect(publicIds(seen.in)).toEqual([pub(BIA), pub(CAIO)]);
    expect(publicIds(seen.queue)).toEqual([pub(EDU)]);
    expect(seen.confirmed).toBe(2);
  });

  it('PAR-09: quem confirma com as vagas cheias vai para a fila, mesmo sendo membro, e ninguém sai de dentro', async () => {
    const t = setup();
    const m = await create(t);
    t.at(RESERVES_AT);
    await go(t, DUDA, m.id);
    t.at(iso(RESERVES_AT, 1));
    await go(t, CAIO, m.id);
    t.at(iso(RESERVES_AT, 2));
    const late = await go(t, BIA, m.id);
    expect(publicIds(late.in)).toEqual([pub(DUDA), pub(CAIO)]);
    expect(publicIds(late.queue)).toEqual([pub(BIA)]);
    expect(late.myAttendance).toBe('queued');
  });

  it('PAR-09: com a mesma hora de chegada, desempata pelo id do usuário do sistema', async () => {
    const t = setup();
    const m = await create(t, { playersPerTeam: 1 });
    t.at(MEMBERS_AT);
    await go(t, CAIO, m.id);
    await go(t, ANA, m.id);
    await go(t, BIA, m.id);
    const seen = await get(t, ANA, m.id);
    expect(publicIds(seen.in)).toEqual([pub(ANA)]);
    expect(publicIds(seen.queue)).toEqual([pub(BIA), pub(CAIO)]);
  });

  it('PAR-09: quando alguém de dentro sai, o 1º da fila sobe e é avisado (match_promoted, com o link)', async () => {
    const t = setup();
    const m = await create(t);
    await fill(t, m.id, [BIA, CAIO, EDU]);
    t.sent.length = 0;
    t.at(iso(MEMBERS_AT, 1));
    const after = await go(t, BIA, m.id, 'not_going');
    expect(publicIds(after.in)).toEqual([pub(CAIO), pub(EDU)]);
    expect(after.queue).toEqual([]);
    expect(t.sent).toEqual([{ userId: EDU, type: 'match_promoted', link: link(m.id) }]);
  });

  it('PAR-09: sair da fila não promove nem avisa ninguém', async () => {
    const t = setup();
    const m = await create(t);
    await fill(t, m.id, [BIA, CAIO, EDU]);
    t.sent.length = 0;
    await go(t, EDU, m.id, 'not_going');
    expect(t.sent).toEqual([]);
  });

  it('PAR-09: a primeira resposta de quem cabe nas vagas não gera aviso de promoção', async () => {
    const t = setup();
    const m = await create(t);
    await fill(t, m.id, [BIA, CAIO]);
    expect(t.sent).toEqual([]);
  });

  it('PAR-09: as vagas nunca passam do limite com respostas ao mesmo tempo', async () => {
    const t = setup();
    const m = await create(t);
    t.at(MEMBERS_AT);
    await Promise.all([BIA, CAIO, EDU, ANA].map((u) => go(t, u, m.id)));
    const seen = await get(t, ANA, m.id);
    expect(seen.in).toHaveLength(2);
    expect(seen.queue).toHaveLength(2);
  });
});

describe('PAR-10: quem sai do grupo', () => {
  it('PAR-10: quem saiu do grupo some da lista e a fila sobe, sem avisar ninguém', async () => {
    const t = setup();
    const m = await create(t);
    await fill(t, m.id, [BIA, CAIO, EDU]);
    t.sent.length = 0;
    t.state.participants.delete(BIA);
    const seen = await get(t, ANA, m.id);
    expect(publicIds(seen.in)).toEqual([pub(CAIO), pub(EDU)]);
    expect(seen.queue).toEqual([]);
    expect(t.sent).toEqual([]);
  });

  it('PAR-10: quem saiu do grupo também some de "não vou", e a resposta fica guardada (volta se voltar ao grupo)', async () => {
    const t = setup();
    const m = await create(t);
    await fill(t, m.id, [BIA]);
    await go(t, CAIO, m.id, 'not_going');
    t.state.participants.delete(BIA);
    t.state.participants.delete(CAIO);
    const gone = await get(t, ANA, m.id);
    expect(gone.in).toEqual([]);
    expect(gone.notGoing).toEqual([]);
    t.state.participants.set(BIA, 'member');
    expect(publicIds((await get(t, ANA, m.id)).in)).toEqual([pub(BIA)]);
  });
});

describe('PAR-15: as próximas partidas', () => {
  it('PAR-15: lista as que não terminaram, pelo início, com o formato, a situação, quantos dentro e a minha resposta', async () => {
    const t = setup();
    const late = await create(t, { startsAt: iso(START, 24), endsAt: iso(END, 24) });
    const soon = await create(t, { teams: 2, playersPerTeam: 6 });
    t.at(MEMBERS_AT);
    await go(t, BIA, soon.id);
    const list = await t.service.list(BIA, PUBLIC_ID);
    expect(list.map((m) => m.id)).toEqual([soon.id, late.id]);
    expect(list[0]).toMatchObject({
      startsAt: START,
      endsAt: END,
      teams: 2,
      playersPerTeam: 6,
      status: 'open',
      wave: 'members',
      confirmed: 1,
      myAttendance: 'in',
    });
    expect(list[1]?.myAttendance).toBeUndefined();
  });

  it('PAR-15: a partida limpa vem sem formato, aberta, com quantos confirmaram', async () => {
    const t = setup();
    const m = await t.service.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    await go(t, BIA, m.id);
    const [item] = await t.service.list(BIA, PUBLIC_ID);
    expect(item).toMatchObject({
      id: m.id,
      status: 'open',
      wave: 'guests',
      confirmed: 1,
      myAttendance: 'in',
    });
    expect(item?.teams).toBeUndefined();
    expect(item?.playersPerTeam).toBeUndefined();
  });

  it('PAR-15: myAttendance distingue dentro, fila e não vou', async () => {
    const t = setup();
    const m = await create(t, { playersPerTeam: 1 });
    await fill(t, m.id, [BIA, CAIO]);
    await go(t, EDU, m.id, 'not_going');
    const mine = async (user: UserId) => (await t.service.list(user, PUBLIC_ID))[0]?.myAttendance;
    expect(await mine(BIA)).toBe('in');
    expect(await mine(CAIO)).toBe('queued');
    expect(await mine(EDU)).toBe('not_going');
  });

  it('PAR-15: as que já terminaram não aparecem', async () => {
    const t = setup();
    await create(t);
    t.at(END);
    expect(await t.service.list(BIA, PUBLIC_ID)).toEqual([]);
  });

  it('PAR-15: quem não participa recebe GROUP_NOT_FOUND', async () => {
    const t = setup();
    expect((await failure(t.service.list(STRANGER, PUBLIC_ID)))?.code).toBe('GROUP_NOT_FOUND');
  });
});

describe('PAR-16: ver a partida', () => {
  it('PAR-16: a pessoa vem com o perfil (id público e apelido) e a participação', async () => {
    const t = setup();
    const m = await create(t);
    t.at(RESERVES_AT);
    await go(t, DUDA, m.id);
    const seen = await get(t, BIA, m.id);
    expect(seen.in[0]).toMatchObject({
      kind: 'player',
      tier: 'reserve',
      user: { id: pub(DUDA), nickname: '4ddddddd' },
    });
  });

  it('PAR-16: uma partida que não existe responde MATCH_NOT_FOUND (404)', async () => {
    const t = setup();
    const err = await failure(get(t, BIA, '00000000-0000-4000-8000-000000000000'));
    expect(err?.code).toBe('MATCH_NOT_FOUND');
    expect(err?.status).toBe(404);
  });

  it('PAR-16: quem não participa do grupo recebe GROUP_NOT_FOUND', async () => {
    const t = setup();
    const m = await create(t);
    expect((await failure(get(t, STRANGER, m.id)))?.code).toBe('GROUP_NOT_FOUND');
  });

  it('PAR-16: as ações do membro com a onda aberta: vou, não vou, sem convidado e sem gestão', async () => {
    const t = setup();
    const m = await create(t);
    t.at(MEMBERS_AT);
    expect((await get(t, BIA, m.id)).actions).toEqual({
      going: true,
      notGoing: true,
      requestGuest: false,
      manage: false,
      manageTeams: false,
    });
  });

  it('PAR-16: na partida limpa, o membro e a reserva podem confirmar e pedir convidado desde a criação', async () => {
    const t = setup();
    const m = await t.service.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    const expected = { going: true, notGoing: true, requestGuest: true, manage: false, manageTeams: false };
    expect((await get(t, BIA, m.id)).actions).toEqual(expected);
    expect((await get(t, DUDA, m.id)).actions).toEqual(expected);
  });

  it('PAR-16, PAR-03: com "sem convidados" não se pede convidado, e a situação só é scheduled com a hora dos membros configurada', async () => {
    const t = setup();
    const m = await create(t, { noGuests: true, guestsHours: undefined });
    t.at(GUESTS_AT);
    expect((await get(t, BIA, m.id)).actions.requestGuest).toBe(false);
    const clean = await t.service.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    expect(clean.status).not.toBe('scheduled');
  });

  it('PAR-16: a reserva antes da onda dela só pode dizer "não vou"', async () => {
    const t = setup();
    const m = await create(t);
    t.at(MEMBERS_AT);
    expect((await get(t, DUDA, m.id)).actions).toMatchObject({ going: false, notGoing: true });
  });

  it('PAR-16: com a onda de convidados aberta, pode pedir convidado; quem tem a permissão ganha manage', async () => {
    const t = setup();
    const m = await create(t);
    t.at(GUESTS_AT);
    expect((await get(t, BIA, m.id)).actions.requestGuest).toBe(true);
    expect((await get(t, ANA, m.id)).actions.manage).toBe(true);
  });

  it('PAR-16: depois do fechamento não se confirma nem se pede convidado, mas ainda se pode desistir', async () => {
    const t = setup();
    const m = await create(t, { closeHours: 1 });
    await fill(t, m.id, [BIA]);
    t.at(iso(START, -0.5));
    expect((await get(t, BIA, m.id)).actions).toMatchObject({
      going: false,
      notGoing: true,
      requestGuest: false,
    });
    expect((await get(t, CAIO, m.id)).actions).toMatchObject({ going: false, requestGuest: false });
  });

  it('PAR-16, PAR-25: depois do início, nenhuma ação nem a de gestão; os times ainda se mudam', async () => {
    const t = setup();
    const m = await create(t);
    t.at(START);
    expect((await get(t, ANA, m.id)).actions).toEqual({
      going: false,
      notGoing: false,
      requestGuest: false,
      manage: false,
      manageTeams: true,
    });
  });

  it('PAR-16: cancelada, a partida não aceita ações', async () => {
    const t = setup();
    const m = await create(t);
    await t.service.cancel(ANA, PUBLIC_ID, m.id);
    t.at(MEMBERS_AT);
    expect((await get(t, BIA, m.id)).actions).toMatchObject({
      going: false,
      notGoing: false,
      requestGuest: false,
    });
  });
});
