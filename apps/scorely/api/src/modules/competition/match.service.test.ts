import { AppError, appError } from '@scorely/api/src/lib/errors';
import { asUserId, type UserId } from '@scorely/api/src/lib/ids';
import type {
  CompetitionRepository,
  StoredCompetition,
} from '@scorely/api/src/modules/competition/competition.repository';
import type { MatchRepository, StoredMatch } from '@scorely/api/src/modules/competition/match.repository';
import { createMatchService } from '@scorely/api/src/modules/competition/match.service';
import type {
  ResultRepository,
  StoredGameResult,
} from '@scorely/api/src/modules/competition/result.repository';
import { createResultService } from '@scorely/api/src/modules/competition/result.service';
import type {
  GameRecord,
  GameRepository,
  PlayerRecord,
} from '@scorely/api/src/modules/groups/game.repository';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import type { StoredTeams, TeamsRepository } from '@scorely/api/src/modules/teams/teams.repository';
import type { UserRecord } from '@scorely/api/src/modules/users/user.repository';
import {
  type AttendanceMark,
  COMPETITION_MATCH_LIMIT,
  type CompetitionGameDetail,
  CompetitionGameDetailSchema,
  type CompetitionRules,
  type ErrorCode,
  type MatchInput,
  MatchInputSchema,
  type MatchWinner,
  type MemberTier,
  type PublicUserId,
  PublicUserIdSchema,
  type RoleId,
  UpdateMatchInputSchema,
  VersionInputSchema,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

/** ADR 0016: o que o banco faz na gravação condicionada pela versão (o repositório lança o mesmo erro). */
function expectVersionIn(current: number, expected: number): void {
  if (current !== expected) throw appError('VERSION_CONFLICT', { currentVersion: current });
}

// Competição, etapa 3 (`.claude/work/competicao-3.md`): as partidas, na unidade por partida (CMP-19–22), e o que muda
// no fechamento (CMP-12, 14, 21). Interfaces de D8: `createMatchService({ groups, games, teams, competitions, results,
// matches, users, now, detail })` com `create`, `update` e `remove`, todos devolvendo o `CompetitionGameDetail`; o
// `detail` é o `get` do serviço de resultados, que ganha `matches` nas dependências. A entrada e a resposta vão pelo
// id público (ou o do avulso); o que é gravado (`StoredMatch`) fica com os ids do sistema.

const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GROUP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// Membros
const OWNER = asUserId('11111111-1111-4111-8111-111111111111');
/** Membro com o cargo Admin: quem fecha. */
const A = asUserId('22222222-2222-4222-8222-222222222222');
/** Membro sem cargo, na fila. */
const B = asUserId('33333333-3333-4333-8333-333333333333');
/** Membro que não confirmou. */
const C = asUserId('44444444-4444-4444-8444-444444444444');
/** Membro dentro que falta. */
const D = asUserId('55555555-5555-4555-8555-555555555555');
/** Membro na fila que falta. */
const E = asUserId('77777777-7777-4777-8777-777777777777');
/** Reserva, dentro. */
const R = asUserId('88888888-8888-4888-8888-888888888888');
/** Convidado dentro. */
const G = asUserId('99999999-9999-4999-8999-999999999999');
/** Convidado na fila. */
const H = asUserId('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
const OUTSIDER = asUserId('66666666-6666-4666-8666-666666666666');
/** Avulso (TIM-24) dos times publicados de 13/11. */
const X = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
/** Um id de avulso que não está em time nenhum. */
const UNKNOWN_EXTRA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const PEOPLE: UserId[] = [OWNER, A, B, C, D, E, R, G, H, OUTSIDER];
const NAMES: Record<string, string> = {
  [OWNER]: 'Dono',
  [A]: 'Ana',
  [B]: 'Beatriz',
  [C]: 'Caio',
  [D]: 'Davi',
  [E]: 'Edu',
  [R]: 'Rafa',
  [G]: 'Gabi',
  [H]: 'Heitor',
  [OUTSIDER]: 'Fora',
};

const pub = (id: UserId): PublicUserId =>
  PublicUserIdSchema.parse(`${id.slice(0, 4)}${id.slice(-4)}`.toUpperCase());
/** O id na resposta: o público, ou o do avulso. */
const out = (id: string) => (PEOPLE.includes(id as UserId) ? pub(id as UserId) : id);

const ROSTER: Record<string, MemberTier> = {
  [OWNER]: 'member',
  [A]: 'member',
  [B]: 'member',
  [C]: 'member',
  [D]: 'member',
  [E]: 'member',
  [R]: 'reserve',
};

/** Sexta 13/11, 20:30 em São Paulo: o jogo das 19h está em andamento. */
const NOW = new Date('2026-11-13T23:30:00.000Z');
const LATER = new Date('2026-11-14T10:00:00.000Z');
const ARCHIVED = { archivedAt: '2026-11-14T00:00:00.000Z' };

const NOV13 = '2026-11-13';
const NOV06 = '2026-11-06';
const OCT30 = '2026-10-30';
const OCT23 = '2026-10-23';
const NOV20 = '2026-11-20';
const THURSDAY = '2026-11-12';

const MATCH_RULES: CompetitionRules = {
  points: { win: 5, draw: 2, loss: 1, notConfirmed: -1, noShow: -3, cancelled: 4 },
  unit: 'match',
  tiebreak: ['attendance'],
};
const DAY_RULES: CompetitionRules = { ...MATCH_RULES, unit: 'day' };

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

function storedGroup(extra: Partial<StoredGroup> = {}): StoredGroup {
  return {
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
    version: 1,
    settingsVersion: 1,
    ...extra,
  };
}

function storedCompetition(extra: Partial<StoredCompetition> = {}): StoredCompetition {
  return {
    groupId: GROUP_ID,
    plan: 'trial',
    activeUntil: '2026-11-24T00:00:00.000Z',
    trialStartedAt: '2026-10-25T00:00:00.000Z',
    rules: MATCH_RULES,
    createdAt: '2026-10-25T00:00:00.000Z',
    updatedAt: '2026-10-25T00:00:00.000Z',
    version: 1,
    ...extra,
  };
}

interface FakeGame {
  record: GameRecord;
  list: UserId[];
}

function fakeGame(date: string, list: UserId[], extra: Partial<GameRecord> = {}): FakeGame {
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
      ...extra,
    },
    list,
  };
}

/** Dentro (5 vagas): Dono, Ana, Rafa (reserva), Gabi (convidada), Davi. Fila: Beatriz, Heitor (convidado), Edu. */
const LIST_NOV13 = [OWNER, A, R, G, D, B, H, E];

function defaultGames(): Record<string, FakeGame> {
  return {
    [OCT23]: fakeGame(OCT23, [OWNER, A]),
    [OCT30]: fakeGame(OCT30, [OWNER, A, B], { cancelledAt: '2026-10-29T12:00:00.000Z' }),
    [NOV06]: fakeGame(NOV06, [OWNER, A, R]),
    [NOV13]: fakeGame(NOV13, LIST_NOV13),
    [NOV20]: fakeGame(NOV20, [OWNER, A]),
  };
}

function publishedTeams(date: string, teams: string[][], extra: Partial<StoredTeams> = {}): StoredTeams {
  return {
    gameId: gameId(date),
    groupId: GROUP_ID,
    date,
    status: 'published',
    teams,
    positions: {},
    publishedAt: `${date}T21:00:00.000Z`,
    extras: [{ id: X, name: 'Avulso', positions: [] }],
    createdAt: `${date}T20:00:00.000Z`,
    updatedAt: `${date}T21:00:00.000Z`,
    version: 1,
    ...extra,
  };
}

/** Time 1: Dono, Rafa e o avulso. Time 2: Ana e Gabi. */
const TEAMS_NOV13 = [
  [OWNER, R, X],
  [A, G],
];

const unused = () => Promise.reject(new Error('not used by the competition matches'));

function setup(
  opts: {
    group?: Partial<StoredGroup>;
    competition?: Partial<StoredCompetition> | null;
    games?: Record<string, FakeGame>;
    teams?: Record<string, StoredTeams>;
  } = {},
) {
  const clock = { now: NOW };
  const state = {
    group: storedGroup(opts.group),
    roster: { ...ROSTER } as Record<string, MemberTier>,
    staff: { [A]: 'admin' } as Record<string, RoleId>,
    games: opts.games ?? defaultGames(),
    teams: opts.teams ?? { [NOV13]: publishedTeams(NOV13, TEAMS_NOV13) },
    competition:
      opts.competition === null
        ? undefined
        : (storedCompetition(opts.competition ?? {}) as StoredCompetition),
  };
  const store = new Map<string, StoredGameResult>();
  const writes: { op: string; id: string }[] = [];
  /** As partidas, na ordem de registro. */
  const matchStore: StoredMatch[] = [];

  const groups: GroupRepository = {
    get: async (id) => (id === state.group.id ? state.group : undefined),
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
      const item = store.get(id);
      return item ? structuredClone(item) : undefined;
    },
    listByGroup: async (groupId) =>
      [...store.values()].filter((r) => r.groupId === groupId).map((r) => structuredClone(r)),
    /** CMP-42 (ADR 0016): o 1º fechamento manda 0; a correção, a versão atual (que soma 1). */
    create: async (item, expectedVersion) => {
      expectVersionIn(store.get(item.gameId)?.version ?? 0, expectedVersion);
      writes.push({ op: 'result_create', id: item.gameId });
      store.set(item.gameId, { ...structuredClone(item), version: 1 });
      return true;
    },
    update: async (id, patch, expectedVersion) => {
      const item = store.get(id);
      expectVersionIn(item?.version ?? 0, expectedVersion);
      if (!item) throw new Error('update without item');
      writes.push({ op: 'result_update', id });
      store.set(id, { ...item, ...structuredClone(patch), version: item.version + 1 });
    },
  };

  const matches: MatchRepository = {
    list: async (id) => matchStore.filter((m) => m.gameId === id).map((m) => structuredClone(m)),
    get: async (id) => {
      const item = matchStore.find((m) => m.id === id);
      return item ? structuredClone(item) : undefined;
    },
    create: async (m) => {
      if (matchStore.filter((x) => x.gameId === m.gameId).length >= COMPETITION_MATCH_LIMIT) {
        writes.push({ op: 'match_full', id: m.id });
        return 'full';
      }
      writes.push({ op: 'match_create', id: m.id });
      matchStore.push({ ...structuredClone(m), version: 1 });
      return 'created';
    },
    /** CMP-42 (ADR 0016): editar e apagar a partida gravam só com a versão atual dela. */
    update: async (id, patch, expectedVersion) => {
      const index = matchStore.findIndex((m) => m.id === id);
      const item = matchStore[index];
      expectVersionIn(item?.version ?? 0, expectedVersion);
      if (!item) throw new Error('update without match');
      writes.push({ op: 'match_update', id });
      matchStore.splice(index, 1, { ...item, ...structuredClone(patch), version: item.version + 1 });
    },
    delete: async (m, expectedVersion) => {
      const index = matchStore.findIndex((x) => x.id === m.id);
      expectVersionIn(matchStore[index]?.version ?? 0, expectedVersion);
      if (index < 0) throw new Error('delete without match');
      writes.push({ op: 'match_delete', id: m.id });
      matchStore.splice(index, 1);
    },
  };

  const users = {
    getMany: async (ids: readonly UserId[]): Promise<UserRecord[]> =>
      ids
        .filter((id) => PEOPLE.includes(id))
        .map((id) => ({
          id,
          publicId: pub(id),
          nickname: NAMES[id] ?? pub(id),
          createdAt: '2026-01-01T00:00:00.000Z',
          version: 1,
        })),
    // A entrada da partida chega pelo id público: quem resolve pode usar esta busca.
    getByPublicId: async (publicId: string): Promise<UserRecord | undefined> => {
      const id = PEOPLE.find((p) => pub(p) === publicId);
      return id
        ? {
            id,
            publicId: pub(id),
            nickname: NAMES[id] ?? pub(id),
            createdAt: '2026-01-01T00:00:00.000Z',
            version: 1,
          }
        : undefined;
    },
  };

  const now = () => clock.now;
  const resultService = createResultService({
    groups,
    games,
    teams,
    competitions,
    results,
    matches,
    users,
    now,
  });
  const service = createMatchService({
    groups,
    games,
    teams,
    competitions,
    results,
    matches,
    users,
    now,
    detail: (userId, groupId, date) => resultService.get(userId, groupId, date),
  });
  /** CMP-42: a versão que a tela mostrou: a da partida e a do fechamento (`0` = não existe). */
  const mv = (id: string) => ({ version: matchStore.find((m) => m.id === id)?.version ?? 0 });
  const rv = (date: string) => ({ version: store.get(gameId(date))?.version ?? 0 });
  return { clock, state, store, matchStore, writes, service, results: resultService, mv, rv };
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

/** A partida pelo id público (ou o do avulso). */
function match(a: string[], b: string[], winner: MatchWinner): MatchInput {
  return { teams: [a.map(out), b.map(out)] as MatchInput['teams'], winner };
}

const wire = (marks: Partial<Record<string, AttendanceMark>>) =>
  Object.fromEntries(Object.entries(marks).map(([id, mark]) => [out(id), mark])) as Record<
    string,
    AttendanceMark
  >;

/** Chamada completa de 13/11: Davi (dentro) e Edu (fila) faltaram; Beatriz e Heitor vieram da fila. */
const FULL_NOV13 = {
  [OWNER]: 'present',
  [A]: 'present',
  [R]: 'present',
  [G]: 'present',
  [D]: 'absent',
  [B]: 'present',
  [H]: 'present',
  [E]: 'absent',
} as const;

const personOf = (detail: CompetitionGameDetail, id: string) => detail.people.find((p) => p.id === out(id));
const leaksSystemId = (value: unknown) => PEOPLE.some((id) => JSON.stringify(value).includes(id));
const sorted = (list: readonly string[]) => [...list].sort();
const mutatingWrites = (t: ReturnType<typeof setup>) => t.writes.filter((w) => w.op.startsWith('match_'));

/**
 * As 3 partidas de referência de 13/11 (todos que jogam vieram na FULL_NOV13):
 * 1. Dono, Rafa, avulso × Ana, Gabi → Time A.
 * 2. Dono, Beatriz × Ana, Rafa → Time A.
 * 3. Ana, Gabi × Beatriz, Dono → empate.
 * Dono: 2 V · 1 E (5+5+2 = 12). Ana: 2 D · 1 E (1+1+2 = 4). Beatriz: 1 V · 1 E (5+2 = 7).
 */
const REFERENCE = [
  match([OWNER, R, X], [A, G], 0),
  match([OWNER, B], [A, R], 0),
  match([A, G], [B, OWNER], 'draw'),
];

async function registerReference(t: ReturnType<typeof setup>): Promise<CompetitionGameDetail> {
  const [first, second, third] = REFERENCE;
  if (!first || !second || !third) throw new Error('reference matches');
  await t.service.create(OWNER, GROUP_ID, gameId(NOV13), first);
  await t.service.create(OWNER, GROUP_ID, gameId(NOV13), second);
  return t.service.create(OWNER, GROUP_ID, gameId(NOV13), third);
}

// ---------------------------------------------------------------------------------------------

describe('quem registra e quando (CMP-19)', () => {
  it('CMP-19: o dono registra uma partida no jogo em andamento, sem o jogo fechado, e recebe o jogo com ela', async () => {
    const t = setup();
    const res = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER, R, X], [A, G], 0));

    expect(CompetitionGameDetailSchema.parse(res)).toEqual(res);
    expect(res).toMatchObject({ date: NOV13, closed: false, unit: 'match' });
    expect(res.matches).toEqual([
      {
        id: expect.any(String),
        number: 1,
        teams: [
          [pub(OWNER), pub(R), X],
          [pub(A), pub(G)],
        ],
        winner: 0,
        version: 1,
      },
    ]);
    expect(t.matchStore).toEqual([
      {
        id: res.matches[0]?.id,
        gameId: gameId(NOV13),
        groupId: GROUP_ID,
        teams: [
          [OWNER, R, X],
          [A, G],
        ],
        winner: 0,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        version: 1,
      },
    ]);
    // Registrar não fecha o jogo.
    expect(t.store.size).toBe(0);
    expect(leaksSystemId(res)).toBe(false);
  });

  it('CMP-19: membro e reserva com o cargo Admin (results.record) registram', async () => {
    const t = setup();
    t.state.staff[R] = 'admin';
    await t.service.create(A, GROUP_ID, gameId(NOV13), match([OWNER], [A], 1));
    const res = await t.service.create(R, GROUP_ID, gameId(NOV13), match([R], [G], 'draw'));
    expect(res.matches.map((m) => m.number)).toEqual([1, 2]);
  });

  it('CMP-19: membro e reserva sem cargo → GROUP_PERMISSION_DENIED (403) com permission = results.record, ao registrar, corrigir e apagar', async () => {
    const t = setup();
    const created = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0));
    const id = created.matches[0]?.id ?? '';
    for (const who of [B, R]) {
      for (const call of [
        () => t.service.create(who, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0)),
        () => t.service.update(who, GROUP_ID, gameId(NOV13), id, { ...match([OWNER], [A], 1), ...t.mv(id) }),
        () => t.service.remove(who, GROUP_ID, gameId(NOV13), id, t.mv(id)),
      ]) {
        const err = await expectAppError(call(), 'GROUP_PERMISSION_DENIED', 403);
        expect(err.details).toEqual({ permission: 'results.record' });
      }
    }
    expect(mutatingWrites(t)).toHaveLength(1);
  });

  it('CMP-19: jogo com a unidade pelo dia (regulamento de agora, jogo não fechado) → MATCH_INVALID (422) day_unit', async () => {
    const t = setup({ competition: { rules: DAY_RULES } });
    const err = await expectAppError(
      t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0)),
      'MATCH_INVALID',
      422,
    );
    expect(err.details).toMatchObject({ reason: 'day_unit' });
    expect(mutatingWrites(t)).toEqual([]);
  });

  it('CMP-19: jogo fechado vale a unidade da cópia: fechado por partida e o regulamento mudou para o dia → registra', async () => {
    const t = setup();
    await t.results.close(OWNER, GROUP_ID, gameId(NOV13), { ...t.rv(NOV13), attendance: wire(FULL_NOV13) });
    t.state.competition = storedCompetition({ rules: DAY_RULES });
    const res = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0));
    expect(res.unit).toBe('match');
    expect(res.matches).toHaveLength(1);
  });

  it('CMP-19: jogo fechado pelo dia e o regulamento mudou para por partida → MATCH_INVALID day_unit', async () => {
    const t = setup({ competition: { rules: DAY_RULES } });
    await t.results.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
    });
    t.state.competition = storedCompetition({ rules: MATCH_RULES });
    const err = await expectAppError(
      t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0)),
      'MATCH_INVALID',
      422,
    );
    expect(err.details).toMatchObject({ reason: 'day_unit' });
  });

  it('CMP-19: jogo cancelado → GAME_CANCELLED (409)', async () => {
    const t = setup();
    await expectAppError(
      t.service.create(OWNER, GROUP_ID, gameId(OCT30), match([OWNER], [A], 0)),
      'GAME_CANCELLED',
      409,
    );
    expect(mutatingWrites(t)).toEqual([]);
  });

  it('CMP-19: um jogo anterior, desde a ativação, recebe partidas depois', async () => {
    const t = setup();
    t.clock.now = new Date('2026-11-20T12:00:00.000Z');
    const res = await t.service.create(OWNER, GROUP_ID, gameId(NOV06), match([OWNER, R], [A], 1));
    expect(res).toMatchObject({ date: NOV06 });
    expect(res.matches).toHaveLength(1);
  });

  it('CMP-19: nas condições de fechar: não começou → GAME_NOT_STARTED; antes da ativação ou fora do dia → GAME_NOT_FOUND', async () => {
    const t = setup();
    await expectAppError(
      t.service.create(OWNER, GROUP_ID, gameId(NOV20), match([OWNER], [A], 0)),
      'GAME_NOT_STARTED',
      409,
    );
    for (const date of [OCT23, THURSDAY])
      await expectAppError(
        t.service.create(OWNER, GROUP_ID, gameId(date), match([OWNER], [A], 0)),
        'GAME_NOT_FOUND',
        404,
      );
    expect(mutatingWrites(t)).toEqual([]);
  });

  it('CMP-19: competição desativada ou vencida → COMPETITION_INACTIVE (409)', async () => {
    for (const competition of [null, { activeUntil: '2026-11-13T23:00:00.000Z' }]) {
      const t = setup({ competition });
      await expectAppError(
        t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0)),
        'COMPETITION_INACTIVE',
        409,
      );
      expect(mutatingWrites(t)).toEqual([]);
    }
  });

  it('CMP-19: corrigir e apagar com a competição vencida → COMPETITION_INACTIVE, e a partida fica como estava', async () => {
    const t = setup();
    const created = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0));
    const id = created.matches[0]?.id ?? '';
    const before = structuredClone(t.matchStore);
    t.state.competition = storedCompetition({ activeUntil: '2026-11-14T00:00:00.000Z' });
    t.clock.now = LATER;
    await expectAppError(
      t.service.update(OWNER, GROUP_ID, gameId(NOV13), id, { ...match([OWNER], [A], 1), ...t.mv(id) }),
      'COMPETITION_INACTIVE',
      409,
    );
    await expectAppError(
      t.service.remove(OWNER, GROUP_ID, gameId(NOV13), id, t.mv(id)),
      'COMPETITION_INACTIVE',
      409,
    );
    expect(t.matchStore).toEqual(before);
  });

  it('CMP-19: grupo arquivado → GROUP_ARCHIVED (409); quem não participa ou outro grupo → GROUP_NOT_FOUND (404)', async () => {
    const archived = setup({ group: ARCHIVED });
    await expectAppError(
      archived.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0)),
      'GROUP_ARCHIVED',
      409,
    );
    const t = setup();
    await expectAppError(
      t.service.create(OUTSIDER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0)),
      'GROUP_NOT_FOUND',
      404,
    );
    await expectAppError(
      t.service.create(OWNER, OTHER_GROUP_ID, gameId(NOV13), match([OWNER], [A], 0)),
      'GROUP_NOT_FOUND',
      404,
    );
  });

  it('CMP-19: a ordem dos erros: fora → permissão → arquivado → inativa → jogo → não começou → cancelado → unidade → partida → times', async () => {
    const bad = { teams: [[], []] as unknown as MatchInput['teams'], winner: 0 as const };
    const missing = 'f1111111-1111-4111-8111-111111111111';

    const all = setup({ group: ARCHIVED, competition: null });
    await expectAppError(all.service.create(OUTSIDER, GROUP_ID, gameId(OCT23), bad), 'GROUP_NOT_FOUND', 404);
    await expectAppError(all.service.create(B, GROUP_ID, gameId(OCT23), bad), 'GROUP_PERMISSION_DENIED', 403);
    await expectAppError(all.service.create(OWNER, GROUP_ID, gameId(OCT23), bad), 'GROUP_ARCHIVED', 409);

    const inactive = setup({ competition: null });
    await expectAppError(
      inactive.service.create(OWNER, GROUP_ID, gameId(OCT23), bad),
      'COMPETITION_INACTIVE',
      409,
    );

    const active = setup();
    await expectAppError(
      active.service.create(OWNER, GROUP_ID, gameId(THURSDAY), bad),
      'GAME_NOT_FOUND',
      404,
    );
    await expectAppError(active.service.create(OWNER, GROUP_ID, gameId(NOV20), bad), 'GAME_NOT_STARTED', 409);

    // Cancelado vem antes da unidade pelo dia.
    const day = setup({ competition: { rules: DAY_RULES } });
    await expectAppError(day.service.create(OWNER, GROUP_ID, gameId(OCT30), bad), 'GAME_CANCELLED', 409);
    // A unidade pelo dia antes da partida que não existe e dos times.
    const dayErr = await expectAppError(
      day.service.update(OWNER, GROUP_ID, gameId(NOV13), missing, { ...bad, ...day.mv(missing) }),
      'MATCH_INVALID',
      422,
    );
    expect(dayErr.details).toMatchObject({ reason: 'day_unit' });

    // Partida que não existe antes dos times inválidos.
    await expectAppError(
      active.service.update(OWNER, GROUP_ID, gameId(NOV13), missing, { ...bad, ...active.mv(missing) }),
      'MATCH_NOT_FOUND',
      404,
    );
    // Por fim, os times.
    await expectAppError(active.service.create(OWNER, GROUP_ID, gameId(NOV13), bad), 'MATCH_INVALID', 422);
  });
});

describe('a partida (CMP-20)', () => {
  it('CMP-20: o resultado é o Time A, o Time B ou empate, e os times não precisam ter o mesmo tamanho', async () => {
    const t = setup();
    await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER, R, X], [A], 0));
    await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A, G, R], 1));
    const res = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([G], [B], 'draw'));
    expect(res.matches.map((m) => m.winner)).toEqual([0, 1, 'draw']);
    expect(t.matchStore.map((m) => m.winner)).toEqual([0, 1, 'draw']);
  });

  it('CMP-20: entra quem está na lista (dentro ou fila, de qualquer papel) e o avulso dos times publicados', async () => {
    const t = setup();
    // Dentro: Dono (membro), Rafa (reserva), Gabi (convidada). Fila: Beatriz, Heitor (convidado), Edu. Avulso: X.
    const res = await t.service.create(
      OWNER,
      GROUP_ID,
      gameId(NOV13),
      match([OWNER, R, G, X], [B, H, E, D], 0),
    );
    expect(res.matches[0]?.teams).toEqual([
      [pub(OWNER), pub(R), pub(G), X],
      [pub(B), pub(H), pub(E), pub(D)],
    ]);
  });

  it('CMP-20: pessoa de fora (não confirmou, não é do grupo, avulso que não está nos times) → MATCH_INVALID person_unknown, com o id', async () => {
    const t = setup();
    for (const [who, shown] of [
      [C, pub(C)],
      [OUTSIDER, pub(OUTSIDER)],
      [UNKNOWN_EXTRA, UNKNOWN_EXTRA],
    ] as const) {
      const err = await expectAppError(
        t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER, who], [A], 0)),
        'MATCH_INVALID',
        422,
      );
      expect(err.details).toEqual({ reason: 'person_unknown', userId: shown });
    }
    expect(mutatingWrites(t)).toEqual([]);
  });

  it('CMP-20: sem times publicados (só rascunho), o avulso não entra → person_unknown', async () => {
    const t = setup({ teams: { [NOV13]: publishedTeams(NOV13, TEAMS_NOV13, { status: 'draft' }) } });
    const err = await expectAppError(
      t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER, X], [A], 0)),
      'MATCH_INVALID',
      422,
    );
    expect(err.details).toEqual({ reason: 'person_unknown', userId: X });
  });

  it('CMP-20: time vazio → MATCH_INVALID team_empty', async () => {
    const t = setup();
    for (const teams of [
      [[], [pub(A)]],
      [[pub(OWNER)], []],
    ]) {
      const err = await expectAppError(
        t.service.create(OWNER, GROUP_ID, gameId(NOV13), { teams: teams as MatchInput['teams'], winner: 0 }),
        'MATCH_INVALID',
        422,
      );
      expect(err.details).toMatchObject({ reason: 'team_empty' });
    }
    expect(mutatingWrites(t)).toEqual([]);
  });

  it('CMP-20: a mesma pessoa nos dois times → MATCH_INVALID person_repeated, com o id', async () => {
    const t = setup();
    for (const [who, shown] of [
      [A, pub(A)],
      [X, X],
    ] as const) {
      const err = await expectAppError(
        t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER, who], [who, G], 0)),
        'MATCH_INVALID',
        422,
      );
      expect(err.details).toEqual({ reason: 'person_repeated', userId: shown });
    }
    expect(mutatingWrites(t)).toEqual([]);
  });

  it('CMP-20: até 30 partidas por jogo: a 31ª → GAME_MATCHES_FULL (409); apagar uma libera a vaga', async () => {
    const t = setup();
    for (const _ of Array.from({ length: COMPETITION_MATCH_LIMIT }))
      await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0));
    expect(t.matchStore).toHaveLength(COMPETITION_MATCH_LIMIT);

    await expectAppError(
      t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0)),
      'GAME_MATCHES_FULL',
      409,
    );
    // Times inválidos vêm antes do limite.
    await expectAppError(
      t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER, C], [A], 0)),
      'MATCH_INVALID',
      422,
    );
    expect(t.matchStore).toHaveLength(COMPETITION_MATCH_LIMIT);

    await t.service.remove(
      OWNER,
      GROUP_ID,
      gameId(NOV13),
      t.matchStore[0]?.id ?? '',
      t.mv(t.matchStore[0]?.id ?? ''),
    );
    const res = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 1));
    expect(res.matches).toHaveLength(COMPETITION_MATCH_LIMIT);
  });

  it('CMP-20: o limite é por jogo: outro jogo cheio não barra este', async () => {
    const t = setup();
    for (const _ of Array.from({ length: COMPETITION_MATCH_LIMIT }))
      await t.service.create(OWNER, GROUP_ID, gameId(NOV06), match([OWNER], [A], 0));
    const res = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0));
    expect(res.matches).toHaveLength(1);
  });

  it('CMP-20: as partidas ficam na ordem de registro, numeradas; apagar uma renumera as seguintes', async () => {
    const t = setup();
    const res = await registerReference(t);
    expect(res.matches.map((m) => [m.number, m.winner])).toEqual([
      [1, 0],
      [2, 0],
      [3, 'draw'],
    ]);
    const second = res.matches[1]?.id ?? '';
    const third = res.matches[2]?.id ?? '';

    const after = await t.service.remove(OWNER, GROUP_ID, gameId(NOV13), second, t.mv(second));
    expect(after.matches.map((m) => m.id)).toEqual([res.matches[0]?.id, third]);
    expect(after.matches.map((m) => m.number)).toEqual([1, 2]);
    expect(t.matchStore.map((m) => m.id)).toEqual([res.matches[0]?.id, third]);
  });

  it('CMP-20: corrigir troca os times e o resultado de uma vez, mantendo o número e quando foi registrada', async () => {
    const t = setup();
    const res = await registerReference(t);
    const first = res.matches[0]?.id ?? '';
    t.clock.now = LATER;

    const fixed = await t.service.update(A, GROUP_ID, gameId(NOV13), first, {
      ...match([A, G, X], [OWNER, R], 1),
      ...t.mv(first),
    });
    expect(fixed.matches[0]).toEqual({
      id: first,
      number: 1,
      teams: [
        [pub(A), pub(G), X],
        [pub(OWNER), pub(R)],
      ],
      winner: 1,
      version: 2,
    });
    expect(fixed.matches).toHaveLength(3);
    expect(t.matchStore[0]).toMatchObject({
      id: first,
      teams: [
        [A, G, X],
        [OWNER, R],
      ],
      winner: 1,
      createdAt: NOW.toISOString(),
      updatedAt: LATER.toISOString(),
    });
  });

  it('CMP-20: corrigir valida os times como registrar', async () => {
    const t = setup();
    const res = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0));
    const id = res.matches[0]?.id ?? '';
    const err = await expectAppError(
      t.service.update(OWNER, GROUP_ID, gameId(NOV13), id, { ...match([OWNER, C], [A], 0), ...t.mv(id) }),
      'MATCH_INVALID',
      422,
    );
    expect(err.details).toEqual({ reason: 'person_unknown', userId: pub(C) });
    expect(t.matchStore[0]?.teams).toEqual([[OWNER], [A]]);
  });

  it('CMP-20: partida que não existe, ou de outro jogo → MATCH_NOT_FOUND (404), ao corrigir e ao apagar', async () => {
    const t = setup();
    const other = await t.service.create(OWNER, GROUP_ID, gameId(NOV06), match([OWNER], [A], 0));
    const otherId = other.matches[0]?.id ?? '';
    for (const id of ['f1111111-1111-4111-8111-111111111111', otherId]) {
      await expectAppError(
        t.service.update(OWNER, GROUP_ID, gameId(NOV13), id, { ...match([OWNER], [A], 1), ...t.mv(id) }),
        'MATCH_NOT_FOUND',
        404,
      );
      await expectAppError(
        t.service.remove(OWNER, GROUP_ID, gameId(NOV13), id, t.mv(id)),
        'MATCH_NOT_FOUND',
        404,
      );
    }
    expect(t.matchStore.map((m) => m.winner)).toEqual([0]);
  });
});

describe('quem jogou veio (CMP-21)', () => {
  it('CMP-21: na chamada sugerida, quem está em alguma partida vem como "veio", mesmo da fila', async () => {
    const t = setup();
    await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER, E], [A, H], 0));
    const res = await t.results.get(OWNER, GROUP_ID, gameId(NOV13));
    expect(personOf(res, E)?.attendance).toBe('present');
    expect(personOf(res, H)?.attendance).toBe('present');
    // Quem está na fila e não jogou continua "faltou".
    expect(personOf(res, B)?.attendance).toBe('absent');
  });

  it('CMP-12: com a unidade por partida, a sugerida marca dentro = veio, fila = faltou, e quem jogou = veio', async () => {
    const t = setup();
    await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([B], [A], 0));
    const res = await t.results.get(A, GROUP_ID, gameId(NOV13));
    for (const id of [OWNER, A, R, G, D, B]) expect(personOf(res, id)?.attendance).toBe('present');
    for (const id of [H, E]) expect(personOf(res, id)?.attendance).toBe('absent');
  });

  it('CMP-21: fechar com "faltou" para quem jogou → RESULT_INVALID (422) absent_played, com o id, sem gravar', async () => {
    const t = setup();
    await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER, E], [A], 0));
    const err = await expectAppError(
      t.results.close(OWNER, GROUP_ID, gameId(NOV13), { ...t.rv(NOV13), attendance: wire(FULL_NOV13) }),
      'RESULT_INVALID',
      422,
    );
    expect(err.details).toEqual({ reason: 'absent_played', userId: pub(E) });
    expect(t.store.size).toBe(0);
  });

  it('CMP-21: corrigir a chamada de um jogo fechado com "faltou" para quem jogou → absent_played', async () => {
    const t = setup();
    await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0));
    await t.results.close(OWNER, GROUP_ID, gameId(NOV13), { ...t.rv(NOV13), attendance: wire(FULL_NOV13) });
    const before = structuredClone(t.store.get(gameId(NOV13)));
    const err = await expectAppError(
      t.results.close(OWNER, GROUP_ID, gameId(NOV13), {
        ...t.rv(NOV13),
        attendance: wire({ ...FULL_NOV13, [A]: 'absent' }),
      }),
      'RESULT_INVALID',
      422,
    );
    expect(err.details).toEqual({ reason: 'absent_played', userId: pub(A) });
    expect(t.store.get(gameId(NOV13))).toEqual(before);
  });

  it('CMP-21: jogo fechado: pôr numa partida quem está marcado como "faltou" → MATCH_INVALID person_absent, ao registrar e ao corrigir', async () => {
    const t = setup();
    const created = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0));
    const id = created.matches[0]?.id ?? '';
    await t.results.close(OWNER, GROUP_ID, gameId(NOV13), { ...t.rv(NOV13), attendance: wire(FULL_NOV13) });

    for (const call of [
      () => t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER, D], [A], 0)),
      () =>
        t.service.update(OWNER, GROUP_ID, gameId(NOV13), id, { ...match([OWNER], [A, D], 0), ...t.mv(id) }),
    ]) {
      const err = await expectAppError(call(), 'MATCH_INVALID', 422);
      expect(err.details).toEqual({ reason: 'person_absent', userId: pub(D) });
    }
    expect(t.matchStore).toHaveLength(1);
    expect(t.matchStore[0]?.teams).toEqual([[OWNER], [A]]);
  });

  it('CMP-21: antes de fechar não há chamada: quem viria da fila entra na partida', async () => {
    const t = setup();
    const res = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([E, D], [A], 0));
    expect(res.matches).toHaveLength(1);
  });
});

describe('os pontos por partida e o vencedor do dia (CMP-22)', () => {
  it('CMP-22: fechado, cada membro que veio soma as partidas que jogou, com as vitórias, empates e derrotas', async () => {
    const t = setup();
    await registerReference(t);
    const res = await t.results.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
    });

    expect(CompetitionGameDetailSchema.parse(res)).toEqual(res);
    expect(personOf(res, OWNER)).toMatchObject({
      event: 'played',
      points: 12,
      record: { wins: 2, draws: 1, losses: 0 },
    });
    expect(personOf(res, A)).toMatchObject({
      event: 'played',
      points: 4,
      record: { wins: 0, draws: 1, losses: 2 },
    });
    expect(personOf(res, B)).toMatchObject({
      event: 'played',
      points: 7,
      record: { wins: 1, draws: 1, losses: 0 },
    });
  });

  it('CMP-14: unidade por partida: veio → a soma das partidas; falta, fila e não confirmou como antes', async () => {
    const t = setup();
    await registerReference(t);
    const res = await t.results.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
    });
    expect(personOf(res, OWNER)?.points).toBe(12);
    expect(personOf(res, D)).toMatchObject({ event: 'noShow', points: -3 });
    expect(personOf(res, E)).toMatchObject({ event: 'absentQueue', points: 0 });
    expect(personOf(res, C)).toMatchObject({ event: 'notConfirmed', points: -1 });
  });

  it('CMP-22: membro que veio e não jogou nenhuma partida fica com 0; reserva, convidado e avulso não pontuam', async () => {
    const t = setup();
    await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER, R, G, X], [A], 0));
    const res = await t.results.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire({ ...FULL_NOV13 }),
    });
    expect(personOf(res, B)).toMatchObject({ event: 'noResult', points: 0 });
    for (const id of [R, G, X]) {
      expect(personOf(res, id)?.event).toBeUndefined();
      expect(personOf(res, id)?.points ?? 0).toBe(0);
    }
  });

  it('CMP-22: antes de fechar, o jogo não mostra pontos, e todos que participam veem as partidas e o vencedor do dia', async () => {
    const t = setup();
    await registerReference(t);
    for (const who of [OWNER, B, R]) {
      const res = await t.results.get(who, GROUP_ID, gameId(NOV13));
      expect(res.closed).toBe(false);
      expect(res.matches).toHaveLength(3);
      expect(res.dayWinners).toEqual([pub(OWNER)]);
      for (const p of res.people) expect(p.points).toBeUndefined();
    }
  });

  it('CMP-22: corrigir ou apagar uma partida de um jogo fechado muda os pontos na hora', async () => {
    const t = setup();
    const res = await registerReference(t);
    await t.results.close(OWNER, GROUP_ID, gameId(NOV13), { ...t.rv(NOV13), attendance: wire(FULL_NOV13) });
    const [first, second] = res.matches.map((m) => m.id);

    // Partida 1 corrigida: Ana e Gabi venceram. Dono: D, V, E = 1+5+2 = 8. Ana: V, D, E = 5+1+2 = 8.
    const fixed = await t.service.update(OWNER, GROUP_ID, gameId(NOV13), first ?? '', {
      ...match([OWNER, R, X], [A, G], 1),
      ...t.mv(first ?? ''),
    });
    expect(personOf(fixed, OWNER)).toMatchObject({ points: 8, record: { wins: 1, draws: 1, losses: 1 } });
    expect(personOf(fixed, A)).toMatchObject({ points: 8, record: { wins: 1, draws: 1, losses: 1 } });

    // Apagada a Partida 2: Dono: D, E = 1+2 = 3. Beatriz: só o empate = 2.
    const removed = await t.service.remove(OWNER, GROUP_ID, gameId(NOV13), second ?? '', t.mv(second ?? ''));
    expect(personOf(removed, OWNER)).toMatchObject({ points: 3, record: { wins: 0, draws: 1, losses: 1 } });
    expect(personOf(removed, B)).toMatchObject({ points: 2, record: { wins: 0, draws: 1, losses: 0 } });
    expect(await t.results.get(B, GROUP_ID, gameId(NOV13))).toEqual(removed);
  });

  it('CMP-22: os pontos saem da cópia do regulamento do fechamento', async () => {
    const t = setup();
    await registerReference(t);
    await t.results.close(OWNER, GROUP_ID, gameId(NOV13), { ...t.rv(NOV13), attendance: wire(FULL_NOV13) });
    t.state.competition = storedCompetition({
      rules: {
        ...MATCH_RULES,
        points: { win: 1, draw: 0, loss: 0, notConfirmed: 0, noShow: 0, cancelled: 0 },
      },
    });
    const res = await t.results.get(OWNER, GROUP_ID, gameId(NOV13));
    expect(personOf(res, OWNER)?.points).toBe(12);
  });

  it('CMP-22: amistoso → as partidas aparecem, e ninguém pontua', async () => {
    const t = setup();
    await registerReference(t);
    const res = await t.results.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      friendly: true,
    });
    expect(res.matches).toHaveLength(3);
    for (const id of [OWNER, A, B, C, D, E]) expect(personOf(res, id)?.points).toBe(0);
  });

  it('CMP-22: o vencedor do dia é quem tem mais vitórias; empatados, todos; qualquer pessoa, também reserva e avulso', async () => {
    const t = setup();
    await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([R, X], [OWNER], 0));
    const tie = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [R, X], 0));
    // Rafa e o avulso: 1 V; Dono: 1 V.
    expect(sorted(tie.dayWinners)).toEqual(sorted([pub(R), X, pub(OWNER)]));

    const res = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([R, X, G], [A], 0));
    expect(sorted(res.dayWinners)).toEqual(sorted([pub(R), X]));
    expect(leaksSystemId(res)).toBe(false);
  });

  it('CMP-22: sem nenhuma vitória (só empates) → sem vencedor do dia', async () => {
    const t = setup();
    const res = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 'draw'));
    expect(res.dayWinners).toEqual([]);
    const none = await t.results.get(OWNER, GROUP_ID, gameId(NOV06));
    expect(none.matches).toEqual([]);
    expect(none.dayWinners).toEqual([]);
  });
});

describe('partida com a versão que a tela mostrou (CMP-42)', () => {
  it('CMP-42: registrar não manda versão, e a partida sai com a version 1', async () => {
    const t = setup();
    const res = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0));
    expect(res.matches[0]?.version).toBe(1);
  });

  it('CMP-42: editar com a versão da partida grava e soma 1', async () => {
    const t = setup();
    const created = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0));
    const id = created.matches[0]?.id ?? '';
    const res = await t.service.update(OWNER, GROUP_ID, gameId(NOV13), id, {
      ...match([OWNER], [A], 1),
      version: 1,
    });
    expect(res.matches.find((m) => m.id === id)).toMatchObject({ winner: 1, version: 2 });
  });

  it('CMP-42: editar com a versão velha → VERSION_CONFLICT (409, currentVersion) e a partida fica', async () => {
    const t = setup();
    const created = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0));
    const id = created.matches[0]?.id ?? '';
    await t.service.update(OWNER, GROUP_ID, gameId(NOV13), id, { ...match([OWNER], [A], 1), version: 1 });
    const err = await expectAppError(
      t.service.update(A, GROUP_ID, gameId(NOV13), id, { ...match([OWNER], [A], 'draw'), version: 1 }),
      'VERSION_CONFLICT',
      409,
    );
    expect(err.details).toEqual({ currentVersion: 2 });
    expect(t.matchStore.find((m) => m.id === id)).toMatchObject({ winner: 1, version: 2 });
  });

  it('CMP-42: apagar com a versão velha → VERSION_CONFLICT e a partida continua', async () => {
    const t = setup();
    const created = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0));
    const id = created.matches[0]?.id ?? '';
    await t.service.update(OWNER, GROUP_ID, gameId(NOV13), id, { ...match([OWNER], [A], 1), version: 1 });
    const err = await expectAppError(
      t.service.remove(OWNER, GROUP_ID, gameId(NOV13), id, { version: 1 }),
      'VERSION_CONFLICT',
      409,
    );
    expect(err.details).toEqual({ currentVersion: 2 });
    expect(t.matchStore.map((m) => m.id)).toContain(id);
    expect(t.writes.some((w) => w.op === 'match_delete')).toBe(false);
  });

  it('CMP-42: apagar com a versão atual apaga', async () => {
    const t = setup();
    const created = await t.service.create(OWNER, GROUP_ID, gameId(NOV13), match([OWNER], [A], 0));
    const id = created.matches[0]?.id ?? '';
    const res = await t.service.remove(OWNER, GROUP_ID, gameId(NOV13), id, { version: 1 });
    expect(res.matches.map((m) => m.id)).not.toContain(id);
  });

  it('CMP-42: o contrato pede a version no PUT e no DELETE da partida, e não no POST', () => {
    const input = { teams: [['AAAAAAAA'], ['BBBBBBBB']], winner: 0 };
    expect(UpdateMatchInputSchema.safeParse(input).success).toBe(false);
    expect(UpdateMatchInputSchema.safeParse({ ...input, version: 1 }).success).toBe(true);
    expect(VersionInputSchema.safeParse({}).success).toBe(false);
    expect(VersionInputSchema.safeParse({ version: 1 }).success).toBe(true);
    expect(MatchInputSchema.safeParse({ ...input, version: 1 }).data).not.toHaveProperty('version');
  });
});
