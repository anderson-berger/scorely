import { AppError, appError } from '@scorely/api/src/lib/errors';
import { asUserId, type UserId } from '@scorely/api/src/lib/ids';
import type {
  CompetitionRepository,
  StoredCompetition,
} from '@scorely/api/src/modules/competition/competition.repository';
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
  CloseGameInputSchema,
  COMPETITION_PRESETS,
  type CompetitionGameDetail,
  CompetitionGameDetailSchema,
  CompetitionGameSchema,
  type CompetitionRules,
  type ErrorCode,
  type MemberTier,
  type PublicUserId,
  PublicUserIdSchema,
  type RoleId,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

/** ADR 0016: o que o banco faz na gravação condicionada pela versão (o repositório lança o mesmo erro). */
function expectVersionIn(current: number, expected: number): void {
  if (current !== expected) throw appError('VERSION_CONFLICT', { currentVersion: current });
}

// Competição, etapa 2 (`.claude/work/competicao-2.md`): fechar o jogo, corrigir e ver os jogos (CMP-11–16).
// Interfaces de D10: `createResultService({ groups, games, teams, competitions, results, users, now })` com
// `list(userId, groupId)`, `get(userId, groupId, date)` e `close(userId, groupId, date, input)`. Quem pede vai pelo
// id do sistema (o login); a chamada e as pessoas da resposta, pelo id público (ou o do avulso). O que é gravado
// (`StoredGameResult`) fica com os ids do sistema, como no resto da api.

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
/** Avulso (TIM-24): só nos times, sem conta. */
const X = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

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

/** Id público de cada pessoa: os 4 primeiros e os 4 últimos caracteres do id do sistema, em maiúsculas. */
const pub = (id: UserId): PublicUserId =>
  PublicUserIdSchema.parse(`${id.slice(0, 4)}${id.slice(-4)}`.toUpperCase());

const ROSTER: Record<string, MemberTier> = {
  [OWNER]: 'member',
  [A]: 'member',
  [B]: 'member',
  [C]: 'member',
  [D]: 'member',
  [E]: 'member',
  [R]: 'reserve',
};
const MEMBERS_NOW = [OWNER, A, B, C, D, E];

/** Sexta 13/11, 20:30 em São Paulo: o jogo das 19h está em andamento. */
const NOW = new Date('2026-11-13T23:30:00.000Z');
const LATER = new Date('2026-11-14T10:00:00.000Z');
const ARCHIVED = { archivedAt: '2026-11-14T00:00:00.000Z' };

const NOV13 = '2026-11-13';
const NOV06 = '2026-11-06';
const OCT30 = '2026-10-30';
/** Antes da ativação (25/10). */
const OCT23 = '2026-10-23';
/** Jogo futuro (alguém já confirmou). */
const NOV20 = '2026-11-20';
/** Quinta: não é dia do grupo. */
const THURSDAY = '2026-11-12';

/** Regulamento com valores distintos, para reconhecer cada acontecimento pelo ponto. */
const RULES: CompetitionRules = {
  points: { win: 5, draw: 2, loss: 1, notConfirmed: -1, noShow: -3, cancelled: 4 },
  unit: 'day',
  tiebreak: ['attendance'],
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
    rules: RULES,
    createdAt: '2026-10-25T00:00:00.000Z',
    updatedAt: '2026-10-25T00:00:00.000Z',
    version: 1,
    ...extra,
  };
}

interface FakeGame {
  record: GameRecord;
  /** Na ordem de confirmação: as `slots` primeiras estão dentro (GRP-19). */
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
    [NOV06]: fakeGame(NOV06, [OWNER, R]),
    [NOV13]: fakeGame(NOV13, LIST_NOV13),
    [NOV20]: fakeGame(NOV20, [OWNER]),
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

const unused = () => Promise.reject(new Error('not used by the competition results'));

function setup(
  opts: {
    group?: Partial<StoredGroup>;
    competition?: Partial<StoredCompetition> | null;
    games?: Record<string, FakeGame>;
    teams?: Record<string, StoredTeams>;
    /** GRP-66: horários arquivados, lidos pelo `groupSchedules.get` (não vêm com o grupo). */
    archivedSchedules?: Record<string, { slots?: number }>;
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
    /** `get` do resultado devolve "não existe" uma vez (corrida no 1º fechamento, D6). */
    staleResultRead: false,
  };
  const store = new Map<string, StoredGameResult>();
  const writes: { op: 'create' | 'create_failed' | 'update'; gameId: string }[] = [];

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
      if (state.staleResultRead) {
        state.staleResultRead = false;
        return undefined;
      }
      const item = store.get(id);
      return item ? structuredClone(item) : undefined;
    },
    listByGroup: async (groupId) =>
      [...store.values()].filter((r) => r.groupId === groupId).map((r) => structuredClone(r)),
    /** CMP-42 (ADR 0016): o 1º fechamento manda 0; já fechado (outro aparelho antes) → VERSION_CONFLICT. */
    create: async (item, expectedVersion) => {
      const found = store.get(item.gameId);
      if (found) writes.push({ op: 'create_failed', gameId: item.gameId });
      expectVersionIn(found?.version ?? 0, expectedVersion);
      writes.push({ op: 'create', gameId: item.gameId });
      store.set(item.gameId, { ...structuredClone(item), version: 1 });
      return true;
    },
    /** CMP-42: a correção grava só com a versão atual do fechamento, e ela soma 1. */
    update: async (id, patch, expectedVersion) => {
      const item = store.get(id);
      expectVersionIn(item?.version ?? 0, expectedVersion);
      if (!item) throw new Error('update without item');
      writes.push({ op: 'update', gameId: id });
      store.set(id, { ...item, ...structuredClone(patch), version: item.version + 1 });
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
  };

  const service = createResultService({
    groups,
    games,
    teams,
    competitions,
    results,
    users,
    groupSchedules: {
      get: async (_groupId: string, scheduleId: string) => {
        const found = opts.archivedSchedules?.[scheduleId];
        return found && ({ ...SCHEDULE, ...found, archivedAt: '2026-11-01T00:00:00.000Z' } as never);
      },
    },
    now: () => clock.now,
  });
  /** CMP-42: a versão do fechamento que a tela mostrou (`0` = não fechado). */
  const rv = (date: string) => ({ version: store.get(gameId(date))?.version ?? 0 });
  return { clock, state, store, writes, service, rv };
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

/** A chamada pelo id público. */
const wire = (marks: Partial<Record<string, AttendanceMark>>) =>
  Object.fromEntries(
    Object.entries(marks).map(([id, mark]) => [PEOPLE.includes(id as UserId) ? pub(id as UserId) : id, mark]),
  ) as Record<string, AttendanceMark>;

/** Chamada completa do jogo de 13/11: Davi (dentro) e Edu (fila) faltaram; Beatriz e Heitor vieram da fila. */
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

const personOf = (detail: CompetitionGameDetail, id: string) =>
  detail.people.find((p) => p.id === (PEOPLE.includes(id as UserId) ? pub(id as UserId) : id));

const leaksSystemId = (value: unknown) => PEOPLE.some((id) => JSON.stringify(value).includes(id));
const iso = (value: string) => new Date(value).toISOString();
const sorted = (list: readonly string[]) => [...list].sort();

// ---------------------------------------------------------------------------------------------

describe('quem fecha e quando (CMP-11)', () => {
  it('CMP-11: o dono fecha o jogo em andamento: o fechamento é gravado com a cópia do regulamento e os membros', async () => {
    const t = setup();
    const res = await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
      friendly: false,
    });

    expect(CompetitionGameDetailSchema.parse(res)).toEqual(res);
    expect(res).toMatchObject({
      date: NOV13,
      state: 'closed',
      closed: true,
      cancelled: false,
      friendly: false,
    });
    expect(t.writes).toEqual([{ op: 'create', gameId: gameId(NOV13) }]);
    const stored = t.store.get(gameId(NOV13));
    expect(stored).toMatchObject({
      gameId: gameId(NOV13),
      groupId: GROUP_ID,
      date: NOV13,
      cancelled: false,
      friendly: false,
      rules: RULES,
      attendance: FULL_NOV13,
      teams: TEAMS_NOV13,
      winner: 0,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(iso(stored?.startsAt ?? '')).toBe('2026-11-13T22:00:00.000Z');
    expect(sorted(stored?.members ?? [])).toEqual(sorted(MEMBERS_NOW));
  });

  it('CMP-11: membro e reserva com o cargo Admin (results.record) fecham', async () => {
    const t = setup();
    t.state.staff[R] = 'admin';
    await t.service.close(A, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      friendly: false,
    });
    await t.service.close(R, GROUP_ID, gameId(NOV06), {
      ...t.rv(NOV06),
      attendance: wire({ [OWNER]: 'present', [R]: 'present' }),
    });
    expect(t.writes.map((w) => w.gameId)).toEqual([gameId(NOV13), gameId(NOV06)]);
  });

  it('CMP-11: membro e reserva sem cargo → GROUP_PERMISSION_DENIED (403) com details.permission = results.record, sem gravar', async () => {
    const t = setup();
    for (const who of [B, R]) {
      const err = await expectAppError(
        t.service.close(who, GROUP_ID, gameId(NOV13), { ...t.rv(NOV13), attendance: wire(FULL_NOV13) }),
        'GROUP_PERMISSION_DENIED',
        403,
      );
      expect(err.details).toEqual({ permission: 'results.record' });
    }
    expect(t.writes).toEqual([]);
  });

  it('CMP-11: um jogo anterior, desde a ativação, ainda pode ser fechado depois', async () => {
    const t = setup();
    t.clock.now = new Date('2026-11-20T12:00:00.000Z');
    const res = await t.service.close(OWNER, GROUP_ID, gameId(NOV06), {
      ...t.rv(NOV06),
      attendance: wire({ [OWNER]: 'present', [R]: 'absent' }),
    });
    expect(res).toMatchObject({ date: NOV06, closed: true });
  });

  it('CMP-11: jogo de antes da ativação, data que não é dia do grupo ou semana sem ninguém → GAME_NOT_FOUND (404)', async () => {
    const games = defaultGames();
    const { [NOV06]: _skip, ...withoutNov06 } = games;
    const t = setup({ games: withoutNov06 });
    for (const date of [OCT23, THURSDAY, NOV06])
      await expectAppError(
        t.service.close(OWNER, GROUP_ID, gameId(date), {
          ...t.rv(date),
          attendance: wire({ [OWNER]: 'present', [A]: 'present' }),
        }),
        'GAME_NOT_FOUND',
        404,
      );
    expect(t.writes).toEqual([]);
  });

  it('CMP-11: o 1º jogo é o que começou depois da ativação: ativada com o jogo já em andamento, ele fica de fora', async () => {
    const t = setup({ competition: { trialStartedAt: '2026-11-13T22:30:00.000Z' } });
    await expectAppError(
      t.service.close(OWNER, GROUP_ID, gameId(NOV13), { ...t.rv(NOV13), attendance: wire(FULL_NOV13) }),
      'GAME_NOT_FOUND',
      404,
    );
  });

  it('CMP-11: jogo que ainda não começou → GAME_NOT_STARTED (409), sem gravar', async () => {
    const t = setup();
    await expectAppError(
      t.service.close(OWNER, GROUP_ID, gameId(NOV20), {
        ...t.rv(NOV20),
        attendance: wire({ [OWNER]: 'present' }),
      }),
      'GAME_NOT_STARTED',
      409,
    );
    t.clock.now = new Date('2026-11-13T21:59:59.999Z');
    await expectAppError(
      t.service.close(OWNER, GROUP_ID, gameId(NOV13), { ...t.rv(NOV13), attendance: wire(FULL_NOV13) }),
      'GAME_NOT_STARTED',
      409,
    );
    t.clock.now = new Date('2026-11-13T22:00:00.000Z');
    await t.service.close(OWNER, GROUP_ID, gameId(NOV13), { ...t.rv(NOV13), attendance: wire(FULL_NOV13) });
    expect(t.writes).toEqual([{ op: 'create', gameId: gameId(NOV13) }]);
  });

  it('CMP-11: competição desativada ou vencida → COMPETITION_INACTIVE (409), sem gravar', async () => {
    for (const competition of [null, { activeUntil: '2026-11-13T23:00:00.000Z' }]) {
      const t = setup({ competition });
      await expectAppError(
        t.service.close(OWNER, GROUP_ID, gameId(NOV13), { ...t.rv(NOV13), attendance: wire(FULL_NOV13) }),
        'COMPETITION_INACTIVE',
        409,
      );
      expect(t.writes).toEqual([]);
    }
  });

  it('CMP-11: grupo arquivado → GROUP_ARCHIVED (409) para o dono e o Admin', async () => {
    const t = setup({ group: ARCHIVED });
    for (const who of [OWNER, A])
      await expectAppError(
        t.service.close(who, GROUP_ID, gameId(NOV13), { ...t.rv(NOV13), attendance: wire(FULL_NOV13) }),
        'GROUP_ARCHIVED',
        409,
      );
    expect(t.writes).toEqual([]);
  });

  it('CMP-11: quem não participa, ou grupo inexistente → GROUP_NOT_FOUND (404)', async () => {
    const t = setup();
    await expectAppError(
      t.service.close(OUTSIDER, GROUP_ID, gameId(NOV13), { ...t.rv(NOV13), attendance: wire(FULL_NOV13) }),
      'GROUP_NOT_FOUND',
      404,
    );
    await expectAppError(
      t.service.close(OWNER, OTHER_GROUP_ID, gameId(NOV13), { ...t.rv(NOV13), attendance: wire(FULL_NOV13) }),
      'GROUP_NOT_FOUND',
      404,
    );
  });

  it('CMP-11: a ordem dos erros: quem não participa → permissão → arquivado → competição inativa → jogo não encontrado → não começou → resultado inválido', async () => {
    const bad = { version: 0, attendance: {} };
    // Tudo errado: fora do grupo ganha.
    const all = setup({ group: ARCHIVED, competition: null });
    await expectAppError(all.service.close(OUTSIDER, GROUP_ID, gameId(OCT23), bad), 'GROUP_NOT_FOUND', 404);
    // Sem cargo, num grupo arquivado e sem competição.
    await expectAppError(all.service.close(B, GROUP_ID, gameId(OCT23), bad), 'GROUP_PERMISSION_DENIED', 403);
    // Com permissão: arquivado antes da competição inativa.
    await expectAppError(all.service.close(OWNER, GROUP_ID, gameId(OCT23), bad), 'GROUP_ARCHIVED', 409);
    // Ativo e sem competição: inativa antes do jogo.
    const inactive = setup({ competition: null });
    await expectAppError(
      inactive.service.close(OWNER, GROUP_ID, gameId(OCT23), bad),
      'COMPETITION_INACTIVE',
      409,
    );
    // Competição ativa: o jogo não encontrado antes da chamada inválida.
    const active = setup();
    await expectAppError(active.service.close(OWNER, GROUP_ID, gameId(THURSDAY), bad), 'GAME_NOT_FOUND', 404);
    // Jogo futuro com chamada inválida: não começou vem antes.
    await expectAppError(active.service.close(OWNER, GROUP_ID, gameId(NOV20), bad), 'GAME_NOT_STARTED', 409);
    // Começou: aí sim a chamada.
    await expectAppError(active.service.close(OWNER, GROUP_ID, gameId(NOV13), bad), 'RESULT_INVALID', 422);
  });
});

describe('a chamada (CMP-12)', () => {
  it('CMP-12: falta alguém da lista (dentro ou fila) na chamada → RESULT_INVALID (422) attendance_missing, com o id público', async () => {
    const t = setup();
    for (const missing of [D, E]) {
      const { [missing]: _m, ...rest } = FULL_NOV13;
      const err = await expectAppError(
        t.service.close(OWNER, GROUP_ID, gameId(NOV13), { ...t.rv(NOV13), attendance: wire(rest) }),
        'RESULT_INVALID',
        422,
      );
      expect(err.details).toEqual({ reason: 'attendance_missing', userId: pub(missing) });
    }
    expect(t.writes).toEqual([]);
  });

  it('CMP-12: alguém fora da lista na chamada (membro que não confirmou, quem não é do grupo, avulso) → attendance_unknown', async () => {
    const t = setup();
    for (const [extra, shown] of [
      [{ [C]: 'present' }, pub(C)],
      [{ [OUTSIDER]: 'present' }, pub(OUTSIDER)],
      [{ [X]: 'present' }, X],
    ] as const) {
      const err = await expectAppError(
        t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
          ...t.rv(NOV13),
          attendance: wire({ ...FULL_NOV13, ...extra }),
        }),
        'RESULT_INVALID',
        422,
      );
      expect(err.details).toEqual({ reason: 'attendance_unknown', userId: shown });
    }
    expect(t.writes).toEqual([]);
  });

  it('CMP-12: a chamada é a que quem fecha marcou, para todos da lista, de qualquer papel', async () => {
    const t = setup();
    const res = await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
    });
    for (const [id, mark] of Object.entries(FULL_NOV13)) expect(personOf(res, id)?.attendance).toBe(mark);
    expect(personOf(res, OWNER)).toMatchObject({ kind: 'member', inside: true, nickname: 'Dono' });
    expect(personOf(res, B)).toMatchObject({ kind: 'member', inside: false });
    expect(personOf(res, R)).toMatchObject({ kind: 'reserve', inside: true });
    expect(personOf(res, G)).toMatchObject({ kind: 'guest', inside: true });
    expect(personOf(res, H)).toMatchObject({ kind: 'guest', inside: false });
    // O avulso não entra na chamada: está no time.
    expect(personOf(res, X)).toMatchObject({ kind: 'extra', team: 0 });
    expect(personOf(res, X)?.inside).toBeUndefined();
  });

  it('CMP-12: antes de fechar, quem fecha vê a chamada sugerida: dentro = veio, fila = faltou', async () => {
    const t = setup();
    for (const who of [OWNER, A]) {
      const res = await t.service.get(who, GROUP_ID, gameId(NOV13));
      expect(res.closed).toBe(false);
      for (const id of [OWNER, A, R, G, D]) expect(personOf(res, id)?.attendance).toBe('present');
      for (const id of [B, H, E]) expect(personOf(res, id)?.attendance).toBe('absent');
    }
  });

  it('CMP-12: jogo cancelado fecha sem chamada nem resultado, e entra na competição como cancelado', async () => {
    const t = setup();
    const res = await t.service.close(OWNER, GROUP_ID, gameId(OCT30), { ...t.rv(OCT30), attendance: {} });
    expect(res).toMatchObject({ date: OCT30, closed: true, cancelled: true, state: 'closed' });
    expect(t.store.get(gameId(OCT30))).toMatchObject({ cancelled: true, attendance: {} });
    expect(t.store.get(gameId(OCT30))?.winner).toBeUndefined();
  });

  it('CMP-12: jogo cancelado com chamada ou com vencedor → RESULT_INVALID cancelled_with_result, sem gravar', async () => {
    const t = setup();
    for (const input of [
      { attendance: wire({ [OWNER]: 'present', [A]: 'present', [B]: 'absent' }) },
      { attendance: {}, winner: 'draw' as const },
    ]) {
      const err = await expectAppError(
        t.service.close(OWNER, GROUP_ID, gameId(OCT30), { ...t.rv(OCT30), ...t.rv(OCT30), ...input }),
        'RESULT_INVALID',
        422,
      );
      expect(err.details).toMatchObject({ reason: 'cancelled_with_result' });
    }
    expect(t.writes).toEqual([]);
  });
});

describe('o resultado do dia (CMP-13)', () => {
  it('CMP-13: o vencedor é um dos times publicados; fora deles → RESULT_INVALID winner_out_of_range', async () => {
    const t = setup();
    const err = await expectAppError(
      t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
        ...t.rv(NOV13),
        attendance: wire(FULL_NOV13),
        winner: 2,
      }),
      'RESULT_INVALID',
      422,
    );
    expect(err.details).toMatchObject({ reason: 'winner_out_of_range' });
    expect(t.writes).toEqual([]);
  });

  it('CMP-13: os times são os publicados, copiados para o jogo, pelo id público e o do avulso', async () => {
    const t = setup();
    const res = await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 1,
    });
    expect(res.teams).toEqual([
      [pub(OWNER), pub(R), X],
      [pub(A), pub(G)],
    ]);
    expect(res.winner).toBe(1);
    expect(res.unit).toBe('day');
  });

  it('CMP-13: empate é um resultado', async () => {
    const t = setup();
    const res = await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 'draw',
    });
    expect(res.winner).toBe('draw');
    expect(t.store.get(gameId(NOV13))?.winner).toBe('draw');
  });

  it('CMP-13: sem times publicados (nenhum ou só rascunho), vencedor → RESULT_INVALID winner_without_teams', async () => {
    for (const teams of [{}, { [NOV13]: publishedTeams(NOV13, TEAMS_NOV13, { status: 'draft' }) }]) {
      const t = setup({ teams });
      const err = await expectAppError(
        t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
          ...t.rv(NOV13),
          attendance: wire(FULL_NOV13),
          winner: 0,
        }),
        'RESULT_INVALID',
        422,
      );
      expect(err.details).toMatchObject({ reason: 'winner_without_teams' });
      expect(t.writes).toEqual([]);
    }
  });

  it('CMP-13: sem times publicados, o jogo fecha só com a chamada, e quem veio fica sem resultado (0)', async () => {
    const t = setup({ teams: { [NOV13]: publishedTeams(NOV13, TEAMS_NOV13, { status: 'draft' }) } });
    const res = await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
    });
    expect(res.teams).toEqual([]);
    expect(t.store.get(gameId(NOV13))?.teams).toEqual([]);
    for (const id of [OWNER, A, B]) expect(personOf(res, id)).toMatchObject({ event: 'noResult', points: 0 });
    expect(personOf(res, D)).toMatchObject({ event: 'noShow', points: -3 });
  });

  it('CMP-13: com a unidade por partida, o fechamento é só a chamada: vencedor → RESULT_INVALID winner_with_match_unit', async () => {
    const t = setup({ competition: { rules: { ...RULES, unit: 'match' } } });
    for (const winner of [0, 'draw'] as const) {
      const err = await expectAppError(
        t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
          ...t.rv(NOV13),
          attendance: wire(FULL_NOV13),
          winner,
        }),
        'RESULT_INVALID',
        422,
      );
      expect(err.details).toMatchObject({ reason: 'winner_with_match_unit' });
    }
    expect(t.writes).toEqual([]);
    const res = await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
    });
    expect(res.unit).toBe('match');
    for (const id of [OWNER, A, B]) expect(personOf(res, id)).toMatchObject({ event: 'noResult', points: 0 });
  });
});

describe('os pontos do jogo (CMP-14)', () => {
  it('CMP-14: cada membro com o seu acontecimento e os pontos; reserva, convidados e avulso sem pontos', async () => {
    const t = setup();
    const res = await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
    });

    expect(personOf(res, OWNER)).toMatchObject({ kind: 'member', team: 0, event: 'win', points: 5 });
    expect(personOf(res, A)).toMatchObject({ kind: 'member', team: 1, event: 'loss', points: 1 });
    // Veio da fila, fora dos times, com um vencedor: derrota.
    expect(personOf(res, B)).toMatchObject({ kind: 'member', event: 'loss', points: 1 });
    expect(personOf(res, B)?.team).toBeUndefined();
    expect(personOf(res, D)).toMatchObject({ kind: 'member', inside: true, event: 'noShow', points: -3 });
    expect(personOf(res, E)).toMatchObject({
      kind: 'member',
      inside: false,
      event: 'absentQueue',
      points: 0,
    });
    // Membro que não confirmou também aparece no jogo fechado.
    expect(personOf(res, C)).toMatchObject({ kind: 'member', event: 'notConfirmed', points: -1 });
    expect(personOf(res, C)?.inside).toBeUndefined();

    for (const id of [R, G, H, X]) {
      expect(personOf(res, id)?.event).toBeUndefined();
      expect(personOf(res, id)?.points ?? 0).toBe(0);
    }
    expect(await t.service.get(B, GROUP_ID, gameId(NOV13))).toEqual(res);
  });

  it('CMP-14: jogo cancelado fechado → quem estava dentro recebe o ponto de cancelado; fila e quem não confirmou, 0', async () => {
    const t = setup({
      games: {
        ...defaultGames(),
        [OCT30]: fakeGame(OCT30, [OWNER, A, D, R, G, B], { cancelledAt: '2026-10-29T12:00:00.000Z' }),
      },
    });
    const res = await t.service.close(OWNER, GROUP_ID, gameId(OCT30), { ...t.rv(OCT30), attendance: {} });
    for (const id of [OWNER, A, D])
      expect(personOf(res, id)).toMatchObject({ event: 'cancelled', points: 4 });
    for (const id of [B, C, E]) expect(personOf(res, id)?.points).toBe(0);
  });

  it('CMP-14: o jogo guarda a cópia do regulamento: mudar o regulamento depois não muda os pontos nem a unidade', async () => {
    const t = setup();
    await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
    });
    t.state.competition = storedCompetition({ rules: { ...COMPETITION_PRESETS.winsOnly } });

    const res = await t.service.get(OWNER, GROUP_ID, gameId(NOV13));
    expect(res.unit).toBe('day');
    expect(personOf(res, OWNER)).toMatchObject({ event: 'win', points: 5 });
    expect(personOf(res, D)).toMatchObject({ event: 'noShow', points: -3 });
    expect(t.store.get(gameId(NOV13))?.rules).toEqual(RULES);
  });

  it('CMP-14: só os membros do 1º fechamento pontuam: a reserva que vira membro pontua só nos jogos fechados depois', async () => {
    const t = setup({
      teams: { [NOV06]: publishedTeams(NOV06, [[OWNER], [R]]), [NOV13]: publishedTeams(NOV13, TEAMS_NOV13) },
    });
    await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
    });

    t.state.roster[R] = 'member';
    const old = await t.service.get(OWNER, GROUP_ID, gameId(NOV13));
    expect(personOf(old, R)?.event).toBeUndefined();
    expect(personOf(old, R)?.points ?? 0).toBe(0);
    expect(personOf(old, R)?.kind).not.toBe('member');

    const next = await t.service.close(OWNER, GROUP_ID, gameId(NOV06), {
      ...t.rv(NOV06),
      attendance: wire({ [OWNER]: 'present', [R]: 'present' }),
      winner: 1,
    });
    expect(personOf(next, R)).toMatchObject({ kind: 'member', event: 'win', points: 5 });
  });

  it('CMP-14: quem saiu do grupo depois do fechamento continua com os pontos daquele jogo', async () => {
    const t = setup();
    await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
    });
    const { [D]: _d, [C]: _c, ...rest } = t.state.roster;
    t.state.roster = rest;
    const res = await t.service.get(OWNER, GROUP_ID, gameId(NOV13));
    expect(personOf(res, D)).toMatchObject({ kind: 'member', event: 'noShow', points: -3 });
    expect(personOf(res, C)).toMatchObject({ kind: 'member', event: 'notConfirmed', points: -1 });
  });
});

describe('corrigir e amistoso (CMP-15)', () => {
  it('CMP-15: fechar de novo corrige a chamada e o resultado, mantendo a cópia do regulamento, os membros e o createdAt', async () => {
    const t = setup();
    await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
    });
    t.state.competition = storedCompetition({ rules: COMPETITION_PRESETS.attendance });
    t.state.roster[R] = 'member';
    t.clock.now = LATER;

    const res = await t.service.close(A, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire({ ...FULL_NOV13, [D]: 'present' }),
      winner: 'draw',
    });

    expect(t.writes).toEqual([
      { op: 'create', gameId: gameId(NOV13) },
      { op: 'update', gameId: gameId(NOV13) },
    ]);
    const stored = t.store.get(gameId(NOV13));
    expect(stored).toMatchObject({
      rules: RULES,
      attendance: { ...FULL_NOV13, [D]: 'present' },
      winner: 'draw',
      createdAt: NOW.toISOString(),
      updatedAt: LATER.toISOString(),
    });
    expect(sorted(stored?.members ?? [])).toEqual(sorted(MEMBERS_NOW));
    for (const id of [OWNER, A, B, D]) expect(personOf(res, id)).toMatchObject({ event: 'draw', points: 2 });
    expect(personOf(res, R)?.event).toBeUndefined();
  });

  it('CMP-15: a correção copia os times publicados de agora e pode tirar o vencedor', async () => {
    const t = setup();
    await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
    });
    t.state.teams[NOV13] = publishedTeams(NOV13, [
      [A, R],
      [OWNER, G, X],
    ]);
    const res = await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
    });
    expect(t.store.get(gameId(NOV13))?.teams).toEqual([
      [A, R],
      [OWNER, G, X],
    ]);
    expect(personOf(res, A)).toMatchObject({ team: 0, event: 'win', points: 5 });
    expect(personOf(res, OWNER)).toMatchObject({ team: 1, event: 'loss', points: 1 });

    const none = await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
    });
    expect(none.winner).toBeUndefined();
    expect(t.store.get(gameId(NOV13))?.winner).toBeUndefined();
    expect(personOf(none, A)).toMatchObject({ event: 'noResult', points: 0 });
  });

  it('CMP-15: amistoso: o jogo continua fechado e visível, e ninguém pontua; desmarcar volta os pontos', async () => {
    const t = setup();
    const res = await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
      friendly: true,
    });
    expect(res).toMatchObject({ closed: true, friendly: true, state: 'closed' });
    for (const id of [OWNER, A, B, C, D, E]) expect(personOf(res, id)?.points).toBe(0);
    expect(personOf(res, OWNER)?.event).toBe('win');
    expect((await t.service.list(B, GROUP_ID)).find((g) => g.date === NOV13)).toMatchObject({
      state: 'closed',
      friendly: true,
    });

    const back = await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
    });
    expect(back.friendly).toBe(false);
    expect(personOf(back, OWNER)).toMatchObject({ event: 'win', points: 5 });
  });

  it('CMP-15: sem `friendly` na entrada, o jogo não é amistoso', async () => {
    const t = setup();
    const res = await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
    });
    expect(res.friendly).toBe(false);
    expect(t.store.get(gameId(NOV13))?.friendly).toBe(false);
  });

  it('CMP-15: corrigir com a competição vencida → COMPETITION_INACTIVE, e o fechamento fica como estava', async () => {
    const t = setup();
    await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
    });
    const before = structuredClone(t.store.get(gameId(NOV13)));
    t.state.competition = storedCompetition({ activeUntil: '2026-11-14T00:00:00.000Z' });
    t.clock.now = LATER;
    await expectAppError(
      t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
        ...t.rv(NOV13),
        attendance: wire(FULL_NOV13),
        winner: 1,
      }),
      'COMPETITION_INACTIVE',
      409,
    );
    expect(t.store.get(gameId(NOV13))).toEqual(before);
  });

  it('CMP-42: dois aparelhos fechando ao mesmo tempo → o 2º (que viu o jogo aberto, versão 0) recebe VERSION_CONFLICT, e o 1º fechamento fica', async () => {
    const t = setup();
    await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
    });
    t.state.competition = storedCompetition({ rules: COMPETITION_PRESETS.attendance });
    t.state.staleResultRead = true;
    t.clock.now = LATER;

    const err = await expectAppError(
      t.service.close(A, GROUP_ID, gameId(NOV13), { version: 0, attendance: wire(FULL_NOV13), winner: 1 }),
      'VERSION_CONFLICT',
      409,
    );
    expect(err.details).toEqual({ currentVersion: 1 });
    expect(t.writes.filter((w) => w.op === 'create')).toHaveLength(1);
    expect(t.writes.filter((w) => w.op === 'update')).toHaveLength(0);
    expect(t.store.get(gameId(NOV13))).toMatchObject({ rules: RULES, winner: 0, version: 1 });
  });
});

describe('quem vê os jogos (CMP-16)', () => {
  it('CMP-16: a lista: os jogos desde a ativação que viraram item, do mais recente ao mais antigo, com o estado', async () => {
    const t = setup();
    await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
    });

    const list = await t.service.list(B, GROUP_ID);
    for (const game of list) expect(CompetitionGameSchema.parse(game)).toEqual(game);
    // Fica de fora: 23/10 (antes da ativação) e 20/11 (não começou).
    expect(
      list.map(({ date, state, cancelled, friendly }) => ({ date, state, cancelled, friendly })),
    ).toEqual([
      { date: NOV13, state: 'closed', cancelled: false, friendly: false },
      { date: NOV06, state: 'open', cancelled: false, friendly: false },
      { date: OCT30, state: 'cancelled', cancelled: true, friendly: false },
    ]);
    expect(list.map((g) => iso(g.startsAt))).toEqual([
      '2026-11-13T22:00:00.000Z',
      '2026-11-06T22:00:00.000Z',
      '2026-10-30T22:00:00.000Z',
    ]);
  });

  it('CMP-16: o cancelado fechado aparece como fechado, e continua marcado como cancelado', async () => {
    const t = setup();
    await t.service.close(OWNER, GROUP_ID, gameId(OCT30), { ...t.rv(OCT30), attendance: {} });
    expect((await t.service.list(OWNER, GROUP_ID)).find((g) => g.date === OCT30)).toMatchObject({
      state: 'closed',
      cancelled: true,
    });
  });

  it('CMP-16: semana sem ninguém (sem item do jogo) não aparece na lista', async () => {
    const { [NOV06]: _skip, ...games } = defaultGames();
    const t = setup({ games });
    expect((await t.service.list(OWNER, GROUP_ID)).map((g) => g.date)).toEqual([NOV13, OCT30]);
  });

  it('CMP-16: membros e reservas veem, também com a competição vencida e com o grupo arquivado', async () => {
    const t = setup();
    await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
    });
    t.state.group = storedGroup(ARCHIVED);
    t.state.competition = storedCompetition({ activeUntil: '2026-11-13T23:00:00.000Z' });
    for (const who of [OWNER, B, R]) {
      expect((await t.service.list(who, GROUP_ID)).map((g) => g.date)).toEqual([NOV13, NOV06, OCT30]);
      expect(personOf(await t.service.get(who, GROUP_ID, gameId(NOV13)), OWNER)).toMatchObject({ points: 5 });
    }
  });

  it('CMP-16: quem não participa, ou grupo inexistente → GROUP_NOT_FOUND (404) na lista e no jogo', async () => {
    const t = setup();
    await expectAppError(t.service.list(OUTSIDER, GROUP_ID), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.service.get(OUTSIDER, GROUP_ID, gameId(NOV13)), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.service.list(OWNER, OTHER_GROUP_ID), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.service.get(OWNER, OTHER_GROUP_ID, gameId(NOV13)), 'GROUP_NOT_FOUND', 404);
  });

  it('CMP-16: abrir um jogo de antes da ativação, ou uma data que não é jogo do grupo → GAME_NOT_FOUND', async () => {
    const t = setup();
    await expectAppError(t.service.get(OWNER, GROUP_ID, gameId(OCT23)), 'GAME_NOT_FOUND', 404);
    await expectAppError(t.service.get(OWNER, GROUP_ID, gameId(THURSDAY)), 'GAME_NOT_FOUND', 404);
  });

  it('CMP-16: jogo para fechar mostra só que falta fechar: sem pontos, e sem chamada para quem não fecha', async () => {
    const t = setup();
    for (const who of [B, R]) {
      const res = await t.service.get(who, GROUP_ID, gameId(NOV13));
      expect(CompetitionGameDetailSchema.parse(res)).toEqual(res);
      expect(res).toMatchObject({ date: NOV13, state: 'open', closed: false, unit: 'day' });
      for (const p of res.people) {
        expect(p.attendance).toBeUndefined();
        expect(p.event).toBeUndefined();
        expect(p.points).toBeUndefined();
      }
    }
    const asCloser = await t.service.get(OWNER, GROUP_ID, gameId(NOV13));
    for (const p of asCloser.people) expect(p.points).toBeUndefined();
  });

  it('CMP-16: o jogo cancelado e ainda não fechado aparece como cancelado no detalhe', async () => {
    const t = setup();
    expect(await t.service.get(OWNER, GROUP_ID, gameId(OCT30))).toMatchObject({
      state: 'cancelled',
      cancelled: true,
      closed: false,
    });
  });

  it('CMP-16: a lista e o jogo saem só com o id público (nenhum id do sistema na resposta)', async () => {
    const t = setup();
    const closed = await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
    });
    expect(leaksSystemId(closed)).toBe(false);
    expect(leaksSystemId(await t.service.get(OWNER, GROUP_ID, gameId(NOV06)))).toBe(false);
    expect(leaksSystemId(await t.service.list(OWNER, GROUP_ID))).toBe(false);
  });
});

describe('a lista do jogo do 1º fechamento (CMP-14, CMP-15)', () => {
  it('CMP-14: menos vagas no grupo depois do fechamento → quem estava dentro e faltou continua dentro, com falta (−3)', async () => {
    const t = setup();
    await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
    });
    t.state.group = storedGroup({ slots: 3 });

    const res = await t.service.get(OWNER, GROUP_ID, gameId(NOV13));
    expect(personOf(res, D)).toMatchObject({ inside: true, event: 'noShow', points: -3 });
    for (const id of [OWNER, A, R, G]) expect(personOf(res, id)?.inside).toBe(true);
    for (const id of [B, H, E]) expect(personOf(res, id)?.inside).toBe(false);
  });

  it('CMP-14: mais vagas no grupo depois do fechamento → quem estava na fila continua na fila (faltou = 0, sem falta)', async () => {
    const t = setup();
    await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      ...t.rv(NOV13),
      attendance: wire(FULL_NOV13),
      winner: 0,
    });
    t.state.group = storedGroup({ slots: 8 });

    const res = await t.service.get(OWNER, GROUP_ID, gameId(NOV13));
    expect(personOf(res, E)).toMatchObject({ inside: false, event: 'absentQueue', points: 0 });
    for (const id of [B, H, E]) expect(personOf(res, id)?.inside).toBe(false);
    expect(personOf(res, D)).toMatchObject({ inside: true, event: 'noShow', points: -3 });
  });

  it('CMP-15: a correção feita depois de mudar as vagas mantém a lista do 1º fechamento', async () => {
    for (const slots of [3, 8]) {
      const t = setup();
      await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
        ...t.rv(NOV13),
        attendance: wire(FULL_NOV13),
        winner: 0,
      });
      t.state.group = storedGroup({ slots });
      t.clock.now = LATER;

      const res = await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
        ...t.rv(NOV13),
        attendance: wire(FULL_NOV13),
        winner: 1,
      });
      expect(t.writes.at(-1)).toEqual({ op: 'update', gameId: gameId(NOV13) });
      expect(personOf(res, D)).toMatchObject({ inside: true, event: 'noShow', points: -3 });
      expect(personOf(res, E)).toMatchObject({ inside: false, event: 'absentQueue', points: 0 });
      for (const id of [OWNER, A, R, G, D]) expect(personOf(res, id)?.inside).toBe(true);
      for (const id of [B, H, E]) expect(personOf(res, id)?.inside).toBe(false);
      expect(await t.service.get(B, GROUP_ID, gameId(NOV13))).toEqual(res);
    }
  });
});

describe('fechamento com a versão que a tela mostrou (CMP-42)', () => {
  it('CMP-42: jogo não fechado vem com version 0; o 1º fechamento manda 0 e sai com a version 1', async () => {
    const t = setup();
    expect((await t.service.get(OWNER, GROUP_ID, gameId(NOV13))).version).toBe(0);
    const res = await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      version: 0,
      attendance: wire(FULL_NOV13),
    });
    expect(res.version).toBe(1);
    expect((await t.service.get(OWNER, GROUP_ID, gameId(NOV13))).version).toBe(1);
  });

  it('CMP-42: a correção manda a versão do fechamento e soma 1', async () => {
    const t = setup();
    await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      version: 0,
      attendance: wire(FULL_NOV13),
      winner: 0,
    });
    const res = await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      version: 1,
      attendance: wire(FULL_NOV13),
      winner: 1,
    });
    expect(res.version).toBe(2);
    expect(t.store.get(gameId(NOV13))).toMatchObject({ winner: 1, version: 2 });
  });

  it('CMP-42: corrigir com a versão velha → VERSION_CONFLICT (409, currentVersion) e nada é gravado', async () => {
    const t = setup();
    await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      version: 0,
      attendance: wire(FULL_NOV13),
      winner: 0,
    });
    await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      version: 1,
      attendance: wire(FULL_NOV13),
      winner: 1,
    });
    const before = t.store.get(gameId(NOV13));
    const updates = t.writes.filter((w) => w.op === 'update').length;
    const err = await expectAppError(
      t.service.close(A, GROUP_ID, gameId(NOV13), { version: 1, attendance: wire(FULL_NOV13), winner: 0 }),
      'VERSION_CONFLICT',
      409,
    );
    expect(err.details).toEqual({ currentVersion: 2 });
    expect(t.writes.filter((w) => w.op === 'update')).toHaveLength(updates);
    expect(t.store.get(gameId(NOV13))).toEqual(before);
  });

  it('CMP-42: corrigir mandando 0 (a tela viu o jogo aberto) → VERSION_CONFLICT com a versão do fechamento', async () => {
    const t = setup();
    await t.service.close(OWNER, GROUP_ID, gameId(NOV13), {
      version: 0,
      attendance: wire(FULL_NOV13),
      winner: 0,
    });
    const err = await expectAppError(
      t.service.close(A, GROUP_ID, gameId(NOV13), { version: 0, attendance: wire(FULL_NOV13), winner: 1 }),
      'VERSION_CONFLICT',
      409,
    );
    expect(err.details).toEqual({ currentVersion: 1 });
    expect(t.store.get(gameId(NOV13))).toMatchObject({ winner: 0, version: 1 });
  });

  it('CMP-42: o contrato do fechamento exige a version (inteiro ≥ 0)', () => {
    expect(CloseGameInputSchema.safeParse({ attendance: {} }).success).toBe(false);
    expect(CloseGameInputSchema.safeParse({ version: -1, attendance: {} }).success).toBe(false);
    expect(CloseGameInputSchema.safeParse({ version: 0, attendance: {} }).success).toBe(true);
  });
});

// Horários e jogo próprio (`.claude/work/horarios-jogo.md`): os jogos saem do lookup dos jogos do grupo
// (`LOOKUP#GROUP#<g>#GAME`), de todos os horários, e as rotas vão pelo id do jogo.
describe('os jogos de todos os horários (CMP-16, CMP-11)', () => {
  const SAT_SCHEDULE_ID = 'eeeeeeee-0000-4000-8000-000000000002';
  const satGame = (date: string, list: UserId[]): FakeGame => {
    const base = fakeGame(date, list);
    return {
      ...base,
      record: {
        ...base.record,
        id: `${SAT_SCHEDULE_ID}_${date}`,
        scheduleId: SAT_SCHEDULE_ID,
        startsAt: `${date}T12:00:00.000Z`,
        endsAt: `${date}T14:00:00.000Z`,
      },
    };
  };

  it('CMP-16: a lista traz os jogos de cada horário, do mais recente ao mais antigo, cada um com o id do jogo', async () => {
    const t = setup({ games: { ...defaultGames(), '2026-11-07': satGame('2026-11-07', [OWNER, A]) } });
    const list = await t.service.list(OWNER, GROUP_ID);
    for (const game of list) expect(CompetitionGameSchema.parse(game)).toEqual(game);
    expect(list.map((g) => [g.id, g.date])).toEqual([
      [gameId(NOV13), NOV13],
      [`${SAT_SCHEDULE_ID}_2026-11-07`, '2026-11-07'],
      [gameId(NOV06), NOV06],
      [gameId(OCT30), OCT30],
    ]);
  });

  it('CMP-11: o jogo do outro horário é fechado pelo id dele', async () => {
    const t = setup({ games: { ...defaultGames(), '2026-11-07': satGame('2026-11-07', [OWNER, A]) } });
    const satId = `${SAT_SCHEDULE_ID}_2026-11-07`;
    const res = await t.service.close(OWNER, GROUP_ID, satId, {
      version: 0,
      attendance: wire({ [OWNER]: 'present', [A]: 'present' }),
    });
    expect(res).toMatchObject({ id: satId, date: '2026-11-07', closed: true });
    expect(t.store.get(satId)).toMatchObject({ gameId: satId, startsAt: '2026-11-07T12:00:00.000Z' });
  });

  it('CMP-11: o id de um jogo de outro grupo → GAME_NOT_FOUND', async () => {
    const other = fakeGame(NOV13, [OWNER]);
    const t = setup({
      games: {
        ...defaultGames(),
        x: { ...other, record: { ...other.record, id: 'x_2026-11-13', groupId: OTHER_GROUP_ID } },
      },
    });
    await expectAppError(t.service.get(OWNER, GROUP_ID, 'x_2026-11-13'), 'GAME_NOT_FOUND', 404);
  });
});

describe('as vagas do horário arquivado (GRP-66)', () => {
  it('GRP-66: jogo passado de um horário arquivado, com vagas próprias → a lista (dentro/fila) usa as do horário, e não as do grupo', async () => {
    const t = setup({ group: { schedules: [] }, archivedSchedules: { [SCHEDULE_ID]: { slots: 7 } } });
    const res = await t.service.get(OWNER, GROUP_ID, gameId(NOV13));
    // Grupo: 5 vagas; horário: 7. Dentro = os 7 primeiros; só o Edu fica na fila.
    for (const id of [OWNER, A, R, G, D, B, H]) expect(personOf(res, id)?.attendance).toBe('present');
    expect(personOf(res, E)?.attendance).toBe('absent');
  });

  it('GRP-66: sem as vagas no horário arquivado → valem as do grupo', async () => {
    const t = setup({ group: { schedules: [] }, archivedSchedules: { [SCHEDULE_ID]: {} } });
    const res = await t.service.get(OWNER, GROUP_ID, gameId(NOV13));
    for (const id of [B, H, E]) expect(personOf(res, id)?.attendance).toBe('absent');
  });
});
