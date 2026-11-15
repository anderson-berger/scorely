import { appError } from '@scorely/api/src/lib/errors';
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
import {
  createSeasonLockJob,
  type SeasonLockRepository,
} from '@scorely/api/src/modules/competition/season.lock';
import type {
  SeasonRepository,
  StoredSeason,
  StoredTrophy,
} from '@scorely/api/src/modules/competition/season.repository';
import { createSeasonService } from '@scorely/api/src/modules/competition/season.service';
import type { TrophyRepository } from '@scorely/api/src/modules/competition/trophy.repository';
import { createTrophyService } from '@scorely/api/src/modules/competition/trophy.service';
import type {
  AttendanceRecord,
  GameRecord,
  GameRepository,
} from '@scorely/api/src/modules/groups/game.repository';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import type { NotificationRepository } from '@scorely/api/src/modules/notifications/notification.repository';
import { createNotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import type { StoredTeams, TeamsRepository } from '@scorely/api/src/modules/teams/teams.repository';
import type { UserRecord } from '@scorely/api/src/modules/users/user.repository';
import {
  COMPETITION_MATCH_LIMIT,
  type CompetitionRules,
  type MatchInput,
  type MemberTier,
  type PublicUserId,
  PublicUserIdSchema,
  type RoleId,
  type Season,
  type SeasonInput,
  SeasonSchema,
  TrophySchema,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

/** ADR 0016: o que o banco faz na gravação condicionada pela versão (o repositório lança o mesmo erro). */
function expectVersionIn(current: number, expected: number): void {
  if (current !== expected) throw appError('VERSION_CONFLICT', { currentVersion: current });
}

// Competição, etapa 6 (`.claude/work/competicao-6.md`, D3–D6, D8): os troféus e os avisos ao travar a temporada
// (CMP-36, 38, 39), onde os troféus aparecem (CMP-37) e a rotina diária (CMP-39).
// - `saveFinal(id, final, trophies?)`: o final e os troféus numa transação; quem ganhou a corrida se sabe relendo
//   (`final.token` igual ao seu). O repositório em memória faz o mesmo: grava só se não há final.
// - `RankingDeps`, `ResultDeps` e `MatchDeps` ganham `notifications?` (e o ranking, `trophies?`).
// - `createTrophyService({ trophies, groups, seasons })` com `mine(userId)`.
// - `createSeasonLockJob({ groups, competitions, seasons, results, matches, users, notifications, locks, now })` com
//   `run()` (quantas travou); `locks.due(nowIso)` dá as temporadas com o prazo vencido e sem final.

const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const OWNER = asUserId('11111111-1111-4111-8111-111111111111');
const A = asUserId('22222222-2222-4222-8222-222222222222');
const B = asUserId('33333333-3333-4333-8333-333333333333');
const C = asUserId('44444444-4444-4444-8444-444444444444');
const D = asUserId('55555555-5555-4555-8555-555555555555');
const R = asUserId('88888888-8888-4888-8888-888888888888');

const PEOPLE: UserId[] = [OWNER, A, B, C, D, R];
const NAMES: Record<string, string> = {
  [OWNER]: 'Dono',
  [A]: 'Ana',
  [B]: 'Beatriz',
  [C]: 'Caio',
  [D]: 'Davi',
  [R]: 'Rafa',
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

/** Um instante em São Paulo (UTC − 3). */
const sp = (date: string, time: string) => new Date(`${date}T${time}:00.000-03:00`);

const OCT26 = sp('2026-10-26', '09:00');
/** S1 aberta; os jogos de 30/10 e 06/11 já aconteceram. */
const NOV07 = sp('2026-11-07', '12:00');
/** S1 terminou em 08/11: está no prazo (até o fim de 11/11). */
const IN_GRACE = sp('2026-11-10', '12:00');
/** S1 já passou do prazo. */
const NOW = sp('2026-11-13', '20:30');
const NOV21 = sp('2026-11-21', '12:00');

const OCT30 = '2026-10-30';
const NOV06 = '2026-11-06';
const NOV13 = '2026-11-13';

const S1: SeasonInput = { name: 'Primavera', startDate: '2026-10-26', endDate: '2026-11-08' };
const S_LONG: SeasonInput = { name: 'Novembro', startDate: '2026-10-26', endDate: '2026-11-30' };

const RULES_SEASON: CompetitionRules = {
  points: { win: 3, draw: 2, loss: 1, notConfirmed: 0, noShow: -2, cancelled: 0 },
  unit: 'day',
  tiebreak: ['attendance', 'streak'],
};
const RULES_NEW: CompetitionRules = {
  points: { win: 5, draw: 1, loss: 0, notConfirmed: -1, noShow: -3, cancelled: 2 },
  unit: 'day',
  tiebreak: [],
};

const gameId = (date: string) => `f0000000-0000-4000-8000-0000${date.replaceAll('-', '')}`;

const LISTS: Record<string, UserId[]> = {
  [OCT30]: [OWNER, A, B],
  [NOV06]: [OWNER, A, B, C],
  [NOV13]: [OWNER, A, B],
};

function fakeGame(date: string, list: UserId[]): { record: GameRecord; list: UserId[] } {
  return {
    record: { id: gameId(date), createdAt: `${date}T00:00:00.000Z`, groupId: GROUP_ID, date },
    list,
  };
}

function publishedTeams(date: string, teams: string[][]): StoredTeams {
  return {
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

const unused = () => Promise.reject(new Error('not used by the awards'));

/** Uma notificação enviada: quem recebe (id do sistema), o tipo, o texto e o link. */
interface Sent {
  userId: UserId;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

function setup(opts: { competition?: Partial<StoredCompetition>; results?: StoredGameResult[] } = {}) {
  const clock = { now: OCT26 };
  const state = {
    group: {
      id: GROUP_ID,
      createdAt: '2026-01-01T00:00:00.000Z',
      name: 'Vôlei de sexta',
      sportId: 'volleyball',
      weekday: 5,
      time: '19:00',
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
    } as Record<string, StoredTeams>,
    competition: {
      groupId: GROUP_ID,
      plan: 'trial',
      activeUntil: '2027-06-01T00:00:00.000Z',
      trialStartedAt: '2026-10-25T00:00:00.000Z',
      rules: RULES_SEASON,
      createdAt: '2026-10-25T00:00:00.000Z',
      updatedAt: '2026-10-25T00:00:00.000Z',
      ...opts.competition,
    } as StoredCompetition,
    /** Na próxima gravação do final, outro escritor já gravou antes (a corrida perdida). */
    loseFinalRace: false,
  };
  const resultStore = new Map<string, StoredGameResult>(
    (opts.results ?? []).map((r) => [r.gameId, structuredClone(r)]),
  );
  const matchStore: StoredMatch[] = [];
  const seasonStore = new Map<string, StoredSeason>();
  /** Os troféus gravados (na mesma transação do final), na ordem de gravação. */
  const trophyStore: StoredTrophy[] = [];
  /** Cada gravação do final que valeu, com os troféus que foram juntos. */
  const finalWrites: { id: string; trophies: StoredTrophy[] }[] = [];
  /** O lookup das temporadas abertas (`LOOKUP#SEASON#OPEN`): id → fim do prazo. Sai ao travar. */
  const openLocks = new Map<string, string>();
  const sent: Sent[] = [];

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
    removeMember: unused,
  };

  const findGame = (id: string) => Object.values(state.games).find((g) => g.record.id === id);
  const games: GameRepository = {
    findByDate: async (groupId, date) =>
      groupId === state.group.id ? structuredClone(state.games[date]?.record) : undefined,
    listAttendance: async (id) =>
      (findGame(id)?.list ?? []).map(
        (userId, i): AttendanceRecord => ({
          id: `a${i}-${id}`,
          createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
          gameId: id,
          userId,
          confirmedAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
        }),
      ),
    create: unused,
    cancel: unused,
    reopen: unused,
    updateSettings: unused,
    markMinReached: unused,
    getAttendance: unused,
    addAttendance: unused,
    removeAttendance: unused,
  };

  const teams: TeamsRepository = {
    get: async (groupId, date) => (groupId === GROUP_ID ? structuredClone(state.teams[date]) : undefined),
    put: unused,
    delete: unused,
  };

  const competitions: CompetitionRepository = {
    get: async (groupId) => (groupId === GROUP_ID ? structuredClone(state.competition) : undefined),
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
      seasonStore.set(s.id, { ...structuredClone(s), version: 1 });
    },
    /** CMP-42: editar e cancelar a temporada gravam só com a versão atual dela. */
    update: async (id, patch, _oldStartDate, expectedVersion) => {
      const item = seasonStore.get(id);
      expectVersionIn(item?.version ?? 0, expectedVersion);
      if (!item) throw new Error('update without season');
      seasonStore.set(id, { ...item, ...structuredClone(patch), version: item.version + 1 });
    },
    delete: async (s, expectedVersion) => {
      expectVersionIn(seasonStore.get(s.id)?.version ?? 0, expectedVersion);
      seasonStore.delete(s.id);
    },
    saveFinal: async (id, final, trophies) => {
      const item = seasonStore.get(id);
      if (!item) throw new Error('saveFinal without season');
      if (state.loseFinalRace) {
        // Outro escritor travou antes: o final dele (com outro token) é o que fica.
        state.loseFinalRace = false;
        seasonStore.set(id, { ...item, final: { ...structuredClone(final), token: 'someone-else' } });
        openLocks.delete(id);
        return;
      }
      // `attribute_not_exists(final)`: o primeiro que trava vale, e os troféus vão na mesma transação.
      if (item.final !== undefined) return;
      seasonStore.set(id, { ...item, final: structuredClone(final) });
      trophyStore.push(...structuredClone(trophies ?? []));
      finalWrites.push({ id, trophies: structuredClone(trophies ?? []) });
      openLocks.delete(id);
    },
  };

  const trophies: TrophyRepository = {
    // Na ordem de gravação (a mais antiga primeiro): a ordem da sala de troféus é do service.
    listByUser: async (userId) =>
      trophyStore.filter((t) => t.userId === userId).map((t) => structuredClone(t)),
  };

  const dueCalls: string[] = [];
  const locks: SeasonLockRepository = {
    due: async (nowIso) => {
      dueCalls.push(nowIso);
      return [...openLocks.entries()].filter(([, until]) => until < nowIso).map(([id]) => id);
    },
  };

  const notificationRepo: NotificationRepository = {
    create: async (n) => {
      sent.push({
        userId: n.userId,
        type: n.type,
        title: n.title,
        ...(n.body === undefined ? {} : { body: n.body }),
        ...(n.link === undefined ? {} : { link: n.link }),
      });
    },
    get: unused,
    list: unused,
    unreadCount: unused,
    markRead: unused,
    remove: unused,
  };
  const now = () => clock.now;
  const notifications = createNotificationService(notificationRepo, now);

  const record = (id: UserId): UserRecord => ({
    id,
    publicId: pub(id),
    nickname: NAMES[id] ?? pub(id),
    createdAt: '2026-01-01T00:00:00.000Z',
    version: 1,
  });
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
    notifications,
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
    notifications,
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
    notifications,
    trophies,
    now,
  });
  const trophyService = createTrophyService({ trophies, groups, seasons });
  const job = createSeasonLockJob({
    groups,
    competitions,
    seasons,
    results,
    matches,
    users,
    notifications,
    locks,
    now,
  });
  return {
    clock,
    state,
    resultStore,
    matchStore,
    seasonStore,
    trophyStore,
    finalWrites,
    openLocks,
    dueCalls,
    sent,
    service,
    results: resultService,
    matches: matchService,
    ranking: rankingService,
    trophies: trophyService,
    job,
    /** CMP-42: a versão que a tela mostrou (`0` = não existe). */
    rv: (date: string) => ({ version: resultStore.get(gameId(date))?.version ?? 0 }),
    mv: (id: string) => ({ version: matchStore.find((m) => m.id === id)?.version ?? 0 }),
  };
}

type T = ReturnType<typeof setup>;

/** Cria a temporada pelo dono no instante `at`, registra o fim do prazo no lookup das abertas e deixa o relógio lá. */
async function open(t: T, at: Date, input: SeasonInput): Promise<Season> {
  t.clock.now = at;
  const season = await t.service.create(OWNER, GROUP_ID, input);
  t.openLocks.set(season.id, season.graceUntil);
  return season;
}

/** Fecha (ou corrige) o jogo com todos da lista presentes; `winner` só no modo pelo dia. */
function closeGame(t: T, date: string, winner?: 0 | 1) {
  const attendance = Object.fromEntries((LISTS[date] ?? []).map((id) => [pub(id), 'present' as const]));
  return t.results.close(OWNER, GROUP_ID, date, {
    ...t.rv(date),
    attendance,
    friendly: false,
    ...(winner === undefined ? {} : { winner }),
  });
}

const matchInput = (a: UserId[], b: UserId[], winner: 0 | 1 = 0): MatchInput => ({
  teams: [a.map(pub), b.map(pub)] as MatchInput['teams'],
  winner,
});

// Fechamentos gravados direto, com uma cópia própria: V 3, E 1, D 0, sem desempate.
const COPY: CompetitionRules = {
  points: { win: 3, draw: 1, loss: 0, notConfirmed: 0, noShow: -2, cancelled: 0 },
  unit: 'day',
  tiebreak: [],
};

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
    list: list.map((id) => ({ id, inside: true })),
    attendance: Object.fromEntries(list.map((id) => [id, 'present' as const])),
    teams,
    winner: 0,
    createdAt: `${date}T23:00:00.000Z`,
    updatedAt: `${date}T23:00:00.000Z`,
    version: 1,
  };
}

/**
 * Na temporada S1: 30/10 (Ana vence Dono e Beatriz) e 06/11 (Caio vence Ana). Fora dela: 13/11 (Dono vence Beatriz).
 * Final de S1 (desempate "mais presente"): Ana 1º (3, 2 presenças, sequência 2), Caio 2º (3, 1), Dono e Beatriz
 * 3º (0, 1), Davi 5º (0, 0).
 */
const RANKED = [
  stored(OCT30, [OWNER, A, B], [[A], [OWNER, B]]),
  stored(NOV06, [A, C], [[C], [A]]),
  stored(NOV13, [OWNER, B], [[OWNER], [B]]),
];

async function rankedSeason() {
  const t = setup({ results: RANKED, competition: { rules: { ...RULES_SEASON, tiebreak: ['attendance'] } } });
  const season = await open(t, OCT26, S1);
  t.state.competition.rules = RULES_NEW;
  return { t, season };
}

const key = (x: { userId: string; kind: string }) => `${x.kind}:${x.userId}`;
const textOf = (n: Sent) => [n.title, n.body ?? ''].join(' ');
const ofType = (t: T, type: string) => t.sent.filter((n) => n.type === type);
const COMPETITION_LINK = `/groups/${GROUP_ID}/competition`;

/** Os troféus esperados do final de S1. */
const S1_TROPHIES = [
  `champion:${A}`,
  `second:${C}`,
  `third:${OWNER}`,
  `third:${B}`,
  `attendance:${A}`,
  `streak:${A}`,
].sort();

// ---------------------------------------------------------------------------------------------

describe('os troféus ao travar (CMP-36)', () => {
  it('CMP-36: ao travar, o final grava junto o pódio (com os empatados) e os destaques', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOW;
    await t.ranking.ranking(B, GROUP_ID, undefined, season.id);

    expect(t.finalWrites.length).toBe(1);
    const written = t.finalWrites[0]?.trophies ?? [];
    expect(written.map(key).sort()).toEqual(S1_TROPHIES);
    for (const trophy of written) {
      expect(trophy).toMatchObject({ seasonId: season.id, groupId: GROUP_ID });
      expect(Number.isNaN(Date.parse(trophy.awardedAt))).toBe(false);
    }
  });

  it('CMP-36: só quem está no ranking final recebe: a reserva, mesmo presente, não', async () => {
    const t = setup({ results: [stored(OCT30, [OWNER, A, R], [[R], [OWNER, A]])] });
    const season = await open(t, OCT26, S1);
    t.clock.now = NOW;
    await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    expect(t.trophyStore.some((x) => x.userId === R)).toBe(false);
  });

  it('CMP-36: temporada sem nenhum jogo fechado não entrega troféus', async () => {
    const t = setup();
    const season = await open(t, OCT26, S1);
    t.clock.now = NOW;
    const res = await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    expect(res.final).toBe(true);
    expect(t.trophyStore).toEqual([]);
  });

  it('CMP-36: "Encerrar agora" também entrega os troféus, na hora', async () => {
    const t = setup();
    const season = await open(t, OCT26, S_LONG);
    t.clock.now = NOV07;
    // Dono vence Ana e Beatriz.
    await closeGame(t, OCT30, 0);

    t.clock.now = NOW;
    await t.service.close(A, GROUP_ID, season.id);
    expect(t.trophyStore.map(key)).toContain(`champion:${OWNER}`);
    expect(t.trophyStore.every((x) => x.seasonId === season.id)).toBe(true);
  });
});

describe('uma vez só (CMP-39)', () => {
  it('CMP-39: ler de novo a temporada travada não grava troféu nem avisa outra vez', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOW;
    await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    const sentAfterLock = t.sent.length;
    await t.ranking.ranking(A, GROUP_ID, undefined, season.id);
    await t.service.list(B, GROUP_ID);

    expect(t.finalWrites.length).toBe(1);
    expect(t.trophyStore.map(key).sort()).toEqual(S1_TROPHIES);
    expect(t.sent.length).toBe(sentAfterLock);
  });

  it('CMP-39: quem perdeu a corrida para gravar o final não avisa ninguém', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOW;
    t.state.loseFinalRace = true;
    await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    expect(t.sent).toEqual([]);
    expect(t.finalWrites).toEqual([]);
  });

  it('CMP-39: no prazo ainda não trava: nem troféu, nem aviso', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = IN_GRACE;
    await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    expect(t.finalWrites).toEqual([]);
    expect(t.sent).toEqual([]);
  });
});

describe('os avisos ao travar (CMP-38)', () => {
  it('CMP-38: temporada encerrada: cada pessoa do ranking final é avisada da posição, com o link da aba Competição', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOW;
    await t.ranking.ranking(B, GROUP_ID, undefined, season.id);

    const closed = ofType(t, 'season_closed');
    expect(closed.map((n) => n.userId).sort()).toEqual([OWNER, A, B, C, D].sort());
    for (const n of closed) {
      expect(n.link).toBe(COMPETITION_LINK);
      expect(textOf(n)).toContain('Primavera terminou');
    }
    const to = (id: UserId) => textOf(closed.find((n) => n.userId === id) as Sent);
    expect(to(A)).toContain('campeão');
    expect(to(C)).toContain('2º');
    expect(to(OWNER)).toContain('3º');
    expect(to(D)).toContain('5º');
  });

  it('CMP-38: troféu: quem levou um destaque é avisado, uma vez por destaque, com o link do perfil', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOW;
    await t.ranking.ranking(B, GROUP_ID, undefined, season.id);

    const awarded = ofType(t, 'trophy_awarded');
    // Ana é a mais presente e tem a maior sequência; ninguém mais leva destaque.
    expect(awarded.map((n) => n.userId)).toEqual([A, A]);
    for (const n of awarded) expect(n.link).toBe('/profile');
    expect(awarded.some((n) => textOf(n).includes('mais presente de Primavera'))).toBe(true);
  });

  it('CMP-38: ninguém de fora do ranking final (a reserva) é avisado', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOW;
    await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    expect(t.sent.some((n) => n.userId === R)).toBe(false);
  });
});

describe('entrou no pódio (CMP-38)', () => {
  it('CMP-38: fechar um jogo que põe alguém nas 3 primeiras avisa só quem entrou', async () => {
    // Antes: Ana 1º, Dono e Beatriz 2º, Caio e Davi 4º. Depois de 06/11 (Beatriz e Caio vencem):
    // Ana 1º, Beatriz 2º, Caio 3º, Dono 4º, Davi 5º.
    const t = setup({ results: [RANKED[0] as StoredGameResult] });
    await open(t, OCT26, S1);
    t.clock.now = NOV07;
    await closeGame(t, NOV06, 1);

    const entered = ofType(t, 'podium_entered');
    expect(entered.map((n) => n.userId)).toEqual([C]);
    expect(textOf(entered[0] as Sent)).toContain('Você entrou no pódio de Primavera: 3º');
    expect(entered[0]?.link).toBe(COMPETITION_LINK);
  });

  it('CMP-38: corrigir sem mudar quem está no top 3 não avisa ninguém; corrigir pondo alguém dentro, avisa', async () => {
    const t = setup({ results: [RANKED[0] as StoredGameResult] });
    await open(t, OCT26, S1);
    t.clock.now = NOV07;
    await closeGame(t, NOV06, 1);
    const afterClose = t.sent.length;

    await closeGame(t, NOV06, 1);
    expect(t.sent.length).toBe(afterClose);

    // Agora Dono e Ana vencem: Ana 1º, Dono 2º, Beatriz 3º, Caio 4º. Só o Dono entrou.
    await closeGame(t, NOV06, 0);
    expect(ofType(t, 'podium_entered').map((n) => n.userId)).toEqual([C, OWNER]);
  });

  it('CMP-38: só com a temporada aberta: no prazo, ninguém é avisado', async () => {
    const t = setup({ results: [RANKED[0] as StoredGameResult] });
    await open(t, OCT26, S1);
    t.clock.now = IN_GRACE;
    await closeGame(t, NOV06, 1);
    expect(ofType(t, 'podium_entered')).toEqual([]);
  });

  it('CMP-38: jogo fora de temporada não avisa ninguém', async () => {
    const t = setup({ results: [RANKED[0] as StoredGameResult] });
    t.clock.now = NOV07;
    await closeGame(t, NOV06, 1);
    expect(t.sent).toEqual([]);
  });

  it('CMP-38: registrar uma partida que põe alguém no pódio avisa quem entrou; mudar sem entrar ninguém, não', async () => {
    const t = setup({
      results: [RANKED[0] as StoredGameResult],
      competition: { rules: { ...RULES_SEASON, unit: 'match' } },
    });
    await open(t, OCT26, S1);
    t.clock.now = NOV07;
    // Fechado sem partidas: Ana 1º, Dono e Beatriz 2º, Caio 4º. Ninguém entrou.
    await closeGame(t, NOV06);
    expect(ofType(t, 'podium_entered')).toEqual([]);

    // Caio vence o Dono: Ana 1º, Caio 2º, Dono 3º, Beatriz 4º.
    const detail = await t.matches.create(OWNER, GROUP_ID, NOV06, matchInput([C], [OWNER]));
    expect(ofType(t, 'podium_entered').map((n) => n.userId)).toEqual([C]);
    expect(textOf(ofType(t, 'podium_entered')[0] as Sent)).toContain('Primavera');

    // O Dono vence: Ana e Dono 1º, Caio 3º. Quem está no top 3 continua o mesmo.
    const matchId = detail.matches[0]?.id ?? '';
    await t.matches.update(OWNER, GROUP_ID, NOV06, matchId, {
      ...matchInput([C], [OWNER], 1),
      ...t.mv(matchId),
    });
    expect(ofType(t, 'podium_entered').map((n) => n.userId)).toEqual([C]);
  });
});

describe('onde os troféus aparecem (CMP-37)', () => {
  it('CMP-37: a sala de troféus (`mine`) traz os troféus da pessoa com o grupo e a temporada', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOW;
    await t.ranking.ranking(B, GROUP_ID, undefined, season.id);

    const mine = await t.trophies.mine(A);
    for (const trophy of mine) expect(TrophySchema.parse(trophy)).toEqual(trophy);
    expect(mine.map((x) => x.kind).sort()).toEqual(['attendance', 'champion', 'streak']);
    for (const trophy of mine) {
      expect(trophy).toMatchObject({
        groupId: GROUP_ID,
        groupName: 'Vôlei de sexta',
        seasonId: season.id,
        seasonName: 'Primavera',
        seasonNumber: 1,
      });
    }
    expect(await t.trophies.mine(D)).toEqual([]);
  });

  it('CMP-37: a sala de troféus vem do mais recente para o mais antigo, de todas as temporadas', async () => {
    const { t, season } = await rankedSeason();
    // S2 com o jogo de 13/11 (Dono vence Beatriz), travada pela leitura em 21/11. S1 trava antes, em 13/11.
    const s2 = await open(t, IN_GRACE, { name: 'Novembro', startDate: '2026-11-10', endDate: '2026-11-17' });
    t.clock.now = NOW;
    await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    t.clock.now = NOV21;
    await t.ranking.ranking(B, GROUP_ID, undefined, s2.id);

    const mine = await t.trophies.mine(OWNER);
    expect(mine[0]?.seasonId).toBe(s2.id);
    expect(mine.at(-1)).toMatchObject({ seasonId: season.id, kind: 'third' });
    const times = mine.map((x) => Date.parse(x.awardedAt));
    expect(times).toEqual([...times].sort((x, y) => y - x));
  });

  it('CMP-36: o troféu fica para sempre: sair do grupo ou o grupo arquivar não tira', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOW;
    await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    delete t.state.roster[A];
    t.state.group = { ...t.state.group, archivedAt: '2026-11-14T00:00:00.000Z' };
    t.state.competition.activeUntil = '2026-11-14T00:00:00.000Z';
    t.clock.now = NOV21;

    expect((await t.trophies.mine(A)).length).toBe(3);
  });

  it('CMP-37: o histórico da pessoa no grupo traz os troféus dela daquele grupo', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOW;
    await t.ranking.ranking(B, GROUP_ID, undefined, season.id);

    const history = await t.ranking.person(B, GROUP_ID, pub(A));
    expect(history.trophies.map((x) => x.kind).sort()).toEqual(['attendance', 'champion', 'streak']);
    for (const trophy of history.trophies) {
      expect(TrophySchema.parse(trophy)).toEqual(trophy);
      expect(trophy).toMatchObject({ groupId: GROUP_ID, seasonId: season.id, seasonName: 'Primavera' });
    }
    expect((await t.ranking.person(B, GROUP_ID, pub(D))).trophies).toEqual([]);
  });

  it('CMP-37: a lista das temporadas traz, nas encerradas, o pódio e os destaques', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOV07;
    const openList = await t.service.list(B, GROUP_ID);
    expect(openList.find((s) => s.id === season.id)?.highlights).toBeUndefined();

    t.clock.now = NOW;
    const list = await t.service.list(B, GROUP_ID);
    const closed = list.find((s) => s.id === season.id);
    expect(closed && SeasonSchema.parse(closed)).toEqual(closed);
    const ids = (kind: 'attendance' | 'streak') =>
      (closed?.highlights ?? []).find((h) => h.kind === kind)?.rows.map((r) => r.userId);
    expect(ids('attendance')).toEqual([pub(A)]);
    expect(ids('streak')).toEqual([pub(A)]);
    expect(closed?.podium?.length).toBe(4);
  });
});

describe('a rotina diária (CMP-39)', () => {
  it('CMP-39: a rotina trava a temporada com o prazo vencido, grava os troféus e avisa', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOW;
    expect(await t.job.run()).toBe(1);
    expect(t.dueCalls).toEqual([NOW.toISOString()]);

    expect(t.seasonStore.get(season.id)?.final).toBeDefined();
    expect(t.trophyStore.map(key).sort()).toEqual(S1_TROPHIES);
    expect(ofType(t, 'season_closed').length).toBe(5);
    expect(ofType(t, 'trophy_awarded').length).toBe(2);
  });

  it('CMP-39: rodar de novo não faz nada', async () => {
    const { t } = await rankedSeason();
    t.clock.now = NOW;
    await t.job.run();
    const sent = t.sent.length;
    expect(await t.job.run()).toBe(0);
    expect(t.sent.length).toBe(sent);
    expect(t.finalWrites.length).toBe(1);
  });

  it('CMP-39: a temporada ainda no prazo não é travada pela rotina', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = IN_GRACE;
    expect(await t.job.run()).toBe(0);
    expect(t.seasonStore.get(season.id)?.final).toBeUndefined();
    expect(t.sent).toEqual([]);
  });

  it('CMP-39: a rotina depois da primeira leitura (que já travou) não avisa de novo', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOW;
    await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    const sent = t.sent.length;
    // O lookup ficou para trás (ex.: a leitura e a rotina ao mesmo tempo).
    t.openLocks.set(season.id, '2026-11-12T03:00:00.000Z');

    expect(await t.job.run()).toBe(0);
    expect(t.sent.length).toBe(sent);
    expect(t.finalWrites.length).toBe(1);
  });

  it('CMP-39: a leitura depois da rotina não avisa de novo', async () => {
    const { t, season } = await rankedSeason();
    t.clock.now = NOW;
    await t.job.run();
    const sent = t.sent.length;
    await t.ranking.ranking(B, GROUP_ID, undefined, season.id);
    expect(t.sent.length).toBe(sent);
  });
});
