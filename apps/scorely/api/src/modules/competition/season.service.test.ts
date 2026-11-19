import { AppError, appError } from '@scorely/api/src/lib/errors';
import { asUserId, type UserId } from '@scorely/api/src/lib/ids';
import type {
  CompetitionRepository,
  StoredCompetition,
} from '@scorely/api/src/modules/competition/competition.repository';
import type { MatchRepository, StoredMatch } from '@scorely/api/src/modules/competition/match.repository';
import { createMatchService } from '@scorely/api/src/modules/competition/match.service';
import { createRankingService } from '@scorely/api/src/modules/competition/ranking.service';
import type {
  ResultRepository,
  StoredGameResult,
} from '@scorely/api/src/modules/competition/result.repository';
import { createResultService } from '@scorely/api/src/modules/competition/result.service';
import type { SeasonRepository, StoredSeason } from '@scorely/api/src/modules/competition/season.repository';
import { createSeasonService } from '@scorely/api/src/modules/competition/season.service';
import type {
  GameRecord,
  GameRepository,
  PlayerRecord,
} from '@scorely/api/src/modules/groups/game.repository';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import type { StoredTeams, TeamsRepository } from '@scorely/api/src/modules/teams/teams.repository';
import type { UserRecord } from '@scorely/api/src/modules/users/user.repository';
import {
  COMPETITION_MATCH_LIMIT,
  type CompetitionRules,
  type ErrorCode,
  type Gender,
  type MatchInput,
  type MemberTier,
  type PublicUserId,
  PublicUserIdSchema,
  type Ranking,
  RankingSchema,
  type RoleId,
  type Season,
  type SeasonInput,
  SeasonInputSchema,
  SeasonSchema,
  SeasonUpdateInputSchema,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

/** ADR 0016: o que o banco faz na gravação condicionada pela versão (o repositório lança o mesmo erro). */
function expectVersionIn(current: number, expected: number): void {
  if (current !== expected) throw appError('VERSION_CONFLICT', { currentVersion: current });
}

// Competição, etapa 5 (`.claude/work/competicao-5.md`, D4–D7): as temporadas (CMP-29–34) e o que elas mudam no
// fechamento (CMP-11, 14, 15), nas partidas (CMP-19) e no ranking (CMP-33).
// `createSeasonService({ groups, competitions, seasons, results, matches, users, now })` com
// `list(userId, groupId)`, `create(userId, groupId, input)`, `update(userId, groupId, seasonId, input)`,
// `remove(userId, groupId, seasonId)` e `close(userId, groupId, seasonId)`; `create`, `update` e `close` devolvem a
// `Season`. Os serviços de resultados, partidas e ranking ganham `seasons` nas dependências, e o ranking ganha o
// 4º argumento `seasonId`. A temporada de um teste é criada pelo serviço (num relógio anterior) e o relógio anda.

const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GROUP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNKNOWN_SEASON = 'cccccccc-0000-4000-8000-000000000000';
/** Uma temporada de outro grupo (posta direto no repositório). */
const OTHER_GROUP_SEASON = 'dddddddd-0000-4000-8000-000000000000';

const OWNER = asUserId('11111111-1111-4111-8111-111111111111');
/** Membro com o cargo Admin (tem `seasons.manage` e `results.record`). */
const A = asUserId('22222222-2222-4222-8222-222222222222');
/** Membro sem cargo. */
const B = asUserId('33333333-3333-4333-8333-333333333333');
/** Membro sem gênero no perfil. */
const C = asUserId('44444444-4444-4444-8444-444444444444');
/** Membro que não joga nenhum jogo. */
const D = asUserId('55555555-5555-4555-8555-555555555555');
const R = asUserId('88888888-8888-4888-8888-888888888888');
const OUTSIDER = asUserId('66666666-6666-4666-8666-666666666666');

const PEOPLE: UserId[] = [OWNER, A, B, C, D, R, OUTSIDER];
const NAMES: Record<string, string> = {
  [OWNER]: 'Dono',
  [A]: 'Ana',
  [B]: 'Beatriz',
  [C]: 'Caio',
  [D]: 'Davi',
  [R]: 'Rafa',
  [OUTSIDER]: 'Fora',
};
const GENDERS: Record<string, Gender> = { [OWNER]: 'M', [A]: 'F', [B]: 'F', [D]: 'M', [R]: 'F' };

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

/** Um instante em São Paulo (UTC − 3). */
const sp = (date: string, time: string) => new Date(`${date}T${time}:00.000-03:00`);

const OCT26 = sp('2026-10-26', '09:00');
const NOV01 = sp('2026-11-01', '09:00');
/** S1 ainda aberta; os jogos de 30/10 e 06/11 já aconteceram. */
const NOV07 = sp('2026-11-07', '12:00');
/** S1 terminou em 08/11: está no prazo (até o fim de 11/11). */
const IN_GRACE = sp('2026-11-10', '12:00');
/** Sexta 13/11, 20:30: o jogo das 19h está em andamento, e S1 já travou. */
const NOW = sp('2026-11-13', '20:30');
const NOV13_MORNING = sp('2026-11-13', '09:00');
const NOV20_GAME = sp('2026-11-20', '20:30');

const OCT30 = '2026-10-30';
const NOV06 = '2026-11-06';
const NOV13 = '2026-11-13';
const NOV20 = '2026-11-20';

/** S1: 14 dias, com os jogos de 30/10 e 06/11. O de 13/11 fica de fora. */
const S1: SeasonInput = { name: 'Primavera', startDate: '2026-10-26', endDate: '2026-11-08' };
/** Uma temporada que vai até o fim de novembro. */
const S_LONG: SeasonInput = { name: 'Novembro', startDate: '2026-10-26', endDate: '2026-11-30' };

/** O regulamento do grupo quando a temporada é aberta: vira a cópia dela. */
const RULES_SEASON: CompetitionRules = {
  points: { win: 3, draw: 2, loss: 1, notConfirmed: 0, noShow: -2, cancelled: 0 },
  unit: 'day',
  tiebreak: ['attendance', 'streak'],
};
/** O regulamento do grupo mudado no meio da temporada (CMP-31). */
const RULES_NEW: CompetitionRules = {
  points: { win: 5, draw: 1, loss: 0, notConfirmed: -1, noShow: -3, cancelled: 2 },
  unit: 'day',
  tiebreak: [],
};

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

interface FakeGame {
  record: GameRecord;
  list: UserId[];
}

function fakeGame(date: string, list: UserId[]): FakeGame {
  return {
    record: {
      id: gameId(date),
      groupId: GROUP_ID,
      scheduleId: SCHEDULE_ID,
      date,
      // Sexta 19:00–22:00 em São Paulo (GRP-10: o item guarda o início e o fim).
      startsAt: `${date}T22:00:00.000Z`,
      endsAt: new Date(Date.parse(`${date}T22:00:00.000Z`) + 3 * 3600_000).toISOString(),
      createdAt: `${date}T00:00:00.000Z`,
      updatedAt: `${date}T00:00:00.000Z`,
      version: 1,
    },
    list,
  };
}

function publishedTeams(date: string, teams: string[][]): StoredTeams {
  return {
    gameId: gameId(date),
    groupId: GROUP_ID,
    date,
    status: 'published',
    teams,
    positions: {},
    publishedAt: `${date}T21:00:00.000Z`,
    extras: [],
    createdAt: `${date}T20:00:00.000Z`,
    updatedAt: `${date}T21:00:00.000Z`,
    version: 1,
  };
}

const LISTS: Record<string, UserId[]> = {
  [OCT30]: [OWNER, A, B],
  [NOV06]: [OWNER, A, B, C],
  [NOV13]: [OWNER, A, B],
  [NOV20]: [OWNER, A],
};

const unused = () => Promise.reject(new Error('not used by the seasons'));

function setup(
  opts: {
    group?: Partial<StoredGroup>;
    competition?: Partial<StoredCompetition> | null;
    results?: StoredGameResult[];
  } = {},
) {
  const clock = { now: OCT26 };
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
    roster: { ...ROSTER } as Record<string, MemberTier>,
    staff: { [A]: 'admin' } as Record<string, RoleId>,
    games: Object.fromEntries(Object.entries(LISTS).map(([date, list]) => [date, fakeGame(date, list)])),
    teams: {
      [OCT30]: publishedTeams(OCT30, [[OWNER], [A, B]]),
      [NOV06]: publishedTeams(NOV06, [
        [OWNER, A],
        [B, C],
      ]),
      [NOV13]: publishedTeams(NOV13, [[A], [OWNER, B]]),
      [NOV20]: publishedTeams(NOV20, [[OWNER], [A]]),
    } as Record<string, StoredTeams>,
    competition:
      opts.competition === null
        ? undefined
        : ({
            groupId: GROUP_ID,
            plan: 'trial',
            activeUntil: '2027-06-01T00:00:00.000Z',
            trialStartedAt: '2026-10-25T00:00:00.000Z',
            rules: RULES_SEASON,
            createdAt: '2026-10-25T00:00:00.000Z',
            updatedAt: '2026-10-25T00:00:00.000Z',
            ...opts.competition,
          } as StoredCompetition),
  };
  const resultStore = new Map<string, StoredGameResult>(
    (opts.results ?? []).map((r) => [r.gameId, structuredClone(r)]),
  );
  const matchStore: StoredMatch[] = [];
  const seasonStore = new Map<string, StoredSeason>();
  const seasonWrites: { op: string; id: string; oldStartDate?: string }[] = [];

  const groups: GroupRepository = {
    get: async (id) => (id === state.group.id ? structuredClone(state.group) : undefined),
    roleOf: async (groupId, userId) => (groupId === state.group.id ? state.roster[userId] : undefined),
    getByToken: unused,
    create: unused,
    addMember: unused,
    counts: unused,
    getMembership: async (groupId, userId) => {
      const role = groupId === state.group.id ? state.roster[userId] : undefined;
      if (!role) return undefined;
      return { tier: role, roleId: state.staff[userId] ?? (userId === OWNER ? 'owner' : 'member') };
    },
    setStaffRole: unused,
    transfer: unused,
    setMemberInvite: unused,
    clearMemberInvite: unused,
    acceptMemberInvite: unused,
    listMembers: async (groupId) =>
      groupId === state.group.id
        ? Object.entries(state.roster).map(([userId, role]) => {
            return {
              userId: asUserId(userId),
              tier: role,
              roleId: state.staff[userId] ?? (userId === OWNER ? 'owner' : 'member'),
              createdAt: '2026-01-01T00:00:00.000Z',
            };
          })
        : [],
    groupsOf: unused,
    rotateToken: unused,
    archive: unused,
    unarchive: unused,
    update: unused,
    rename: unused,
    removeMember: unused,
  };

  const findGame = (id: string) => Object.values(state.games).find((g) => g.record.id === id);
  /** O jogo pelo id (`GAME#<gameId>`), os jogadores (`PLAYER#`) e os jogos do grupo pelo lookup (competicao.md, seção 3). */
  const games: GameRepository = {
    get: async (id) => structuredClone(findGame(id)?.record),
    listPlayers: async (id) =>
      (findGame(id)?.list ?? []).map(
        (userId, i): PlayerRecord => ({
          gameId: id,
          userId,
          confirmedAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
        }),
      ),
    listByGroup: async (groupId) =>
      Object.values(state.games)
        .map((g) => g.record)
        .filter((g) => g.groupId === groupId)
        .sort((x, y) => x.startsAt.localeCompare(y.startsAt))
        .map((g) => structuredClone(g)),
    create: unused,
    cancel: unused,
    reopen: unused,
    updateSettings: unused,
    createExtra: unused,
    reschedule: unused,
    markMinReached: unused,
    getPlayer: unused,
    addPlayer: unused,
    removePlayer: unused,
  };

  const teams: TeamsRepository = {
    /** `GAME#<gameId>/TEAMS` (times.md, seção 3). */
    get: async (id) => structuredClone(Object.values(state.teams).find((x) => x.gameId === id)),
    put: unused,
    delete: unused,
  };

  const competitions: CompetitionRepository = {
    get: async (groupId) =>
      groupId === GROUP_ID && state.competition ? structuredClone(state.competition) : undefined,
    create: unused,
    updateRules: unused,
  };

  const results: ResultRepository = {
    get: async (id) => {
      const item = resultStore.get(id);
      return item ? structuredClone(item) : undefined;
    },
    listByGroup: async (groupId) =>
      [...resultStore.values()]
        .filter((r) => r.groupId === groupId)
        .sort((x, y) => x.startsAt.localeCompare(y.startsAt))
        .map((r) => structuredClone(r)),
    /** CMP-42 (ADR 0016): o 1º fechamento manda 0; a correção, a versão atual (que soma 1). */
    create: async (item, expectedVersion) => {
      expectVersionIn(resultStore.get(item.gameId)?.version ?? 0, expectedVersion);
      resultStore.set(item.gameId, { ...structuredClone(item), version: 1 });
      return true;
    },
    update: async (id, patch, expectedVersion) => {
      const item = resultStore.get(id);
      expectVersionIn(item?.version ?? 0, expectedVersion);
      if (!item) throw new Error('update without item');
      resultStore.set(id, { ...item, ...structuredClone(patch), version: item.version + 1 });
    },
  };

  const matches: MatchRepository = {
    list: async (id) => matchStore.filter((m) => m.gameId === id).map((m) => structuredClone(m)),
    get: async (id) => {
      const item = matchStore.find((m) => m.id === id);
      return item ? structuredClone(item) : undefined;
    },
    create: async (m) => {
      if (matchStore.filter((x) => x.gameId === m.gameId).length >= COMPETITION_MATCH_LIMIT) return 'full';
      matchStore.push({ ...structuredClone(m), version: 1 });
      return 'created';
    },
    /** CMP-42: editar e apagar a partida gravam só com a versão atual dela. */
    update: async (id, patch, expectedVersion) => {
      const index = matchStore.findIndex((m) => m.id === id);
      const item = matchStore[index];
      expectVersionIn(item?.version ?? 0, expectedVersion);
      if (!item) throw new Error('update without match');
      matchStore.splice(index, 1, { ...item, ...structuredClone(patch), version: item.version + 1 });
    },
    delete: async (m, expectedVersion) => {
      const index = matchStore.findIndex((x) => x.id === m.id);
      expectVersionIn(matchStore[index]?.version ?? 0, expectedVersion);
      if (index < 0) throw new Error('delete without match');
      matchStore.splice(index, 1);
    },
  };

  const seasons: SeasonRepository = {
    list: async (groupId) =>
      [...seasonStore.values()].filter((s) => s.groupId === groupId).map((s) => structuredClone(s)),
    get: async (id) => {
      const item = seasonStore.get(id);
      return item ? structuredClone(item) : undefined;
    },
    create: async (s) => {
      seasonWrites.push({ op: 'create', id: s.id });
      seasonStore.set(s.id, { ...structuredClone(s), version: 1 });
    },
    /** CMP-42 (ADR 0016): editar e cancelar a temporada gravam só com a versão atual dela. */
    update: async (id, patch, oldStartDate, expectedVersion) => {
      const item = seasonStore.get(id);
      expectVersionIn(item?.version ?? 0, expectedVersion);
      if (!item) throw new Error('update without season');
      seasonWrites.push({ op: 'update', id, ...(oldStartDate === undefined ? {} : { oldStartDate }) });
      seasonStore.set(id, { ...item, ...structuredClone(patch), version: item.version + 1 });
    },
    delete: async (s, expectedVersion) => {
      expectVersionIn(seasonStore.get(s.id)?.version ?? 0, expectedVersion);
      if (!seasonStore.has(s.id)) throw new Error('delete without season');
      seasonWrites.push({ op: 'delete', id: s.id });
      seasonStore.delete(s.id);
    },
    saveFinal: async (id, final) => {
      const item = seasonStore.get(id);
      if (!item) throw new Error('saveFinal without season');
      // `attribute_not_exists(final)`: o primeiro que trava vale.
      if (item.final !== undefined) {
        seasonWrites.push({ op: 'final_failed', id });
        return;
      }
      seasonWrites.push({ op: 'final', id });
      seasonStore.set(id, { ...item, final: structuredClone(final) });
    },
  };

  const record = (id: UserId): UserRecord => {
    const gender = GENDERS[id];
    return {
      id,
      publicId: pub(id),
      nickname: NAMES[id] ?? pub(id),
      createdAt: '2026-01-01T00:00:00.000Z',
      version: 1,
      ...(gender ? { gender } : {}),
    };
  };
  const users = {
    getMany: async (ids: readonly UserId[]): Promise<UserRecord[]> =>
      ids.filter((id) => PEOPLE.includes(id)).map(record),
    getByPublicId: async (publicId: string): Promise<UserRecord | undefined> => {
      const id = PEOPLE.find((p) => pub(p) === publicId);
      return id ? record(id) : undefined;
    },
    resolve: async (publicIds: readonly PublicUserId[]) =>
      new Map(
        publicIds.flatMap((p) => {
          const id = PEOPLE.find((u) => pub(u) === p);
          return id ? [[p, id] as const] : [];
        }),
      ),
  };

  const now = () => clock.now;
  const service = createSeasonService({ groups, competitions, seasons, results, matches, users, now });
  const resultService = createResultService({
    groups,
    games,
    teams,
    competitions,
    results,
    matches,
    users,
    seasons,
    now,
  });
  const matchService = createMatchService({
    groups,
    games,
    teams,
    competitions,
    results,
    matches,
    users,
    seasons,
    now,
    detail: (userId, groupId, date) => resultService.get(userId, groupId, date),
  });
  const rankingService = createRankingService({
    groups,
    competitions,
    results,
    matches,
    users,
    seasons,
    now,
  });
  return {
    clock,
    state,
    resultStore,
    matchStore,
    seasonStore,
    seasonWrites,
    service,
    results: resultService,
    matches: matchService,
    ranking: rankingService,
    /** CMP-42: a versão que a tela mostrou (`0` = não existe). */
    sv: (id: string) => ({ version: seasonStore.get(id)?.version ?? 0 }),
    rv: (date: string) => ({ version: resultStore.get(gameId(date))?.version ?? 0 }),
    mv: (id: string) => ({ version: matchStore.find((m) => m.id === id)?.version ?? 0 }),
  };
}

type T = ReturnType<typeof setup>;

async function expectAppError(p: Promise<unknown>, code: ErrorCode, status: number): Promise<AppError> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({ code, status });
  return err as AppError;
}

async function expectInvalid(p: Promise<unknown>, reason: string) {
  const err = await expectAppError(p, 'SEASON_INVALID', 422);
  expect(err.details).toEqual({ reason });
}

/** Cria a temporada pelo dono no instante `at` e deixa o relógio lá. */
async function open(t: T, at: Date, input: SeasonInput): Promise<Season> {
  t.clock.now = at;
  return t.service.create(OWNER, GROUP_ID, input);
}

/** Fecha o jogo com todos da lista presentes; `winner` só no modo pelo dia. */
function closeGame(t: T, date: string, winner?: 0 | 1, who: UserId = OWNER) {
  const attendance = Object.fromEntries((LISTS[date] ?? []).map((id) => [pub(id), 'present' as const]));
  return t.results.close(who, GROUP_ID, gameId(date), {
    ...t.rv(date),
    attendance,
    friendly: false,
    ...(winner === undefined ? {} : { winner }),
  });
}

const matchInput = (a: UserId[], b: UserId[]): MatchInput => ({
  teams: [a.map(pub), b.map(pub)] as MatchInput['teams'],
  winner: 0,
});

const leaksSystemId = (value: unknown) => PEOPLE.some((id) => JSON.stringify(value).includes(id));
const rowOf = (ranking: Ranking, id: UserId) => ranking.rows.find((r) => r.userId === pub(id));
const seasonOf = (list: Season[], id: string) => list.find((s) => s.id === id);

// Fechamentos gravados direto (para o ranking), com uma cópia própria: V 3, E 1, D 0, sem desempate.
const COPY: CompetitionRules = {
  points: { win: 3, draw: 1, loss: 0, notConfirmed: 0, noShow: -2, cancelled: 0 },
  unit: 'day',
  tiebreak: [],
};
const inside = (ids: UserId[]) => ids.map((id) => ({ id, inside: true }));
const present = (ids: UserId[]) => Object.fromEntries(ids.map((id) => [id, 'present' as const]));

function stored(date: string, list: UserId[], teams: UserId[][]): StoredGameResult {
  return {
    gameId: gameId(date),
    groupId: GROUP_ID,
    date,
    startsAt: `${date}T22:00:00.000Z`,
    cancelled: false,
    friendly: false,
    rules: COPY,
    members: [OWNER, A, B, C, D],
    reserves: [R],
    list: inside(list),
    attendance: present(list),
    teams,
    winner: 0,
    createdAt: `${date}T23:00:00.000Z`,
    updatedAt: `${date}T23:00:00.000Z`,
    version: 1,
  };
}

/**
 * Na temporada S1: 30/10 (Ana vence Dono e Beatriz) e 06/11 (Caio vence Ana). Fora dela: 13/11 (Dono vence Beatriz).
 * Na temporada: Ana 3 (2 presenças), Caio 3 (1), Dono 0 (1), Beatriz 0 (1), Davi 0 (0).
 * No grupo: Ana 3, Caio 3, Dono 3, Beatriz 0, Davi 0.
 */
const RANKED = [
  stored(OCT30, [OWNER, A, B], [[A], [OWNER, B]]),
  stored(NOV06, [A, C], [[C], [A]]),
  stored(NOV13, [OWNER, B], [[OWNER], [B]]),
];

/** S1 aberta com o desempate "mais presente" e o grupo mudando depois para sem desempate. */
async function rankedSeason() {
  const t = setup({ results: RANKED, competition: { rules: { ...RULES_SEASON, tiebreak: ['attendance'] } } });
  const season = await open(t, OCT26, S1);
  if (t.state.competition) t.state.competition.rules = RULES_NEW;
  return { t, season };
}

// ---------------------------------------------------------------------------------------------

describe('a temporada (CMP-29)', () => {
  it('CMP-29: abrir grava o nome, as datas e a cópia do regulamento do grupo daquele momento', async () => {
    const t = setup();
    const res = await open(t, OCT26, S1);

    expect(SeasonSchema.parse(res)).toEqual(res);
    expect(res).toMatchObject({
      number: 1,
      name: 'Primavera',
      startDate: '2026-10-26',
      endDate: '2026-11-08',
      state: 'open',
      rules: RULES_SEASON,
    });
    expect(res.podium).toBeUndefined();
    expect(res.closedAt).toBeUndefined();
    expect(t.seasonWrites).toEqual([{ op: 'create', id: res.id }]);
  });

  it('CMP-29: mudar o regulamento do grupo depois não muda a cópia da temporada', async () => {
    const t = setup();
    const season = await open(t, OCT26, S1);
    if (t.state.competition) t.state.competition.rules = RULES_NEW;
    t.clock.now = NOV01;
    const list = await t.service.list(B, GROUP_ID);
    expect(seasonOf(list, season.id)?.rules).toEqual(RULES_SEASON);
  });

  it('CMP-29: a ordem de criação no grupo dá o número (o "N" de "Temporada N"); o nome pode faltar', async () => {
    const t = setup();
    const first = await open(t, OCT26, { startDate: '2026-10-26', endDate: '2026-11-08' });
    const second = await t.service.create(OWNER, GROUP_ID, {
      startDate: '2026-11-20',
      endDate: '2026-12-20',
    });
    expect(first.number).toBe(1);
    expect(second.number).toBe(2);
    expect(SeasonSchema.parse(second)).toEqual(second);
  });

  it('CMP-29: duração fora de 7 dias a 1 ano: SEASON_INVALID (duration)', async () => {
    const t = setup();
    t.clock.now = OCT26;
    await expectInvalid(
      t.service.create(OWNER, GROUP_ID, { startDate: '2026-10-26', endDate: '2026-10-29' }),
      'duration',
    );
    await expectInvalid(
      t.service.create(OWNER, GROUP_ID, { startDate: '2026-10-26', endDate: '2027-12-31' }),
      'duration',
    );
    expect(t.seasonWrites).toEqual([]);
  });

  it('CMP-29: as datas são locais, no fuso do grupo', async () => {
    // 13/11 23:00 em São Paulo (já 14/11 em UTC): "hoje" é 13/11.
    const late = sp('2026-11-13', '23:00');
    const t = setup();
    const today = await open(t, late, { startDate: '2026-11-13', endDate: '2026-11-30' });
    expect(today.state).toBe('open');

    const u = setup();
    const tomorrow = await open(u, late, { startDate: '2026-11-14', endDate: '2026-11-30' });
    expect(tomorrow.state).toBe('scheduled');
  });

  it('CMP-29: o prazo da temporada vai até o fim do dia de fim + 3, no fuso do grupo', async () => {
    const t = setup();
    const season = await open(t, OCT26, S1);
    // Fim em 08/11 → o prazo vai até o fim de 11/11 em São Paulo (12/11 03:00 UTC).
    const until = Date.parse(season.graceUntil);
    expect(until).toBeGreaterThan(sp('2026-11-11', '23:30').getTime());
    expect(until).toBeLessThanOrEqual(sp('2026-11-12', '00:00').getTime());
  });
});

describe('abrir e programar (CMP-30)', () => {
  it('CMP-30: o Admin programa uma temporada que começa no futuro', async () => {
    const t = setup();
    t.clock.now = NOV01;
    const res = await t.service.create(A, GROUP_ID, {
      name: 'Verão',
      startDate: '2026-12-01',
      endDate: '2027-02-28',
    });
    expect(res).toMatchObject({ state: 'scheduled', startDate: '2026-12-01', rules: RULES_SEASON });
  });

  it('CMP-30: início no passado: SEASON_INVALID (past_start); mais de 1 ano à frente: SEASON_INVALID (too_far)', async () => {
    const t = setup();
    t.clock.now = NOV01;
    await expectInvalid(
      t.service.create(OWNER, GROUP_ID, { startDate: '2026-10-31', endDate: '2026-11-30' }),
      'past_start',
    );
    await expectInvalid(
      t.service.create(OWNER, GROUP_ID, { startDate: '2027-12-20', endDate: '2028-01-20' }),
      'too_far',
    );
  });

  it('CMP-30: uma por vez: cruzar com a aberta ou com a programada dá SEASON_INVALID (overlap)', async () => {
    const t = setup();
    await open(t, OCT26, S1);
    t.clock.now = NOV01;
    await expectInvalid(
      t.service.create(OWNER, GROUP_ID, { startDate: '2026-11-05', endDate: '2026-11-20' }),
      'overlap',
    );
    await t.service.create(OWNER, GROUP_ID, { startDate: '2026-11-20', endDate: '2026-12-20' });
    await expectInvalid(
      t.service.create(OWNER, GROUP_ID, { startDate: '2026-12-15', endDate: '2027-01-15' }),
      'overlap',
    );
  });

  it('CMP-30: logo depois da outra, ou com um período sem temporada no meio, vale', async () => {
    const t = setup();
    await open(t, OCT26, S1);
    t.clock.now = NOV01;
    const next = await t.service.create(OWNER, GROUP_ID, { startDate: '2026-11-09', endDate: '2026-11-30' });
    const later = await t.service.create(OWNER, GROUP_ID, { startDate: '2027-01-10', endDate: '2027-02-10' });
    expect(next.state).toBe('scheduled');
    expect(later.state).toBe('scheduled');
    expect((await t.service.list(OWNER, GROUP_ID)).length).toBe(3);
  });

  it('CMP-30: quem não tem seasons.manage recebe GROUP_PERMISSION_DENIED; quem não participa, GROUP_NOT_FOUND', async () => {
    const t = setup();
    t.clock.now = OCT26;
    await expectAppError(t.service.create(B, GROUP_ID, S1), 'GROUP_PERMISSION_DENIED', 403);
    await expectAppError(t.service.create(R, GROUP_ID, S1), 'GROUP_PERMISSION_DENIED', 403);
    await expectAppError(t.service.create(OUTSIDER, GROUP_ID, S1), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.service.create(OWNER, OTHER_GROUP_ID, S1), 'GROUP_NOT_FOUND', 404);
    expect(t.seasonWrites).toEqual([]);
  });

  it('CMP-30: grupo arquivado: GROUP_ARCHIVED; competição vencida ou desativada: COMPETITION_INACTIVE', async () => {
    const archived = setup({ group: { archivedAt: '2026-10-20T00:00:00.000Z' } });
    archived.clock.now = OCT26;
    await expectAppError(archived.service.create(OWNER, GROUP_ID, S1), 'GROUP_ARCHIVED', 409);

    const expired = setup({ competition: { activeUntil: '2026-10-26T00:00:00.000Z' } });
    expired.clock.now = OCT26;
    await expectAppError(expired.service.create(OWNER, GROUP_ID, S1), 'COMPETITION_INACTIVE', 409);

    const inactive = setup({ competition: null });
    inactive.clock.now = OCT26;
    await expectAppError(inactive.service.create(OWNER, GROUP_ID, S1), 'COMPETITION_INACTIVE', 409);
  });

  it('CMP-30: a ordem dos erros: a permissão antes do arquivado, e o arquivado antes da competição vencida', async () => {
    const t = setup({
      group: { archivedAt: '2026-10-20T00:00:00.000Z' },
      competition: { activeUntil: '2026-10-26T00:00:00.000Z' },
    });
    t.clock.now = OCT26;
    await expectAppError(t.service.create(B, GROUP_ID, S1), 'GROUP_PERMISSION_DENIED', 403);
    await expectAppError(t.service.create(OWNER, GROUP_ID, S1), 'GROUP_ARCHIVED', 409);
  });

  it('CMP-30: a programada muda o nome, as datas e copia de novo o regulamento do grupo', async () => {
    const t = setup();
    t.clock.now = NOV01;
    const season = await t.service.create(OWNER, GROUP_ID, {
      name: 'Verão',
      startDate: '2026-12-01',
      endDate: '2027-01-31',
    });
    if (t.state.competition) t.state.competition.rules = RULES_NEW;

    const renamed = await t.service.update(A, GROUP_ID, season.id, {
      ...t.sv(season.id),
      name: 'Verão 2027',
    });
    expect(renamed).toMatchObject({ name: 'Verão 2027', rules: RULES_SEASON });

    const moved = await t.service.update(OWNER, GROUP_ID, season.id, {
      ...t.sv(season.id),
      startDate: '2026-12-15',
      endDate: '2027-02-15',
      copyRules: true,
    });
    expect(moved).toMatchObject({
      name: 'Verão 2027',
      startDate: '2026-12-15',
      endDate: '2027-02-15',
      state: 'scheduled',
      rules: RULES_NEW,
    });
    // Mudar o início troca o lookup: o repositório recebe o início antigo.
    expect(t.seasonWrites).toContainEqual({ op: 'update', id: season.id, oldStartDate: '2026-12-01' });
    expect(seasonOf(await t.service.list(OWNER, GROUP_ID), season.id)).toMatchObject({
      startDate: '2026-12-15',
      rules: RULES_NEW,
    });
  });

  it('CMP-30: mudar as datas da programada confere as outras (sem contar ela mesma)', async () => {
    const t = setup();
    await open(t, OCT26, S1);
    t.clock.now = NOV01;
    const next = await t.service.create(OWNER, GROUP_ID, { startDate: '2026-11-20', endDate: '2026-12-20' });
    // Cruza com ela mesma: vale.
    await t.service.update(OWNER, GROUP_ID, next.id, {
      ...t.sv(next.id),
      startDate: '2026-11-25',
      endDate: '2026-12-25',
    });
    // Cruza com a aberta: não vale.
    await expectInvalid(
      t.service.update(OWNER, GROUP_ID, next.id, {
        ...t.sv(next.id),
        startDate: '2026-11-05',
        endDate: '2026-12-05',
      }),
      'overlap',
    );
    await expectInvalid(
      t.service.update(OWNER, GROUP_ID, next.id, {
        ...t.sv(next.id),
        startDate: '2026-11-25',
        endDate: '2026-11-27',
      }),
      'duration',
    );
  });

  it('CMP-30: a programada pode ser cancelada (apagada), e as datas ficam livres', async () => {
    const t = setup();
    t.clock.now = NOV01;
    const season = await t.service.create(OWNER, GROUP_ID, {
      startDate: '2026-12-01',
      endDate: '2026-12-31',
    });
    await t.service.remove(A, GROUP_ID, season.id, t.sv(season.id));
    expect(t.seasonWrites).toContainEqual({ op: 'delete', id: season.id });
    expect(await t.service.list(OWNER, GROUP_ID)).toEqual([]);
    await t.service.create(OWNER, GROUP_ID, { startDate: '2026-12-01', endDate: '2026-12-31' });
  });

  it('CMP-30: depois de começar, só o nome muda: datas, regulamento e cancelar dão SEASON_INVALID (started)', async () => {
    const t = setup();
    const season = await open(t, OCT26, S1);
    t.clock.now = NOV01;
    await expectInvalid(
      t.service.update(OWNER, GROUP_ID, season.id, { ...t.sv(season.id), endDate: '2026-11-15' }),
      'started',
    );
    await expectInvalid(
      t.service.update(OWNER, GROUP_ID, season.id, { ...t.sv(season.id), startDate: '2026-11-02' }),
      'started',
    );
    await expectInvalid(
      t.service.update(OWNER, GROUP_ID, season.id, { ...t.sv(season.id), copyRules: true }),
      'started',
    );
    await expectInvalid(t.service.remove(OWNER, GROUP_ID, season.id, t.sv(season.id)), 'started');

    const renamed = await t.service.update(OWNER, GROUP_ID, season.id, {
      ...t.sv(season.id),
      name: 'Primavera 2026',
    });
    expect(renamed).toMatchObject({ name: 'Primavera 2026', endDate: '2026-11-08', state: 'open' });
  });

  it('CMP-30: mudar ou cancelar sem seasons.manage: GROUP_PERMISSION_DENIED', async () => {
    const t = setup();
    t.clock.now = NOV01;
    const season = await t.service.create(OWNER, GROUP_ID, {
      startDate: '2026-12-01',
      endDate: '2026-12-31',
    });
    await expectAppError(
      t.service.update(B, GROUP_ID, season.id, { ...t.sv(season.id), name: 'X' }),
      'GROUP_PERMISSION_DENIED',
      403,
    );
    await expectAppError(
      t.service.remove(B, GROUP_ID, season.id, t.sv(season.id)),
      'GROUP_PERMISSION_DENIED',
      403,
    );
  });

  it('CMP-30: temporada que não existe, ou de outro grupo: SEASON_NOT_FOUND', async () => {
    const t = setup();
    const season = await open(t, OCT26, S1);
    const original = t.seasonStore.get(season.id);
    if (!original) throw new Error('fixture');
    t.seasonStore.set(OTHER_GROUP_SEASON, { ...original, id: OTHER_GROUP_SEASON, groupId: OTHER_GROUP_ID });

    await expectAppError(
      t.service.update(OWNER, GROUP_ID, UNKNOWN_SEASON, { ...t.sv(UNKNOWN_SEASON), name: 'X' }),
      'SEASON_NOT_FOUND',
      404,
    );
    await expectAppError(
      t.service.remove(OWNER, GROUP_ID, UNKNOWN_SEASON, t.sv(UNKNOWN_SEASON)),
      'SEASON_NOT_FOUND',
      404,
    );
    await expectAppError(t.service.close(OWNER, GROUP_ID, UNKNOWN_SEASON), 'SEASON_NOT_FOUND', 404);
    await expectAppError(
      t.service.update(OWNER, GROUP_ID, OTHER_GROUP_SEASON, { ...t.sv(OTHER_GROUP_SEASON), name: 'X' }),
      'SEASON_NOT_FOUND',
      404,
    );
    await expectAppError(t.service.close(OWNER, GROUP_ID, OTHER_GROUP_SEASON), 'SEASON_NOT_FOUND', 404);
  });
});

describe('o regulamento da temporada nos jogos (CMP-31, CMP-14)', () => {
  it('CMP-31: o jogo fechado dentro da temporada guarda a cópia dela, e não o regulamento do grupo de agora', async () => {
    const t = setup();
    await open(t, OCT26, S1);
    if (t.state.competition) t.state.competition.rules = RULES_NEW;
    t.clock.now = NOV07;
    await closeGame(t, NOV06, 0);
    expect(t.resultStore.get(gameId(NOV06))?.rules).toEqual(RULES_SEASON);
  });

  it('CMP-14: o jogo de fora de temporada guarda o regulamento do grupo', async () => {
    const t = setup();
    await open(t, OCT26, S1);
    if (t.state.competition) t.state.competition.rules = RULES_NEW;
    t.clock.now = NOW;
    await closeGame(t, NOV13, 0);
    expect(t.resultStore.get(gameId(NOV13))?.rules).toEqual(RULES_NEW);
  });

  it('CMP-19: a unidade do jogo ainda não fechado é a da temporada, e as partidas valem nela', async () => {
    const t = setup({ competition: { rules: { ...RULES_SEASON, unit: 'match' } } });
    await open(t, OCT26, S1);
    // O grupo passa para "pelo dia" no meio da temporada.
    if (t.state.competition) t.state.competition.rules = RULES_NEW;
    t.clock.now = NOV07;
    expect((await t.results.get(OWNER, GROUP_ID, gameId(NOV06))).unit).toBe('match');
    const res = await t.matches.create(OWNER, GROUP_ID, gameId(NOV06), matchInput([OWNER, A], [B, C]));
    expect(res.matches.length).toBe(1);

    // Fora da temporada vale o do grupo: pelo dia.
    t.clock.now = NOW;
    expect((await t.results.get(OWNER, GROUP_ID, gameId(NOV13))).unit).toBe('day');
  });
});

describe('encerrar, o prazo e a trava (CMP-32, CMP-11, CMP-15, CMP-19)', () => {
  it('CMP-32: no prazo de 3 dias depois do fim, ainda dá para fechar, corrigir e registrar partidas', async () => {
    const t = setup({ competition: { rules: { ...RULES_SEASON, unit: 'match' } } });
    await open(t, OCT26, S1);
    t.clock.now = IN_GRACE;
    expect(seasonOf(await t.service.list(OWNER, GROUP_ID), t.seasonWrites[0]?.id ?? '')?.state).toBe('grace');

    await t.matches.create(A, GROUP_ID, gameId(NOV06), matchInput([OWNER, A], [B, C]));
    await closeGame(t, NOV06, undefined, A);
    const corrected = await t.results.close(A, GROUP_ID, gameId(NOV06), {
      ...t.rv(NOV06),
      attendance: Object.fromEntries((LISTS[NOV06] ?? []).map((id) => [pub(id), 'present' as const])),
      friendly: true,
    });
    expect(corrected.friendly).toBe(true);
  });

  it('CMP-11: passado o prazo, fechar um jogo da temporada dá SEASON_CLOSED', async () => {
    const t = setup();
    await open(t, OCT26, S1);
    t.clock.now = NOW;
    await expectAppError(closeGame(t, NOV06, 0), 'SEASON_CLOSED', 409);
    expect(t.resultStore.has(gameId(NOV06))).toBe(false);
  });

  it('CMP-15: corrigir vale até a temporada travar; depois, SEASON_CLOSED', async () => {
    const t = setup();
    await open(t, OCT26, S1);
    t.clock.now = NOV07;
    await closeGame(t, OCT30, 0);
    t.clock.now = NOW;
    await expectAppError(closeGame(t, OCT30, 1), 'SEASON_CLOSED', 409);
    expect(t.resultStore.get(gameId(OCT30))?.winner).toBe(0);
  });

  it('CMP-19: passado o prazo, registrar ou apagar partida de um jogo da temporada dá SEASON_CLOSED', async () => {
    const t = setup({ competition: { rules: { ...RULES_SEASON, unit: 'match' } } });
    await open(t, OCT26, S1);
    t.clock.now = NOV07;
    const detail = await t.matches.create(OWNER, GROUP_ID, gameId(NOV06), matchInput([OWNER, A], [B, C]));
    const matchId = detail.matches[0]?.id ?? '';
    t.clock.now = NOW;
    await expectAppError(
      t.matches.create(OWNER, GROUP_ID, gameId(NOV06), matchInput([OWNER], [B])),
      'SEASON_CLOSED',
      409,
    );
    await expectAppError(
      t.matches.update(OWNER, GROUP_ID, gameId(NOV06), matchId, {
        ...matchInput([OWNER], [B]),
        ...t.mv(matchId),
      }),
      'SEASON_CLOSED',
      409,
    );
    await expectAppError(
      t.matches.remove(OWNER, GROUP_ID, gameId(NOV06), matchId, t.mv(matchId)),
      'SEASON_CLOSED',
      409,
    );
    expect(t.matchStore.length).toBe(1);
  });

  it('CMP-32: o jogo de fora da temporada travada continua fechando normalmente', async () => {
    const t = setup();
    await open(t, OCT26, S1);
    t.clock.now = NOW;
    const res = await closeGame(t, NOV13, 0);
    expect(res.closed).toBe(true);
  });

  it('CMP-32: encerrar antes da data passa o fim para hoje e trava na hora, sem prazo', async () => {
    const t = setup();
    const season = await open(t, OCT26, S_LONG);
    t.clock.now = NOV07;
    await closeGame(t, OCT30, 0);

    t.clock.now = NOW;
    const closed = await t.service.close(A, GROUP_ID, season.id);
    expect(SeasonSchema.parse(closed)).toEqual(closed);
    expect(closed).toMatchObject({ state: 'closed', endDate: NOV13, closedAt: NOW.toISOString() });
    expect(Date.parse(closed.graceUntil)).toBe(NOW.getTime());

    await expectAppError(closeGame(t, NOV13, 0), 'SEASON_CLOSED', 409);
    await expectAppError(closeGame(t, NOV06, 0), 'SEASON_CLOSED', 409);
    await expectAppError(closeGame(t, OCT30, 1), 'SEASON_CLOSED', 409);

    // O jogo da semana seguinte já está fora dela.
    t.clock.now = NOV20_GAME;
    expect((await closeGame(t, NOV20, 0)).closed).toBe(true);
  });

  it('CMP-11: GAME_NOT_STARTED vem antes de SEASON_CLOSED', async () => {
    const t = setup();
    const season = await open(t, OCT26, S_LONG);
    t.clock.now = NOV13_MORNING;
    await t.service.close(OWNER, GROUP_ID, season.id);
    await expectAppError(closeGame(t, NOV13, 0), 'GAME_NOT_STARTED', 409);
  });

  it('CMP-32: encerrar sem seasons.manage: GROUP_PERMISSION_DENIED', async () => {
    const t = setup();
    const season = await open(t, OCT26, S_LONG);
    t.clock.now = NOV07;
    await expectAppError(t.service.close(B, GROUP_ID, season.id), 'GROUP_PERMISSION_DENIED', 403);
    expect(seasonOf(await t.service.list(B, GROUP_ID), season.id)?.state).toBe('open');
  });

  it('CMP-32: o jogo da temporada que ficou sem fechar não entra no ranking dela', async () => {
    const t = setup();
    const season = await open(t, OCT26, S1);
    t.clock.now = NOV07;
    await closeGame(t, OCT30, 0);
    t.clock.now = NOW;
    const res = await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    expect(res.games).toBe(1);
  });
});

describe('o ranking da temporada e o pódio (CMP-33, CMP-32)', () => {
  it('CMP-33: só os jogos da temporada entram; o ranking do grupo continua com todos', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOW;
    const res = await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    expect(RankingSchema.parse(res)).toEqual(res);
    expect(res.games).toBe(2);
    expect(rowOf(res, OWNER)?.points).toBe(0);
    expect(rowOf(res, A)?.points).toBe(3);

    const group = await t.ranking.ranking(B, GROUP_ID);
    expect(group.games).toBe(3);
    expect(rowOf(group, OWNER)?.points).toBe(3);
    expect(group.season).toBeUndefined();
  });

  it('CMP-33: o desempate é o da temporada, e não o do grupo de agora', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOW;
    const res = await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    // Ana e Caio com 3: Ana tem 2 presenças, Caio 1.
    expect(rowOf(res, A)?.position).toBe(1);
    expect(rowOf(res, C)?.position).toBe(2);

    // No grupo, sem desempate: Ana, Caio e Dono dividem o 1º.
    const group = await t.ranking.ranking(B, GROUP_ID);
    expect([rowOf(group, A)?.position, rowOf(group, C)?.position, rowOf(group, OWNER)?.position]).toEqual([
      1, 1, 1,
    ]);
  });

  it('CMP-33: aberta ou no prazo, é calculado na leitura, com os membros de agora', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOV07;
    const open1 = await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    expect(open1.season).toEqual({ id: season.id, name: 'Primavera', state: 'open' });
    expect(open1.final).toBe(false);

    t.clock.now = IN_GRACE;
    delete t.state.roster[C];
    const grace = await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    expect(grace.season?.state).toBe('grace');
    expect(grace.final).toBe(false);
    expect(rowOf(grace, C)).toBeUndefined();
    expect(t.seasonWrites.filter((w) => w.op.startsWith('final'))).toEqual([]);
  });

  it('CMP-32: ao travar, o ranking final fica guardado e não muda mais, nem com quem sai do grupo', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOW;
    const first = await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    expect(first.final).toBe(true);
    expect(first.season?.state).toBe('closed');
    expect(rowOf(first, C)?.points).toBe(3);

    // Caio sai do grupo e um fechamento antigo muda no banco: o final não muda.
    delete t.state.roster[C];
    const g2 = t.resultStore.get(gameId(NOV06));
    if (!g2) throw new Error('fixture');
    t.resultStore.set(gameId(NOV06), { ...g2, winner: 1 });

    const again = await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    expect(again).toEqual(first);
    expect(t.seasonWrites.filter((w) => w.op.startsWith('final'))).toEqual([{ op: 'final', id: season.id }]);
    // O do grupo é o de agora: Caio saiu.
    expect(rowOf(await t.ranking.ranking(B, GROUP_ID), C)).toBeUndefined();
  });

  it('CMP-33: travada, a temporada mostra quem era membro ao travar, mesmo quem saiu depois', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOW;
    await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    delete t.state.roster[C];
    const res = await t.ranking.ranking(A, GROUP_ID, undefined, season.id);
    expect(rowOf(res, C)).toMatchObject({ points: 3, position: 2 });
    expect(leaksSystemId(res)).toBe(false);
  });

  it('CMP-33: o recorte por gênero vale também no ranking da temporada, com o gênero de agora', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOV07;
    const open1 = await t.ranking.ranking(B, GROUP_ID, 'F', season.id);
    expect(open1.rows.map((r) => r.userId).sort()).toEqual([pub(A), pub(B)].sort());

    t.clock.now = NOW;
    const final = await t.ranking.ranking(B, GROUP_ID, 'F', season.id);
    expect(final.final).toBe(true);
    expect(final.rows.map((r) => r.userId).sort()).toEqual([pub(A), pub(B)].sort());
    const male = await t.ranking.ranking(B, GROUP_ID, 'M', season.id);
    expect(male.rows.map((r) => r.userId).sort()).toEqual([pub(OWNER), pub(D)].sort());
  });

  it('CMP-33: o pódio são as posições 1, 2 e 3, com todos os empatados (pode passar de 3 pessoas)', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOW;
    const list = await t.service.list(B, GROUP_ID);
    const closed = seasonOf(list, season.id);
    expect(closed?.state).toBe('closed');
    // Ana 1º, Caio 2º, Dono e Beatriz dividem o 3º (1 presença cada); Davi (0 presença) é o 5º e fica de fora.
    const podium = (closed?.podium ?? []).map((r) => `${r.position}:${r.userId}`).sort();
    expect(podium).toEqual([`1:${pub(A)}`, `2:${pub(C)}`, `3:${pub(B)}`, `3:${pub(OWNER)}`].sort());
    expect(leaksSystemId(list)).toBe(false);
  });
});

describe('quem vê as temporadas (CMP-34)', () => {
  it('CMP-34: membros e reservas veem a aberta, a programada e as encerradas, da mais recente para a mais antiga', async () => {
    const t = setup();
    const first = await open(t, OCT26, S1);
    t.clock.now = IN_GRACE;
    const scheduled = await t.service.create(OWNER, GROUP_ID, {
      name: 'Dezembro',
      startDate: '2026-12-01',
      endDate: '2026-12-31',
    });
    const current = await t.service.create(OWNER, GROUP_ID, {
      name: 'Novembro',
      startDate: '2026-11-10',
      endDate: '2026-11-30',
    });

    const list = await t.service.list(R, GROUP_ID);
    for (const s of list) expect(SeasonSchema.parse(s)).toEqual(s);
    expect(list.map((s) => [s.id, s.state])).toEqual([
      [scheduled.id, 'scheduled'],
      [current.id, 'open'],
      [first.id, 'grace'],
    ]);
    expect(list.every((s) => s.podium === undefined)).toBe(true);

    t.clock.now = NOW;
    const later = await t.service.list(B, GROUP_ID);
    expect(seasonOf(later, first.id)?.state).toBe('closed');
    expect(seasonOf(later, first.id)?.podium).toBeDefined();
    expect(seasonOf(later, current.id)?.podium).toBeUndefined();
  });

  it('CMP-34: vale com a competição vencida e com o grupo arquivado', async () => {
    const t = setup();
    const season = await open(t, OCT26, S1);
    t.clock.now = NOW;
    if (t.state.competition) t.state.competition.activeUntil = '2026-11-10T00:00:00.000Z';
    t.state.group = { ...t.state.group, archivedAt: '2026-11-12T00:00:00.000Z' };
    const list = await t.service.list(A, GROUP_ID);
    expect(list.map((s) => s.id)).toEqual([season.id]);
  });

  it('CMP-34: quem não participa do grupo recebe GROUP_NOT_FOUND', async () => {
    const t = setup();
    await open(t, OCT26, S1);
    await expectAppError(t.service.list(OUTSIDER, GROUP_ID), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.service.list(A, OTHER_GROUP_ID), 'GROUP_NOT_FOUND', 404);
  });

  it('CMP-34: sem temporada, a lista vem vazia', async () => {
    const t = setup();
    expect(await t.service.list(B, GROUP_ID)).toEqual([]);
  });
});

describe('temporada com a versão que a tela mostrou (CMP-42)', () => {
  const scheduled = async (t: T) => {
    t.clock.now = NOV01;
    return t.service.create(OWNER, GROUP_ID, {
      name: 'Verão',
      startDate: '2026-12-01',
      endDate: '2027-01-31',
    });
  };

  it('CMP-42: criar não manda versão, e a temporada sai com a version 1 (na criação e na lista)', async () => {
    const t = setup();
    const season = await scheduled(t);
    expect(season.version).toBe(1);
    expect(seasonOf(await t.service.list(OWNER, GROUP_ID), season.id)?.version).toBe(1);
  });

  it('CMP-42: editar com a versão da temporada grava e soma 1', async () => {
    const t = setup();
    const season = await scheduled(t);
    const renamed = await t.service.update(OWNER, GROUP_ID, season.id, { version: 1, name: 'Verão 2027' });
    expect(renamed).toMatchObject({ name: 'Verão 2027', version: 2 });
  });

  it('CMP-42: editar com a versão velha → VERSION_CONFLICT (409, currentVersion) e nada é gravado', async () => {
    const t = setup();
    const season = await scheduled(t);
    await t.service.update(OWNER, GROUP_ID, season.id, { version: 1, name: 'Verão 2027' });
    const writes = t.seasonWrites.length;
    const err = await expectAppError(
      t.service.update(A, GROUP_ID, season.id, { version: 1, name: 'Outro' }),
      'VERSION_CONFLICT',
      409,
    );
    expect(err.details).toEqual({ currentVersion: 2 });
    expect(t.seasonWrites).toHaveLength(writes);
    expect(t.seasonStore.get(season.id)).toMatchObject({ name: 'Verão 2027', version: 2 });
  });

  it('CMP-42: cancelar com a versão velha → VERSION_CONFLICT e a temporada continua', async () => {
    const t = setup();
    const season = await scheduled(t);
    await t.service.update(OWNER, GROUP_ID, season.id, { version: 1, name: 'Verão 2027' });
    const err = await expectAppError(
      t.service.remove(OWNER, GROUP_ID, season.id, { version: 1 }),
      'VERSION_CONFLICT',
      409,
    );
    expect(err.details).toEqual({ currentVersion: 2 });
    expect(t.seasonStore.has(season.id)).toBe(true);
    await t.service.remove(OWNER, GROUP_ID, season.id, { version: 2 });
    expect(t.seasonStore.has(season.id)).toBe(false);
  });

  it('CMP-42: encerrar não manda versão', async () => {
    const t = setup();
    const season = await open(t, OCT26, S_LONG);
    t.clock.now = NOW;
    const closed = await t.service.close(A, GROUP_ID, season.id);
    expect(closed.state).toBe('closed');
  });

  it('CMP-42: o contrato pede a version para editar, e não para criar', () => {
    expect(SeasonUpdateInputSchema.safeParse({ name: 'X' }).success).toBe(false);
    expect(SeasonUpdateInputSchema.safeParse({ version: 1, name: 'X' }).success).toBe(true);
    expect(SeasonInputSchema.safeParse({ ...S1, version: 1 }).data).not.toHaveProperty('version');
  });
});
