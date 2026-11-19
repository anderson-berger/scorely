import { AppError } from '@scorely/api/src/lib/errors';
import { asUserId, type UserId } from '@scorely/api/src/lib/ids';
import type {
  CompetitionRepository,
  StoredCompetition,
} from '@scorely/api/src/modules/competition/competition.repository';
import type { MatchRepository, StoredMatch } from '@scorely/api/src/modules/competition/match.repository';
import { createRankingService } from '@scorely/api/src/modules/competition/ranking.service';
import type {
  ResultRepository,
  StoredGameResult,
} from '@scorely/api/src/modules/competition/result.repository';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import type { UserRecord } from '@scorely/api/src/modules/users/user.repository';
import {
  type CompetitionRules,
  type ErrorCode,
  type Gender,
  type MemberTier,
  type PersonHistory,
  PersonHistorySchema,
  type PublicUserId,
  PublicUserIdSchema,
  type Ranking,
  RankingSchema,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Competição, etapa 4 (`.claude/work/competicao-4.md`, D4–D6): o ranking do grupo e o histórico (CMP-24, 25, 27).
// `createRankingService({ groups, competitions, results, matches, users, now })`, com
// `ranking(userId, groupId, gender?)` e `person(userId, groupId, publicUserId)`. Quem pede vai pelo id do sistema;
// as pessoas da resposta, pelo id público. Os fechamentos (`StoredGameResult`) ficam com os ids do sistema.

const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GROUP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// Membros de agora
const OWNER = asUserId('11111111-1111-4111-8111-111111111111');
const A = asUserId('22222222-2222-4222-8222-222222222222');
const B = asUserId('33333333-3333-4333-8333-333333333333');
/** Sem gênero no perfil. */
const C = asUserId('44444444-4444-4444-8444-444444444444');
/** Virou membro depois de todos os jogos: 0 ponto. */
const D = asUserId('55555555-5555-4555-8555-555555555555');
/** Reserva de agora; jogou como reserva. */
const R = asUserId('88888888-8888-4888-8888-888888888888');
/** Saiu do grupo depois do 2º jogo. */
const L = asUserId('77777777-7777-4777-8777-777777777777');
/** Convidada que esteve na lista de um jogo. */
const G = asUserId('99999999-9999-4999-8999-999999999999');
/** Nunca esteve no grupo. */
const OUTSIDER = asUserId('66666666-6666-4666-8666-666666666666');

const PEOPLE: UserId[] = [OWNER, A, B, C, D, R, L, G, OUTSIDER];
const NAMES: Record<string, string> = {
  [OWNER]: 'Dono',
  [A]: 'Ana',
  [B]: 'Beatriz',
  [C]: 'Caio',
  [D]: 'Davi',
  [R]: 'Rafa',
  [L]: 'Léo',
  [G]: 'Gabi',
  [OUTSIDER]: 'Fora',
};
const GENDERS: Record<string, Gender> = {
  [OWNER]: 'M',
  [A]: 'F',
  [B]: 'F',
  [D]: 'M',
  [R]: 'F',
  [L]: 'M',
  [G]: 'F',
  [OUTSIDER]: 'M',
};

const pub = (id: UserId): PublicUserId =>
  PublicUserIdSchema.parse(`${id.slice(0, 4)}${id.slice(-4)}`.toUpperCase());

const ROSTER: Record<string, MemberTier> = {
  [OWNER]: 'member',
  [A]: 'member',
  [B]: 'member',
  [C]: 'member',
  [D]: 'member',
  [R]: 'reserve',
};

const NOW = new Date('2026-11-14T12:00:00.000Z');

/** Regulamento de agora: o desempate do ranking sai dele (CMP-26). */
const RULES_NOW: CompetitionRules = {
  points: { win: 3, draw: 2, loss: 1, notConfirmed: 0, noShow: -2, cancelled: 0 },
  unit: 'day',
  tiebreak: ['attendance', 'streak'],
};

/** A cópia dos jogos: valores diferentes do de agora, para provar que cada jogo usa a dele (CMP-14). */
const COPY_DAY: CompetitionRules = {
  points: { win: 5, draw: 2, loss: 1, notConfirmed: -1, noShow: -3, cancelled: 4 },
  unit: 'day',
  tiebreak: [],
};
const COPY_MATCH: CompetitionRules = { ...COPY_DAY, unit: 'match' };

const OCT30 = '2026-10-30';
const NOV06 = '2026-11-06';
const NOV13 = '2026-11-13';
const OCT23 = '2026-10-23';

/** GRP-10, 64: o horário do grupo (sexta 19:00–22:00) e o id do jogo dele numa data (`<scheduleId>_<data>`). */
const SCHEDULE_ID = 'eeeeeeee-0000-4000-8000-000000000001';
const SCHEDULE = {
  id: SCHEDULE_ID,
  groupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  version: 1,
  weekday: 5,
  start: '19:00',
  end: '22:00',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const gameId = (date: string) => `${SCHEDULE_ID}_${date}`;
const startsAt = (date: string) => `${date}T22:00:00.000Z`;

function result(date: string, extra: Partial<StoredGameResult>): StoredGameResult {
  return {
    gameId: gameId(date),
    groupId: GROUP_ID,
    date,
    startsAt: startsAt(date),
    cancelled: false,
    friendly: false,
    rules: COPY_DAY,
    members: [],
    list: [],
    reserves: [],
    attendance: {},
    teams: [],
    createdAt: startsAt(date),
    updatedAt: startsAt(date),
    version: 1,
    ...extra,
  };
}

const inside = (ids: UserId[]) => ids.map((id) => ({ id, inside: true }));
const present = (ids: UserId[]) => Object.fromEntries(ids.map((id) => [id, 'present' as const]));

/**
 * 30/10, pelo dia (cópia: V 5, D 1, não confirmou −1). Time 1 (Dono, Ana, Rafa) venceu o Time 2 (Beatriz, Léo).
 * Dono 5, Ana 5, Beatriz 1, Léo 1, Caio −1 (não confirmou). Rafa era reserva: 0.
 */
const G1 = result(OCT30, {
  members: [OWNER, A, B, C, L],
  reserves: [R],
  list: inside([OWNER, A, R, B, L]),
  attendance: present([OWNER, A, R, B, L]),
  teams: [
    [OWNER, A, R],
    [B, L],
  ],
  winner: 0,
});

/**
 * 06/11, por partida (cópia: V 5, E 2, D 1, não confirmou −1). Léo não confirmou: −1.
 * Partida 1: Dono e Beatriz vencem Ana e Caio. Partida 2: Dono e Caio empatam com Ana e Beatriz.
 * Dono 7 (1 V · 1 E), Beatriz 7 (1 V · 1 E), Ana 3 (1 E · 1 D), Caio 3 (1 E · 1 D).
 */
const G2 = result(NOV06, {
  rules: COPY_MATCH,
  members: [OWNER, A, B, C, L],
  reserves: [R],
  list: inside([OWNER, A, B, C]),
  attendance: present([OWNER, A, B, C]),
});
const G2_MATCHES: StoredMatch[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    gameId: gameId(NOV06),
    groupId: GROUP_ID,
    teams: [
      [OWNER, B],
      [A, C],
    ],
    winner: 0,
    createdAt: '2026-11-06T22:10:00.000Z',
    updatedAt: '2026-11-06T22:10:00.000Z',
    version: 1,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    gameId: gameId(NOV06),
    groupId: GROUP_ID,
    teams: [
      [OWNER, C],
      [A, B],
    ],
    winner: 'draw',
    createdAt: '2026-11-06T22:30:00.000Z',
    updatedAt: '2026-11-06T22:30:00.000Z',
    version: 1,
  },
];

/** 13/11, amistoso (pelo dia): ninguém pontua. Time 2 (Ana, Rafa, Gabi) venceu o Time 1 (Dono). */
const G3 = result(NOV13, {
  friendly: true,
  members: [OWNER, A, B, C],
  reserves: [R],
  list: inside([OWNER, A, R, G]),
  attendance: present([OWNER, A, R, G]),
  teams: [[OWNER], [A, R, G]],
  winner: 1,
});

const unused = () => Promise.reject(new Error('not used by the ranking'));

function setup(
  opts: {
    group?: Partial<StoredGroup>;
    competition?: Partial<StoredCompetition> | null;
    results?: StoredGameResult[];
    matches?: Record<string, StoredMatch[]>;
    roster?: Record<string, MemberTier>;
  } = {},
) {
  const clock = { now: NOW };
  const state = {
    group: {
      id: GROUP_ID,
      createdAt: '2026-01-01T00:00:00.000Z',
      name: 'Vôlei de sexta',
      sportId: 'volleyball',
      schedules: [SCHEDULE],
      timeZone: 'America/Sao_Paulo',
      slots: 5,
      listOpensHoursBefore: 48,
      reservesOpenHoursBefore: 24,
      guestsOpenHoursBefore: 12,
      inviteToken: 'tok-member',
      reserveInviteToken: 'tok-reserve',
      guestToken: 'tok-guest',
      maxMembers: 30,
      maxReserves: 30,
      ...opts.group,
    } as StoredGroup,
    roster: { ...(opts.roster ?? ROSTER) } as Record<string, MemberTier>,
    competition:
      opts.competition === null
        ? undefined
        : ({
            groupId: GROUP_ID,
            plan: 'trial',
            activeUntil: '2026-11-24T00:00:00.000Z',
            trialStartedAt: '2026-10-25T00:00:00.000Z',
            rules: RULES_NOW,
            createdAt: '2026-10-25T00:00:00.000Z',
            updatedAt: '2026-10-25T00:00:00.000Z',
            ...opts.competition,
          } as StoredCompetition),
    results: structuredClone(opts.results ?? [G1, G2, G3]),
    matches: structuredClone(opts.matches ?? { [gameId(NOV06)]: G2_MATCHES }),
  };

  const groups: GroupRepository = {
    get: async (id) => (id === state.group.id ? structuredClone(state.group) : undefined),
    roleOf: async (groupId, userId) => (groupId === state.group.id ? state.roster[userId] : undefined),
    getByToken: unused,
    create: unused,
    addMember: unused,
    counts: unused,
    getMembership: async (groupId, userId) => {
      const role = groupId === state.group.id ? state.roster[userId] : undefined;
      return role ? { tier: role, roleId: userId === OWNER ? 'owner' : 'member' } : undefined;
    },
    setStaffRole: unused,
    transfer: unused,
    setMemberInvite: unused,
    clearMemberInvite: unused,
    acceptMemberInvite: unused,
    listMembers: async (groupId) =>
      groupId === state.group.id
        ? Object.entries(state.roster).map(([userId, role]) => ({
            userId: asUserId(userId),
            tier: role,
            roleId: userId === OWNER ? ('owner' as const) : ('member' as const),
            createdAt: '2026-01-01T00:00:00.000Z',
          }))
        : [],
    groupsOf: unused,
    rotateToken: unused,
    archive: unused,
    unarchive: unused,
    update: unused,
    removeMember: unused,
  };

  const competitions: CompetitionRepository = {
    get: async (groupId) =>
      groupId === GROUP_ID && state.competition ? structuredClone(state.competition) : undefined,
    create: unused,
    updateRules: unused,
  };

  const results: ResultRepository = {
    get: async (id) => structuredClone(state.results.find((r) => r.gameId === id)),
    listByGroup: async (groupId) =>
      state.results
        .filter((r) => r.groupId === groupId)
        .sort((x, y) => x.startsAt.localeCompare(y.startsAt))
        .map((r) => structuredClone(r)),
    create: unused,
    update: unused,
  };

  const matches: MatchRepository = {
    list: async (id) => structuredClone(state.matches[id] ?? []),
    get: unused,
    create: unused,
    update: unused,
    delete: unused,
  };

  const users = {
    getMany: async (ids: readonly UserId[]): Promise<UserRecord[]> =>
      ids
        .filter((id) => PEOPLE.includes(id))
        .map((id) => {
          const gender = GENDERS[id];
          return {
            id,
            publicId: pub(id),
            nickname: NAMES[id] ?? pub(id),
            createdAt: '2026-01-01T00:00:00.000Z',
            version: 1,
            ...(gender ? { gender } : {}),
          };
        }),
    resolve: async (publicIds: readonly PublicUserId[]) =>
      new Map(
        publicIds.flatMap((p) => {
          const id = PEOPLE.find((u) => pub(u) === p);
          return id ? [[p, id] as const] : [];
        }),
      ),
  };

  const service = createRankingService({
    groups,
    competitions,
    results,
    matches,
    users,
    now: () => clock.now,
  });
  return { clock, state, service };
}

async function expectAppError(p: Promise<unknown>, code: ErrorCode, status: number): Promise<AppError> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({ code, status });
  return err as AppError;
}

const rowOf = (ranking: Ranking, id: UserId) => ranking.rows.find((r) => r.userId === pub(id));
const rowIds = (ranking: Ranking) => ranking.rows.map((r) => r.userId).sort();
const pubs = (ids: UserId[]) => ids.map(pub).sort();
const leaksSystemId = (value: unknown) => PEOPLE.some((id) => JSON.stringify(value).includes(id));
const gameOf = (history: PersonHistory, date: string) => history.games.find((g) => g.date === date);

// ---------------------------------------------------------------------------------------------

describe('o ranking do grupo (CMP-24)', () => {
  it('CMP-24: soma os jogos fechados, cada um pela sua cópia do regulamento e pelas suas partidas', async () => {
    const t = setup();
    const res = await t.service.ranking(A, GROUP_ID);

    expect(RankingSchema.parse(res)).toEqual(res);
    expect(res.games).toBe(3);
    expect(rowOf(res, OWNER)?.points).toBe(12);
    expect(rowOf(res, A)?.points).toBe(8);
    expect(rowOf(res, B)?.points).toBe(8);
    expect(rowOf(res, C)?.points).toBe(2);
    expect(rowOf(res, D)?.points).toBe(0);
  });

  it('USR-04: o ranking e o histórico mostram a pessoa pelo apelido, sem `name` (USR-13)', async () => {
    const t = setup();
    const res = await t.service.ranking(A, GROUP_ID);
    for (const row of res.rows) {
      expect(typeof row.nickname).toBe('string');
      expect(row).not.toHaveProperty('name');
    }
    const history = await t.service.person(A, GROUP_ID, pub(OWNER));
    expect(history.nickname).toBe('Dono');
    expect(history).not.toHaveProperty('name');
  });

  it('CMP-24: a linha traz o id público, o nome e o gênero, sem vazar o id do sistema', async () => {
    const t = setup();
    const res = await t.service.ranking(A, GROUP_ID);
    expect(rowOf(res, A)).toMatchObject({ userId: pub(A), nickname: 'Ana', gender: 'F' });
    expect(rowOf(res, C)?.gender).toBeUndefined();
    expect(leaksSystemId(res)).toBe(false);
  });

  it('CMP-24: as vitórias, empates e derrotas somam o do dia e o das partidas', async () => {
    const t = setup({ results: [G1, G2] });
    const res = await t.service.ranking(A, GROUP_ID);
    expect(rowOf(res, OWNER)?.record).toEqual({ wins: 2, draws: 1, losses: 0 });
    expect(rowOf(res, A)?.record).toEqual({ wins: 1, draws: 1, losses: 1 });
    expect(rowOf(res, B)?.record).toEqual({ wins: 1, draws: 1, losses: 1 });
    expect(rowOf(res, C)?.record).toEqual({ wins: 0, draws: 1, losses: 1 });
  });

  it('CMP-24: total negativo aparece como 0', async () => {
    const noShow = result(OCT30, {
      members: [OWNER, A, B, C, D],
      list: inside([OWNER, C]),
      attendance: { [OWNER]: 'present', [C]: 'absent' },
    });
    const t = setup({ results: [noShow] });
    const res = await t.service.ranking(A, GROUP_ID);
    expect(rowOf(res, C)?.points).toBe(0);
    expect(rowOf(res, A)?.points).toBe(0);
  });

  it('CMP-24: o amistoso entra com 0', async () => {
    const t = setup({ results: [G3] });
    const res = await t.service.ranking(A, GROUP_ID);
    expect(res.games).toBe(1);
    expect(rowOf(res, OWNER)?.points).toBe(0);
    expect(rowOf(res, A)?.points).toBe(0);
  });

  it('CMP-24: calculado na leitura: corrigir o jogo ou uma partida muda o ranking na hora', async () => {
    const t = setup();
    const before = await t.service.ranking(A, GROUP_ID);
    expect(rowOf(before, OWNER)?.points).toBe(12);

    // Corrige o 30/10: o Time 2 venceu.
    const g1 = t.state.results.find((r) => r.date === OCT30);
    if (!g1) throw new Error('fixture');
    g1.winner = 1;
    // Apaga a partida 2 do 06/11.
    t.state.matches[gameId(NOV06)] = t.state.matches[gameId(NOV06)]?.slice(0, 1) ?? [];

    const after = await t.service.ranking(A, GROUP_ID);
    // Dono: derrota no 30/10 (1) + só a vitória da partida 1 (5).
    expect(rowOf(after, OWNER)?.points).toBe(6);
    // Beatriz: vitória no 30/10 (5) + vitória na partida 1 (5).
    expect(rowOf(after, B)?.points).toBe(10);
  });

  it('CMP-24: a reserva também vê o ranking', async () => {
    const t = setup();
    const res = await t.service.ranking(R, GROUP_ID);
    expect(res.rows.length).toBeGreaterThan(0);
  });

  it('CMP-24: vale com a competição vencida e com o grupo arquivado', async () => {
    const expired = setup({ competition: { activeUntil: '2026-11-10T00:00:00.000Z' } });
    expect(rowOf(await expired.service.ranking(A, GROUP_ID), OWNER)?.points).toBe(12);
    const archived = setup({ group: { archivedAt: '2026-11-14T00:00:00.000Z' } });
    expect(rowOf(await archived.service.ranking(A, GROUP_ID), OWNER)?.points).toBe(12);
  });

  it('CMP-24: quem não participa do grupo recebe GROUP_NOT_FOUND', async () => {
    const t = setup();
    await expectAppError(t.service.ranking(OUTSIDER, GROUP_ID), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.service.ranking(G, GROUP_ID), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.service.ranking(A, OTHER_GROUP_ID), 'GROUP_NOT_FOUND', 404);
  });

  it('CMP-24: com a competição desativada, o ranking vem vazio', async () => {
    const t = setup({ competition: null, results: [] });
    expect(await t.service.ranking(A, GROUP_ID)).toEqual({ rows: [], games: 0 });
  });
});

describe('quem aparece e o recorte (CMP-25)', () => {
  it('CMP-25: aparecem os membros de agora, também com 0; a reserva e quem saiu ficam de fora', async () => {
    const t = setup();
    const res = await t.service.ranking(A, GROUP_ID);
    expect(rowIds(res)).toEqual(pubs([OWNER, A, B, C, D]));
    expect(rowOf(res, D)).toMatchObject({ points: 0, attendance: 0, streak: 0 });
    expect(rowOf(res, R)).toBeUndefined();
    expect(rowOf(res, L)).toBeUndefined();
  });

  it('CMP-25: a reserva que vira membro só soma dos jogos em que já era membro no fechamento', async () => {
    const t = setup({ roster: { ...ROSTER, [R]: 'member' } });
    const res = await t.service.ranking(A, GROUP_ID);
    // Rafa venceu o 30/10 como reserva: não pontua, e a presença como reserva não conta.
    expect(rowOf(res, R)).toMatchObject({ points: 0, attendance: 0, streak: 0 });
  });

  it('CMP-25: recorte feminino: só quem tem "F" no perfil, com as posições do recorte', async () => {
    const t = setup();
    const res = await t.service.ranking(A, GROUP_ID, 'F');
    expect(RankingSchema.parse(res)).toEqual(res);
    expect(rowIds(res)).toEqual(pubs([A, B]));
    // Ana e Beatriz: 8 pontos, 2 presenças, sequência 2 → dividem o 1º.
    expect(res.rows.map((r) => r.position)).toEqual([1, 1]);
  });

  it('CMP-25: recorte masculino: só quem tem "M"; quem não informou o gênero aparece só no geral', async () => {
    const t = setup();
    const res = await t.service.ranking(A, GROUP_ID, 'M');
    expect(rowIds(res)).toEqual(pubs([OWNER, D]));
    expect(rowOf(res, C)).toBeUndefined();
    expect(rowOf(res, OWNER)?.position).toBe(1);
    expect(rowOf(res, D)?.position).toBe(2);
    expect(rowOf(await t.service.ranking(A, GROUP_ID), C)).toBeDefined();
  });
});

describe('a ordem no ranking (CMP-26)', () => {
  it('CMP-26: mais pontos primeiro; empate sem desempate que resolva divide a posição (1º, 2º, 2º, 4º, 5º)', async () => {
    const t = setup();
    const res = await t.service.ranking(A, GROUP_ID);
    expect(res.rows[0]?.userId).toBe(pub(OWNER));
    expect(rowOf(res, OWNER)?.position).toBe(1);
    expect(rowOf(res, A)?.position).toBe(2);
    expect(rowOf(res, B)?.position).toBe(2);
    expect(rowOf(res, C)?.position).toBe(4);
    expect(rowOf(res, D)?.position).toBe(5);
    expect(res.rows.map((r) => r.points)).toEqual([12, 8, 8, 2, 0]);
  });

  it('CMP-26: presença e sequência sem o amistoso', async () => {
    const t = setup();
    const res = await t.service.ranking(A, GROUP_ID);
    // Dono veio nos 3, mas o 13/11 foi amistoso.
    expect(rowOf(res, OWNER)).toMatchObject({ attendance: 2, streak: 2 });
    // Caio não confirmou o 30/10 e veio no 06/11.
    expect(rowOf(res, C)).toMatchObject({ attendance: 1, streak: 1 });
  });

  it('CMP-26: o desempate é o do regulamento de agora, e não o da cópia dos jogos', async () => {
    // Ana e Beatriz com 5 pontos; Ana com 2 presenças, Beatriz com 1. As cópias não têm desempate.
    // 23/10 (V 6): Beatriz vence (6), Ana perde (1). 30/10 (V 4): Ana vence (4), Beatriz não confirmou (−1).
    const final: StoredGameResult[] = [
      result(OCT23, {
        rules: { ...COPY_DAY, points: { ...COPY_DAY.points, win: 6 } },
        members: [A, B],
        list: inside([A, B]),
        attendance: { [A]: 'present', [B]: 'present' },
        teams: [[B], [A]],
        winner: 0,
      }),
      result(OCT30, {
        rules: { ...COPY_DAY, points: { ...COPY_DAY.points, win: 4 } },
        members: [A, B],
        list: inside([A]),
        attendance: { [A]: 'present' },
        teams: [[A]],
        winner: 0,
      }),
    ];
    const roster = { [OWNER]: 'member', [A]: 'member', [B]: 'member' } as Record<string, MemberTier>;

    const byAttendance = setup({ results: final, roster });
    const res = await byAttendance.service.ranking(A, GROUP_ID);
    expect(rowOf(res, A)).toMatchObject({ points: 5, attendance: 2, position: 1 });
    expect(rowOf(res, B)).toMatchObject({ points: 5, attendance: 1, position: 2 });

    const noTiebreak = setup({
      results: final,
      roster,
      competition: { rules: { ...RULES_NOW, tiebreak: [] } },
    });
    const tied = await noTiebreak.service.ranking(A, GROUP_ID);
    expect(rowOf(tied, A)?.position).toBe(1);
    expect(rowOf(tied, B)?.position).toBe(1);
  });
});

describe('o histórico da pessoa (CMP-27)', () => {
  it('CMP-27: os jogos fechados em que ela estava, do mais recente para o mais antigo, com o total no topo', async () => {
    const t = setup();
    const res = await t.service.person(B, GROUP_ID, pub(OWNER));

    expect(PersonHistorySchema.parse(res)).toEqual(res);
    expect(res).toMatchObject({
      userId: pub(OWNER),
      nickname: 'Dono',
      points: 12,
      attendance: 2,
      streak: 2,
    });
    expect(res.games.map((g) => g.date)).toEqual([NOV13, NOV06, OCT30]);
    expect(leaksSystemId(res)).toBe(false);
  });

  it('CMP-27: cada jogo mostra o que aconteceu, o time e os pontos', async () => {
    const t = setup();
    const res = await t.service.person(B, GROUP_ID, pub(OWNER));

    expect(gameOf(res, OCT30)).toMatchObject({
      startsAt: startsAt(OCT30),
      friendly: false,
      cancelled: false,
      member: true,
      event: 'win',
      points: 5,
      attendance: 'present',
      team: 0,
    });
    expect(gameOf(res, NOV06)).toMatchObject({
      member: true,
      event: 'played',
      points: 7,
      attendance: 'present',
      record: { wins: 1, draws: 1, losses: 0 },
    });
    expect(gameOf(res, NOV13)).toMatchObject({
      friendly: true,
      member: true,
      points: 0,
      attendance: 'present',
      team: 0,
    });
  });

  it('CMP-27: o jogo em que o membro não confirmou aparece com o ponto de "não confirmou"', async () => {
    const t = setup();
    const res = await t.service.person(A, GROUP_ID, pub(C));
    expect(res.games.map((g) => g.date)).toEqual([NOV13, NOV06, OCT30]);
    expect(gameOf(res, OCT30)).toMatchObject({ member: true, event: 'notConfirmed', points: -1 });
    expect(gameOf(res, OCT30)?.attendance).toBeUndefined();
  });

  it('CMP-27: quem não era membro aparece com a chamada e o time, sem evento e sem pontos', async () => {
    const t = setup();
    const res = await t.service.person(A, GROUP_ID, pub(R));
    expect(res.games.map((g) => g.date)).toEqual([NOV13, OCT30]);
    const g1 = gameOf(res, OCT30);
    expect(g1).toMatchObject({ member: false, attendance: 'present', team: 0 });
    expect(g1?.points).toBeUndefined();
    expect(g1?.event).toBeUndefined();
    expect(res.points).toBe(0);
  });

  it('CMP-27: o histórico de quem saiu continua com os pontos dos jogos antigos', async () => {
    const t = setup();
    const res = await t.service.person(A, GROUP_ID, pub(L));
    expect(PersonHistorySchema.parse(res)).toEqual(res);
    expect(res.games.map((g) => g.date)).toEqual([NOV06, OCT30]);
    expect(gameOf(res, OCT30)).toMatchObject({ member: true, event: 'loss', points: 1, team: 1 });
    expect(gameOf(res, NOV06)).toMatchObject({ member: true, event: 'notConfirmed', points: -1 });
  });

  it('CMP-27: a convidada que esteve numa lista tem histórico', async () => {
    const t = setup();
    const res = await t.service.person(A, GROUP_ID, pub(G));
    expect(res.games.map((g) => g.date)).toEqual([NOV13]);
    expect(gameOf(res, NOV13)).toMatchObject({ member: false, attendance: 'present', team: 1 });
  });

  it('CMP-27: membro de agora sem nenhum jogo tem o histórico vazio', async () => {
    const t = setup();
    const res = await t.service.person(A, GROUP_ID, pub(D));
    expect(res).toMatchObject({ userId: pub(D), points: 0, attendance: 0, streak: 0, games: [] });
  });

  it('CMP-27: a reserva vê o histórico de qualquer pessoa do grupo', async () => {
    const t = setup();
    const res = await t.service.person(R, GROUP_ID, pub(OWNER));
    expect(res.points).toBe(12);
  });

  it('CMP-27: pessoa que nunca esteve no grupo, ou id desconhecido: GROUP_MEMBER_NOT_FOUND', async () => {
    const t = setup();
    await expectAppError(t.service.person(A, GROUP_ID, pub(OUTSIDER)), 'GROUP_MEMBER_NOT_FOUND', 404);
    await expectAppError(
      t.service.person(A, GROUP_ID, PublicUserIdSchema.parse('ZZZZ9999')),
      'GROUP_MEMBER_NOT_FOUND',
      404,
    );
  });

  it('CMP-27: quem não participa do grupo recebe GROUP_NOT_FOUND', async () => {
    const t = setup();
    await expectAppError(t.service.person(OUTSIDER, GROUP_ID, pub(OWNER)), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.service.person(L, GROUP_ID, pub(OWNER)), 'GROUP_NOT_FOUND', 404);
  });
});
