import { randomUUID } from 'node:crypto';
import { AppError, appError } from '@scorely/api/src/lib/errors';
import { range } from '@scorely/api/src/lib/fn';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import type { NewNotification } from '@scorely/api/src/modules/notifications/notification.service';
import type { StoredPlayer } from '@scorely/api/src/modules/teams/player.repository';
import type {
  StoredTeamSettings,
  TeamSettingsRepository,
} from '@scorely/api/src/modules/teams/settings.repository';
import type { StoredTeams, TeamsRepository } from '@scorely/api/src/modules/teams/teams.repository';
import { createTeamsService } from '@scorely/api/src/modules/teams/teams.service';
import {
  type Attendee,
  type ErrorCode,
  type Game,
  type Gender,
  type GuestGame,
  type MemberRole,
  type Notification,
  type PlayerPosition,
  SaveTeamsInputSchema,
  TEAM_EXTRA_LIMITS,
  type TeamExtra,
  type TeamRule,
  type TeamSettings,
  type Teams,
  TeamsResponseSchema,
  type TeamViolation,
  type User,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// E3 etapa 4 (`.claude/work/e3-times-4.md`): regras do grupo nos times do jogo, TIM-14, 15, 17, 19 e 20.
// O motor (engine/rules.ts e engine/draw.ts) é provado por aqui, pelo service: as assinaturas dele não estão definidas.
// Interface assumida: `createTeamsService` ganha `settings: Pick<TeamSettingsRepository, 'get'>`; o gênero vem do `users.getMany`.
// E3 etapas 5 e 6 (`.claude/work/e3-times-5-6.md`): times opostos (TIM-22), preferência de gênero (TIM-23) e avulsos (TIM-24, TIM-08, 15, 19, 20).
// O fake de `users.getMany` só devolve quem tem conta (como o BatchGet real): o avulso não tem.

const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
/** Membro na fila (Banco). */
const B = '33333333-3333-4333-8333-333333333333';
const R = '88888888-8888-4888-8888-888888888888';
const G = '99999999-9999-4999-8999-999999999999';
/** Convidado na fila. */
const H = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OUTSIDER = '66666666-6666-4666-8666-666666666666';
const E = range(8).map((i) => `dddddddd-dddd-4ddd-8ddd-00000000000${i}`);
const [E0, E1, E2, E3, E4, E5, E6, E7] = E as [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

const DATE = '2026-11-06';
const NOW = new Date('2026-11-05T13:00:00.000Z');

/**
 * Elenco de referência (vôlei misto, 12 dentro):
 * - levantadores principais: E0 e E1 (homens). E2 tem levantador só como 2ª posição (não conta);
 * - mulheres: A, G, E2, E3, E4, E5 (6). Homens: OWNER, R, E0, E1, E6 (5). E7 não informou o gênero.
 */
const GENDERS: Record<string, Gender | undefined> = {
  [OWNER]: 'M',
  [A]: 'F',
  [B]: 'M',
  [R]: 'M',
  [G]: 'F',
  [H]: 'F',
  [E0]: 'M',
  [E1]: 'M',
  [E2]: 'F',
  [E3]: 'F',
  [E4]: 'F',
  [E5]: 'F',
  [E6]: 'M',
  [E7]: undefined,
};

const POSITIONS: Record<string, PlayerPosition[]> = {
  [E0]: ['setter'],
  [E1]: ['setter', 'outside'],
  [E2]: ['outside', 'setter'],
  [E6]: ['middle'],
};

const MEMBERS: Record<string, MemberRole> = {
  [OWNER]: 'member',
  [A]: 'member',
  [B]: 'member',
  [R]: 'reserve',
};

const attendee = (userId: string, role: Attendee['role'], minute: number): Attendee => ({
  userId,
  name: `P-${userId.slice(-2)}`,
  role,
  confirmedAt: new Date(Date.UTC(2026, 10, 4, 22, minute)).toISOString(),
});

const INSIDE = [OWNER, A, G, R, ...E];
const roleIn = (id: string): Attendee['role'] => MEMBERS[id] ?? 'guest';

function gameOf(confirmed: string[], waitlist: string[] = [B, H], extra: Partial<Game> = {}): Game {
  return {
    groupId: GROUP_ID,
    date: DATE,
    startsAt: '2026-11-06T22:00:00.000Z',
    opensAt: '2026-11-04T22:00:00.000Z',
    reservesOpensAt: '2026-11-05T22:00:00.000Z',
    guestsOpensAt: '2026-11-06T10:00:00.000Z',
    status: 'open',
    slots: confirmed.length,
    confirmed: confirmed.map((id, i) => attendee(id, roleIn(id), i)),
    waitlist: waitlist.map((id, i) => attendee(id, roleIn(id), 30 + i)),
    ...extra,
  };
}

const unused = () => Promise.reject(new Error('not used by the teams module'));

function seeded(seed: number): () => number {
  const s = { v: seed >>> 0 };
  return () => {
    s.v = (s.v + 0x6d2b79f5) | 0;
    const a = Math.imul(s.v ^ (s.v >>> 15), 1 | s.v);
    const b = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
    return ((b ^ (b >>> 14)) >>> 0) / 4294967296;
  };
}

const SETTER_ONE: TeamRule = { target: { kind: 'position', position: 'setter' }, min: 1, max: 1 };
const SETTER_MIN: TeamRule = { target: { kind: 'position', position: 'setter' }, min: 1 };
const SETTER_MAX: TeamRule = { target: { kind: 'position', position: 'setter' }, max: 1 };
const WOMEN_TWO: TeamRule = { target: { kind: 'gender', gender: 'F' }, min: 2 };
const WOMEN_ONE: TeamRule = { target: { kind: 'gender', gender: 'F' }, min: 1 };
const MEN_THREE: TeamRule = { target: { kind: 'gender', gender: 'M' }, min: 3 };

function setup(
  opts: {
    game?: Game;
    random?: () => number;
    settings?: Partial<TeamSettings>;
    positions?: Record<string, PlayerPosition[]>;
  } = {},
) {
  const clock = { now: NOW };
  const state = { group: storedGroup(), game: opts.game ?? gameOf(INSIDE) };
  const sent: ({ userId: string } & NewNotification)[] = [];
  const puts: StoredTeams[] = [];
  const teamsStore = new Map<string, StoredTeams>();
  const settingsStore = {
    current: opts.settings ? storedSettings(opts.settings) : (undefined as StoredTeamSettings | undefined),
  };
  const playerPositions = opts.positions ?? POSITIONS;

  const groups: GroupRepository = {
    get: async (id) => (id === state.group.id ? state.group : undefined),
    roleOf: async (groupId, userId) => (groupId === state.group.id ? MEMBERS[userId] : undefined),
    getByToken: unused,
    create: unused,
    addMember: unused,
    counts: unused,
    getMembership: unused,
    setMemberInvite: unused,
    clearMemberInvite: unused,
    acceptMemberInvite: unused,
    listMembers: unused,
    groupsOf: unused,
    rotateToken: unused,
    archive: unused,
    unarchive: unused,
    update: unused,
    removeMember: unused,
  };

  const roster = {
    currentGame: async (_userId: string, groupId: string): Promise<Game> => {
      if (groupId !== state.group.id) throw appError('GROUP_NOT_FOUND');
      return structuredClone(state.game);
    },
    guestView: async (_userId: string, token: string): Promise<GuestGame> => {
      if (token !== state.group.guestToken) throw appError('GAME_LINK_INVALID');
      const g = state.group;
      return {
        group: {
          id: g.id,
          name: g.name,
          sport: g.sport,
          weekday: g.weekday,
          time: g.time,
          timeZone: g.timeZone,
        },
        myRole: 'guest',
        game: structuredClone(state.game),
      };
    },
  };

  const players = {
    getMany: async (groupId: string, userIds: string[]): Promise<StoredPlayer[]> =>
      userIds.flatMap((userId) => {
        const positions = playerPositions[userId];
        return positions
          ? [
              {
                groupId,
                userId,
                positions: [...positions],
                createdAt: NOW.toISOString(),
                updatedAt: NOW.toISOString(),
              },
            ]
          : [];
      }),
  };

  const users = {
    getMany: async (userIds: readonly string[]): Promise<User[]> =>
      userIds
        .filter((id) => id in GENDERS)
        .map((id) => {
          const gender = GENDERS[id];
          return {
            id,
            email: `${id.slice(0, 4)}@x.com`,
            name: `P-${id.slice(-2)}`,
            createdAt: '2026-01-01T00:00:00.000Z',
            ...(gender && { gender }),
          };
        }),
  };

  const notifications = {
    notify: async (userId: string, input: NewNotification): Promise<Notification> => {
      sent.push({ userId, ...input });
      return { id: randomUUID(), createdAt: clock.now.toISOString(), userId, ...input };
    },
  };

  const teams: TeamsRepository = {
    get: async (groupId, date) => {
      const t = teamsStore.get(`${groupId}#${date}`);
      return t ? structuredClone(t) : undefined;
    },
    put: async (t) => {
      puts.push(structuredClone(t));
      teamsStore.set(`${t.groupId}#${t.date}`, structuredClone(t));
    },
    delete: async (groupId, date) => {
      teamsStore.delete(`${groupId}#${date}`);
    },
  };

  const settings: Pick<TeamSettingsRepository, 'get'> = {
    get: async (groupId) =>
      groupId === GROUP_ID && settingsStore.current ? structuredClone(settingsStore.current) : undefined,
  };

  const service = createTeamsService({
    groups,
    roster,
    players,
    users,
    notifications,
    teams,
    settings,
    now: () => clock.now,
    random: opts.random ?? seeded(42),
  });

  const setSettings = (s: Partial<TeamSettings>) => {
    settingsStore.current = storedSettings(s);
  };
  const seedTeams = (extra: Partial<StoredTeams> = {}) =>
    teamsStore.set(`${GROUP_ID}#${DATE}`, {
      groupId: GROUP_ID,
      date: DATE,
      status: 'draft',
      teams: [[], []],
      positions: {},
      pinned: [],
      createdAt: '2026-11-04T00:00:00.000Z',
      updatedAt: '2026-11-04T00:00:00.000Z',
      ...extra,
    });
  const stored = () => teamsStore.get(`${GROUP_ID}#${DATE}`);
  return { clock, state, sent, puts, service, setSettings, seedTeams, stored };
}

function storedGroup(): StoredGroup {
  return {
    id: GROUP_ID,
    createdAt: '2026-01-01T00:00:00.000Z',
    name: 'Vôlei de sexta',
    sport: 'volleyball',
    weekday: 5,
    time: '19:00',
    timeZone: 'America/Sao_Paulo',
    slots: 12,
    listOpensHoursBefore: 48,
    reservesOpenHoursBefore: 24,
    guestsOpenHoursBefore: 12,
    ownerId: OWNER,
    inviteToken: 'tok-member',
    reserveInviteToken: 'tok-reserve',
    guestToken: 'tok-guest',
    maxMembers: 30,
    maxReserves: 30,
  };
}

function storedSettings(s: Partial<TeamSettings>): StoredTeamSettings {
  return {
    groupId: GROUP_ID,
    teamCount: 2,
    rules: [],
    allowOutsideRules: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...s,
  };
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

const ids = (list: { userId: string }[]) => list.map((x) => x.userId);
const teamIds = (t: Teams | null) => (t ? t.teams.map(ids) : []);
const countIn = (team: string[], group: string[]) => team.filter((id) => group.includes(id)).length;
const SETTERS = [E0, E1];
const WOMEN = [A, G, E2, E3, E4, E5];
const SEEDS = range(30).map((i) => i * 7919 + 3);

/** Mesmo conteúdo, em qualquer ordem. */
function expectSameViolations(actual: TeamViolation[] | undefined, expected: TeamViolation[]) {
  expect(actual ?? []).toHaveLength(expected.length);
  expect(actual ?? []).toEqual(expect.arrayContaining(expected));
}

describe('quantidade padrão de times (TIM-14, TIM-15, TIM-17)', () => {
  it('TIM-14: dono sem times recebe a quantidade padrão do grupo (sem configuração, 2); os outros não', async () => {
    const t = setup();
    const res = await t.service.get(OWNER, GROUP_ID, DATE);
    expect(TeamsResponseSchema.parse(res)).toEqual(res);
    expect(res).toEqual({ teams: null, defaultTeamCount: 2 });

    t.setSettings({ teamCount: 3 });
    expect(await t.service.get(OWNER, GROUP_ID, DATE)).toEqual({ teams: null, defaultTeamCount: 3 });
    for (const who of [A, R]) expect(await t.service.get(who, GROUP_ID, DATE)).toEqual({ teams: null });
    expect(await t.service.guestGet(OUTSIDER, 'tok-guest')).toEqual({ teams: null });
  });

  it('TIM-15: sem times salvos, o sorteio usa a quantidade padrão do grupo', async () => {
    const t = setup({ settings: { teamCount: 3 } });
    const res = await t.service.draw(OWNER, GROUP_ID, DATE);
    expect(teamIds(res.teams).map((team) => team.length)).toEqual([4, 4, 4]);
  });

  it('TIM-15: com times salvos, o sorteio usa a quantidade atual, não a padrão', async () => {
    const t = setup({ settings: { teamCount: 4 } });
    t.seedTeams({ teams: [[], []] });
    const res = await t.service.draw(OWNER, GROUP_ID, DATE);
    expect(teamIds(res.teams).map((team) => team.length)).toEqual([6, 6]);
  });

  it('TIM-17: mudar a configuração não mexe nos times já montados', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[E0, E1], [A]], positions: {} });
    const before = structuredClone(t.stored());
    t.setSettings({ teamCount: 4, rules: [SETTER_ONE] });

    const res = await t.service.get(OWNER, GROUP_ID, DATE);
    expect(teamIds(res.teams)).toEqual([[E0, E1], [A]]);
    expect(t.stored()).toEqual(before);
  });
});

describe('o sorteio cumpre as regras (TIM-19)', () => {
  it('TIM-19: caso de referência: 1 levantador por time, 2 times → sempre um em cada, em todo sorteio', async () => {
    for (const seed of SEEDS) {
      const t = setup({ settings: { rules: [SETTER_ONE] }, random: seeded(seed) });
      const res = await t.service.draw(OWNER, GROUP_ID, DATE);
      const teams = teamIds(res.teams);
      expect(teams.map((team) => team.length)).toEqual([6, 6]);
      for (const team of teams) expect(countIn(team, SETTERS)).toBe(1);
    }
  });

  it('TIM-19: levantador 1 por time e no mínimo 2 mulheres → todo sorteio cumpre as duas', async () => {
    for (const seed of SEEDS) {
      const t = setup({ settings: { rules: [SETTER_ONE, WOMEN_TWO] }, random: seeded(seed) });
      const res = await t.service.draw(OWNER, GROUP_ID, DATE);
      for (const team of teamIds(res.teams)) {
        expect(countIn(team, SETTERS)).toBe(1);
        expect(countIn(team, WOMEN)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('TIM-19: com regras, o sorteio ainda varia (sortear de novo pode dar outro resultado)', async () => {
    const t = setup({ settings: { rules: [SETTER_ONE] }, random: seeded(7) });
    const results = new Set<string>();
    for (const _ of range(10)) {
      const res = await t.service.draw(OWNER, GROUP_ID, DATE);
      results.add(JSON.stringify(teamIds(res.teams).map((team) => [...team].sort())));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('TIM-19: os fixados contam para o time em que estão (levantador fixo no Time 1 → o outro vai sempre para o Time 2)', async () => {
    for (const seed of SEEDS) {
      const t = setup({ settings: { rules: [SETTER_ONE] }, random: seeded(seed) });
      t.seedTeams({ teams: [[E0], []], pinned: [E0] });
      const res = await t.service.draw(OWNER, GROUP_ID, DATE);
      expect(teamIds(res.teams)[0]).toContain(E0);
      expect(teamIds(res.teams)[1]).toContain(E1);
    }
  });

  it('TIM-19: a principal com o ajuste do jogo (TIM-13) conta: 3 times com o E6 levantando hoje → um levantador em cada', async () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const t = setup({ settings: { rules: [SETTER_ONE] }, random: seeded(seed) });
      t.seedTeams({ teams: [[], [], []], positions: { [E6]: ['setter', 'middle'] } });
      const res = await t.service.draw(OWNER, GROUP_ID, DATE);
      for (const team of teamIds(res.teams)) expect(countIn(team, [E0, E1, E6])).toBe(1);
    }
  });

  it('TIM-19: o sorteio guarda uma cópia das regras que usou; mudar a configuração depois não muda a cópia', async () => {
    const t = setup({ settings: { rules: [SETTER_ONE, WOMEN_TWO] } });
    await t.service.draw(OWNER, GROUP_ID, DATE);
    expect(t.stored()?.rules).toEqual([SETTER_ONE, WOMEN_TWO]);

    t.setSettings({ rules: [WOMEN_ONE] });
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[E0], [E1]], positions: {} });
    expect(t.stored()?.rules).toEqual([SETTER_ONE, WOMEN_TWO]);

    await t.service.draw(OWNER, GROUP_ID, DATE);
    expect(t.stored()?.rules).toEqual([WOMEN_ONE]);
  });
});

describe('o sorteio não sorteia quando as regras não dão (TIM-19)', () => {
  async function conflictsOf(t: ReturnType<typeof setup>) {
    const err = await expectAppError(t.service.draw(OWNER, GROUP_ID, DATE), 'TEAM_RULES_CONFLICT', 422);
    return (err.details as { conflicts: unknown[] }).conflicts;
  }

  it('TIM-19: falta gente: 1 levantador por time com 3 times precisa de 3, e o sorteio tem 2', async () => {
    const t = setup({ settings: { teamCount: 3, rules: [SETTER_MIN] } });
    expect(await conflictsOf(t)).toEqual([
      { reason: 'not_enough', rule: SETTER_MIN, needed: 3, available: 2 },
    ]);
    expect(t.puts).toEqual([]);
    expect(t.stored()).toBeUndefined();
  });

  it('TIM-19: sobra gente: no máximo 1 levantador por time com 2 times cabe 2, e o sorteio tem 3', async () => {
    const t = setup({ settings: { rules: [SETTER_MAX] } });
    t.seedTeams({ positions: { [E6]: ['setter'] } });
    expect(await conflictsOf(t)).toEqual([
      { reason: 'too_many', rule: SETTER_MAX, capacity: 2, available: 3 },
    ]);
  });

  it('TIM-19: fixados: o Time 1 tem 2 levantadores fixados, e o máximo é 1', async () => {
    const t = setup({ settings: { rules: [SETTER_ONE] } });
    t.seedTeams({ teams: [[E0, E1], []], pinned: [E0, E1] });
    expect(await conflictsOf(t)).toEqual([{ reason: 'pinned', rule: SETTER_ONE, team: 1, count: 2 }]);
  });

  it('TIM-19: as regras não fecham juntas: cada uma dá sozinha, mas não com os fixados e os tamanhos', async () => {
    // 4 dentro, 2 times de 2. Os 2 levantadores (homens) fixados no Time 1; sobram 2 mulheres para o Time 2.
    // "1 levantador por time" precisa de 2 e há 2; "1 mulher por time" precisa de 2 e há 2. Juntas, não dá.
    const t = setup({
      game: gameOf([E0, E1, A, G], []),
      settings: { rules: [SETTER_MIN, WOMEN_ONE] },
    });
    t.seedTeams({ teams: [[E0, E1], []], pinned: [E0, E1] });
    expect(await conflictsOf(t)).toEqual([{ reason: 'unsolvable' }]);
  });

  it('TIM-19: lista tudo o que impede, não só o primeiro', async () => {
    const t = setup({ settings: { teamCount: 3, rules: [SETTER_MIN, MEN_THREE] } });
    const conflicts = await conflictsOf(t);
    expect(conflicts).toHaveLength(2);
    expect(conflicts).toEqual(
      expect.arrayContaining([
        { reason: 'not_enough', rule: SETTER_MIN, needed: 3, available: 2 },
        { reason: 'not_enough', rule: MEN_THREE, needed: 9, available: 5 },
      ]),
    );
  });

  it('TIM-19 / TIM-18: só a principal no jogo conta (E2 tem levantador como 2ª posição e não entra na conta)', async () => {
    const t = setup({ settings: { teamCount: 3, rules: [SETTER_MIN] } });
    const conflicts = await conflictsOf(t);
    expect(conflicts).toEqual([expect.objectContaining({ reason: 'not_enough', available: 2 })]);
  });

  it('TIM-19 / TIM-18: quem não informou o gênero não conta (5 homens, E7 sem gênero → 3 por time em 2 times não dá)', async () => {
    const t = setup({ settings: { rules: [MEN_THREE] } });
    expect(await conflictsOf(t)).toEqual([
      { reason: 'not_enough', rule: MEN_THREE, needed: 6, available: 5 },
    ]);
  });

  it('TIM-19 / TIM-18: fixado que saiu da lista fica no time, mas não conta para a regra', async () => {
    const t = setup({ settings: { rules: [SETTER_MIN] } });
    t.seedTeams({ teams: [[E0], []], pinned: [E0] });
    t.state.game = gameOf(INSIDE.filter((id) => id !== E0));
    expect(await conflictsOf(t)).toEqual([
      { reason: 'not_enough', rule: SETTER_MIN, needed: 2, available: 1 },
    ]);
  });

  it('TIM-19: quando não dá, nada muda: times publicados continuam publicados e iguais', async () => {
    const t = setup({ settings: { teamCount: 3, rules: [SETTER_MIN] } });
    t.seedTeams({
      teams: [[OWNER, A], [G], [R]],
      status: 'published',
      publishedAt: '2026-11-04T00:00:00.000Z',
    });
    const before = structuredClone(t.stored());
    await conflictsOf(t);
    expect(t.puts).toEqual([]);
    expect(t.stored()).toEqual(before);
    expect(teamIds((await t.service.get(A, GROUP_ID, DATE)).teams)).toEqual([[OWNER, A], [G], [R]]);
  });
});

describe('montar à mão com regras (TIM-20)', () => {
  const OUTSIDE = {
    teams: [
      [OWNER, E0, E1],
      [A, G],
    ],
    positions: {},
  };
  const OUTSIDE_VIOLATIONS: TeamViolation[] = [
    { kind: 'count', team: 1, rule: SETTER_ONE, count: 2 },
    { kind: 'count', team: 2, rule: SETTER_ONE, count: 0 },
  ];

  it('TIM-20: o rascunho salva fora das regras, e o dono vê o que está fora em cada time', async () => {
    const t = setup({ settings: { rules: [SETTER_ONE] } });
    const res = await t.service.save(OWNER, GROUP_ID, DATE, OUTSIDE);

    expect(TeamsResponseSchema.parse(res)).toEqual(res);
    expect(res.teams?.status).toBe('draft');
    expect(t.stored()?.teams).toEqual(OUTSIDE.teams);
    expectSameViolations(res.teams?.violations, OUTSIDE_VIOLATIONS);
    expectSameViolations((await t.service.get(OWNER, GROUP_ID, DATE)).teams?.violations, OUTSIDE_VIOLATIONS);
  });

  it('TIM-20: dentro das regras, nada aparece como fora', async () => {
    const t = setup({ settings: { rules: [SETTER_ONE, WOMEN_ONE] } });
    const res = await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [
        [E0, A],
        [E1, G],
      ],
      positions: {},
    });
    expect(res.teams?.violations ?? []).toEqual([]);
  });

  it('TIM-20: gênero conta pelo perfil; quem não informou não conta; "sem time" não conta', async () => {
    const t = setup({ settings: { rules: [WOMEN_TWO] } });
    const res = await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [
        [A, G, E3],
        [E2, E7],
      ],
      positions: {},
    });
    // E4 e E5 estão dentro, mas sem time.
    expectSameViolations(res.teams?.violations, [{ kind: 'count', team: 2, rule: WOMEN_TWO, count: 1 }]);
  });

  it('TIM-20 / TIM-18: a principal do jogo (TIM-13) conta, e a 2ª posição não', async () => {
    const t = setup({ settings: { rules: [SETTER_MIN] } });
    const without = await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[E0], [E2]], positions: {} });
    expectSameViolations(without.teams?.violations, [{ kind: 'count', team: 2, rule: SETTER_MIN, count: 0 }]);

    const adjusted = await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [[E0], [E2]],
      positions: { [E2]: ['setter', 'outside'] },
    });
    expect(adjusted.teams?.violations ?? []).toEqual([]);
  });

  it('TIM-20 / TIM-18: quem saiu da lista continua no time, mas não conta', async () => {
    const t = setup({ settings: { rules: [SETTER_MIN] } });
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[E0], [E1]], positions: {} });
    t.state.game = gameOf(INSIDE.filter((id) => id !== E1));
    const res = await t.service.get(OWNER, GROUP_ID, DATE);
    expect(teamIds(res.teams)[1]).toContain(E1);
    expectSameViolations(res.teams?.violations, [{ kind: 'count', team: 2, rule: SETTER_MIN, count: 0 }]);
  });

  it('TIM-20: quem veio do Banco e foi posto num time conta', async () => {
    const t = setup({ settings: { rules: [WOMEN_ONE] } });
    const res = await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[A], [H]], positions: {} });
    expect(res.teams?.violations ?? []).toEqual([]);
  });

  it('TIM-20 / TIM-17: o que aparece como fora segue a configuração atual, não a cópia do sorteio', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, OUTSIDE);
    t.setSettings({ rules: [SETTER_ONE] });
    expectSameViolations((await t.service.get(OWNER, GROUP_ID, DATE)).teams?.violations, OUTSIDE_VIOLATIONS);
  });

  it('TIM-20: publicar fora das regras com a configuração desligada → TEAM_RULES_VIOLATED (422) com o que está fora, sem publicar nem avisar', async () => {
    const t = setup({ settings: { rules: [SETTER_ONE] } });
    await t.service.save(OWNER, GROUP_ID, DATE, OUTSIDE);
    const err = await expectAppError(t.service.publish(OWNER, GROUP_ID, DATE), 'TEAM_RULES_VIOLATED', 422);

    expectSameViolations((err.details as { violations: TeamViolation[] }).violations, OUTSIDE_VIOLATIONS);
    expect(t.stored()?.status).toBe('draft');
    expect(t.stored()?.publishedAt).toBeUndefined();
    expect(t.sent).toEqual([]);
    expect(await t.service.get(A, GROUP_ID, DATE)).toEqual({ teams: null });
  });

  it('TIM-20: com a configuração ligada, publica fora das regras (e o dono continua vendo o que está fora)', async () => {
    const t = setup({ settings: { rules: [SETTER_ONE], allowOutsideRules: true } });
    await t.service.save(OWNER, GROUP_ID, DATE, OUTSIDE);
    const res = await t.service.publish(OWNER, GROUP_ID, DATE);

    expect(res.teams?.status).toBe('published');
    expect(t.sent.length).toBeGreaterThan(0);
    expectSameViolations(res.teams?.violations, OUTSIDE_VIOLATIONS);
  });

  it('TIM-20: publicar dentro das regras funciona com a configuração desligada', async () => {
    const t = setup({ settings: { rules: [SETTER_ONE] } });
    await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [
        [E0, A],
        [E1, G],
      ],
      positions: {},
    });
    expect((await t.service.publish(OWNER, GROUP_ID, DATE)).teams?.status).toBe('published');
  });

  it('TIM-20: depois de publicados, mudanças fora das regras salvam sempre e continuam publicadas, apontando o que ficou fora', async () => {
    const t = setup({ settings: { rules: [SETTER_ONE] } });
    await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [
        [E0, A],
        [E1, G],
      ],
      positions: {},
    });
    await t.service.publish(OWNER, GROUP_ID, DATE);
    const res = await t.service.save(OWNER, GROUP_ID, DATE, OUTSIDE);

    expect(res.teams?.status).toBe('published');
    expect(t.stored()?.teams).toEqual(OUTSIDE.teams);
    expectSameViolations(res.teams?.violations, OUTSIDE_VIOLATIONS);
  });

  it('TIM-20: quem não é dono não vê o que está fora (membros e link do jogo)', async () => {
    const t = setup({ settings: { rules: [SETTER_ONE], allowOutsideRules: true } });
    await t.service.save(OWNER, GROUP_ID, DATE, OUTSIDE);
    await t.service.publish(OWNER, GROUP_ID, DATE);

    for (const res of [
      await t.service.get(A, GROUP_ID, DATE),
      await t.service.get(R, GROUP_ID, DATE),
      await t.service.guestGet(OUTSIDER, 'tok-guest'),
    ]) {
      expect(teamIds(res.teams)).toEqual(OUTSIDE.teams);
      expect(res.teams?.violations).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// E3 etapas 5 e 6: times opostos (TIM-22), preferência de gênero (TIM-23) e avulsos (TIM-24).
// ---------------------------------------------------------------------------------------------------------------

/** Avulsos (TIM-24): o id vem do web. */
const X1 = 'eeeeeeee-eeee-4eee-8eee-000000000001';
const X2 = 'eeeeeeee-eeee-4eee-8eee-000000000002';
const ZE: TeamExtra = { id: X1, name: 'Zé', gender: 'M', positions: ['setter'] };
const LU: TeamExtra = { id: X2, name: 'Lu', gender: 'F', positions: [] };

const MEN = [OWNER, R, E0, E1, E6];
const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
const sortedPeople = <T extends { people?: string[] }>(x: T) =>
  x.people ? { ...x, people: [...x.people].sort() } : x;
/** Conflitos e violações comparados sem depender da ordem das pessoas. */
const normalized = (xs: readonly object[] | undefined) =>
  (xs ?? []).map((x) => sortedPeople(x as { people?: string[] }));
const sortedIds = (xs: string[]) => [...xs].sort();

async function conflictsOfDraw(t: ReturnType<typeof setup>) {
  const err = await expectAppError(t.service.draw(OWNER, GROUP_ID, DATE), 'TEAM_RULES_CONFLICT', 422);
  return normalized((err.details as { conflicts: object[] }).conflicts);
}

describe('times opostos no sorteio (TIM-22, TIM-19)', () => {
  it('TIM-22: um par em times diferentes: em todo sorteio, Ana e Gabi nunca caem juntas', async () => {
    for (const seed of SEEDS) {
      const t = setup({ settings: { apart: [{ people: [A, G] }] }, random: seeded(seed) });
      const teams = teamIds((await t.service.draw(OWNER, GROUP_ID, DATE)).teams);
      expect(teams.map((team) => team.length)).toEqual([6, 6]);
      for (const team of teams) expect(countIn(team, [A, G])).toBeLessThanOrEqual(1);
    }
  });

  it('TIM-22: um conjunto de 3 com 3 times: uma pessoa em cada time', async () => {
    for (const seed of SEEDS) {
      const t = setup({ settings: { teamCount: 3, apart: [{ people: [A, G, E2] }] }, random: seeded(seed) });
      for (const team of teamIds((await t.service.draw(OWNER, GROUP_ID, DATE)).teams))
        expect(countIn(team, [A, G, E2])).toBe(1);
    }
  });

  it('TIM-22: a mesma pessoa em duas regras (Ana × Gabi e Ana × E2) e as regras de quantidade: o sorteio cumpre todas', async () => {
    for (const seed of SEEDS) {
      const t = setup({
        settings: { rules: [SETTER_ONE, WOMEN_TWO], apart: [{ people: [A, G] }, { people: [A, E2] }] },
        random: seeded(seed),
      });
      const teams = teamIds((await t.service.draw(OWNER, GROUP_ID, DATE)).teams);
      for (const team of teams) {
        expect(countIn(team, [A, G])).toBeLessThanOrEqual(1);
        expect(countIn(team, [A, E2])).toBeLessThanOrEqual(1);
        expect(countIn(team, SETTERS)).toBe(1);
        expect(countIn(team, WOMEN)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('TIM-22: com os fixados, quem está na regra vai para o outro time (Ana fixa no Time 1 → Gabi sempre no Time 2)', async () => {
    for (const seed of SEEDS) {
      const t = setup({ settings: { apart: [{ people: [A, G] }] }, random: seeded(seed) });
      t.seedTeams({ teams: [[A], []], pinned: [A] });
      const teams = teamIds((await t.service.draw(OWNER, GROUP_ID, DATE)).teams);
      expect(teams[0]).toContain(A);
      expect(teams[1]).toContain(G);
    }
  });

  it('TIM-22: quem não está no sorteio não conta (Banco fora dos times, fora do grupo): sorteia sem conflito', async () => {
    const t = setup({
      settings: { apart: [{ people: [A, G, B] }, { people: [E0, OUTSIDER] }, { people: [H, OUTSIDER] }] },
    });
    const teams = teamIds((await t.service.draw(OWNER, GROUP_ID, DATE)).teams);
    expect(teams.flat()).not.toContain(B);
    for (const team of teams) expect(countIn(team, [A, G])).toBeLessThanOrEqual(1);
  });

  it('TIM-22: quem saiu da lista não conta: Ana × Gabi × E2 com 2 times e a E2 desistiu → sorteia, sem aviso', async () => {
    const t = setup({ settings: { apart: [{ people: [A, G, E2] }] } });
    t.state.game = gameOf(INSIDE.filter((id) => id !== E2));
    const res = await t.service.draw(OWNER, GROUP_ID, DATE);
    for (const team of teamIds(res.teams)) expect(countIn(team, [A, G])).toBeLessThanOrEqual(1);
  });

  it('TIM-19 / TIM-22: times opostos com mais gente que times: Ana, Gabi e E2 precisam de 3 times, e o jogo tem 2', async () => {
    const t = setup({ settings: { apart: [{ people: [A, G, E2] }] } });
    expect(await conflictsOfDraw(t)).toEqual([
      { reason: 'apart_too_many', people: sortedIds([A, G, E2]), teams: 2 },
    ]);
    expect(t.puts).toEqual([]);
    expect(t.stored()).toBeUndefined();
  });

  it('TIM-19 / TIM-22: na conta de "mais gente que times" entra só quem está no sorteio (o do Banco posto num time conta)', async () => {
    const onlyTwo = setup({ settings: { apart: [{ people: [A, G, B] }] } });
    expect((await onlyTwo.service.draw(OWNER, GROUP_ID, DATE)).teams).not.toBeNull();

    const withBench = setup({ settings: { apart: [{ people: [A, G, B] }] } });
    withBench.seedTeams({ teams: [[B], []] });
    expect(await conflictsOfDraw(withBench)).toEqual([
      { reason: 'apart_too_many', people: sortedIds([A, G, B]), teams: 2 },
    ]);
  });

  it('TIM-19 / TIM-22: times opostos fixados juntos: Ana e Gabi estão fixadas no Time 1', async () => {
    const t = setup({ settings: { apart: [{ people: [A, G] }] } });
    t.seedTeams({ teams: [[A, G], []], pinned: [A, G] });
    expect(await conflictsOfDraw(t)).toEqual([
      { reason: 'apart_pinned', people: sortedIds([A, G]), team: 1 },
    ]);
  });

  it('TIM-19 / TIM-22: os conflitos de opostos vêm junto com os de quantidade (lista tudo)', async () => {
    const t = setup({ settings: { teamCount: 3, rules: [SETTER_MIN], apart: [{ people: [A, G, E2, E3] }] } });
    const conflicts = await conflictsOfDraw(t);
    expect(conflicts).toHaveLength(2);
    expect(conflicts).toEqual(
      expect.arrayContaining([
        { reason: 'not_enough', rule: SETTER_MIN, needed: 3, available: 2 },
        { reason: 'apart_too_many', people: sortedIds([A, G, E2, E3]), teams: 3 },
      ]),
    );
  });

  it('TIM-19 / TIM-22: o sorteio guarda uma cópia dos times opostos que usou; mudar a configuração depois não muda a cópia', async () => {
    const t = setup({ settings: { apart: [{ people: [A, G] }] } });
    await t.service.draw(OWNER, GROUP_ID, DATE);
    expect(t.stored()).toMatchObject({ apart: [{ people: [A, G] }] });

    t.setSettings({ apart: [{ people: [E0, E1] }] });
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[A], [G]], positions: {} });
    expect(t.stored()).toMatchObject({ apart: [{ people: [A, G] }] });

    await t.service.draw(OWNER, GROUP_ID, DATE);
    expect(t.stored()).toMatchObject({ apart: [{ people: [E0, E1] }] });
  });
});

describe('times opostos montando à mão (TIM-22, TIM-20)', () => {
  const TOGETHER = { teams: [[A, G, OWNER], [E0]], positions: {} };

  it('TIM-20 / TIM-22: o dono vê, no time, quem devia estar em times diferentes; o rascunho salva', async () => {
    const t = setup({ settings: { apart: [{ people: [A, G] }] } });
    const res = await t.service.save(OWNER, GROUP_ID, DATE, TOGETHER);
    expect(TeamsResponseSchema.parse(res)).toEqual(res);
    expect(t.stored()?.teams).toEqual(TOGETHER.teams);
    expect(normalized(res.teams?.violations)).toEqual([
      { kind: 'apart', team: 1, people: sortedIds([A, G]) },
    ]);
    expect(normalized((await t.service.get(OWNER, GROUP_ID, DATE)).teams?.violations)).toEqual([
      { kind: 'apart', team: 1, people: sortedIds([A, G]) },
    ]);
  });

  it('TIM-20 / TIM-22: num conjunto, aponta só quem está junto, em cada time', async () => {
    const t = setup({ settings: { teamCount: 3, apart: [{ people: [A, G, E2, E3] }] } });
    const res = await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [[A, G], [E2, E3], [E4]],
      positions: {},
    });
    expect(normalized(res.teams?.violations)).toEqual(
      expect.arrayContaining([
        { kind: 'apart', team: 1, people: sortedIds([A, G]) },
        { kind: 'apart', team: 2, people: sortedIds([E2, E3]) },
      ]),
    );
    expect(res.teams?.violations).toHaveLength(2);

    const three = await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [[A, G, E2], [E3], []],
      positions: {},
    });
    expect(normalized(three.teams?.violations)).toEqual([
      { kind: 'apart', team: 1, people: sortedIds([A, G, E2]) },
    ]);
  });

  it('TIM-20 / TIM-22: em times diferentes, nada aparece; quem saiu da lista não conta', async () => {
    const t = setup({ settings: { apart: [{ people: [A, G] }] } });
    expect(
      (await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[A], [G]], positions: {} })).teams?.violations ??
        [],
    ).toEqual([]);

    await t.service.save(OWNER, GROUP_ID, DATE, TOGETHER);
    t.state.game = gameOf(INSIDE.filter((id) => id !== G));
    const res = await t.service.get(OWNER, GROUP_ID, DATE);
    expect(teamIds(res.teams)[0]).toContain(G);
    expect(res.teams?.violations ?? []).toEqual([]);
  });

  it('TIM-20 / TIM-22: publicar com opostos juntos e a configuração desligada → TEAM_RULES_VIOLATED; ligada, publica', async () => {
    const t = setup({ settings: { apart: [{ people: [A, G] }] } });
    await t.service.save(OWNER, GROUP_ID, DATE, TOGETHER);
    const err = await expectAppError(t.service.publish(OWNER, GROUP_ID, DATE), 'TEAM_RULES_VIOLATED', 422);
    expect(normalized((err.details as { violations: object[] }).violations)).toEqual([
      { kind: 'apart', team: 1, people: sortedIds([A, G]) },
    ]);
    expect(t.stored()?.status).toBe('draft');
    expect(t.sent).toEqual([]);

    t.setSettings({ apart: [{ people: [A, G] }], allowOutsideRules: true });
    expect((await t.service.publish(OWNER, GROUP_ID, DATE)).teams?.status).toBe('published');
  });

  it('TIM-20 / TIM-22: quem não é dono não vê os opostos fora das regras', async () => {
    const t = setup({ settings: { apart: [{ people: [A, G] }], allowOutsideRules: true } });
    await t.service.save(OWNER, GROUP_ID, DATE, TOGETHER);
    await t.service.publish(OWNER, GROUP_ID, DATE);
    for (const res of [
      await t.service.get(A, GROUP_ID, DATE),
      await t.service.guestGet(OUTSIDER, 'tok-guest'),
    ])
      expect(res.teams?.violations).toBeUndefined();
  });
});

describe('preferência: espalhar homens e mulheres (TIM-23)', () => {
  const gendersOf = (team: string[]) => ({ M: countIn(team, MEN), F: countIn(team, WOMEN) });

  it('TIM-23: ligada, em todo sorteio a diferença de homens entre os times é de no máximo 1, e a de mulheres também', async () => {
    for (const teamCount of [2, 3])
      for (const seed of SEEDS) {
        const t = setup({ settings: { teamCount, spreadGender: true }, random: seeded(seed) });
        const teams = teamIds((await t.service.draw(OWNER, GROUP_ID, DATE)).teams);
        expect(spread(teams.map((team) => countIn(team, MEN)))).toBeLessThanOrEqual(1);
        expect(spread(teams.map((team) => countIn(team, WOMEN)))).toBeLessThanOrEqual(1);
        expect(spread(teams.map((team) => team.length))).toBeLessThanOrEqual(1);
      }
  });

  it('TIM-23 / TIM-19: nunca quebra uma regra: 1 levantador por time e times opostos continuam cumpridos, e os gêneros espalhados', async () => {
    for (const seed of SEEDS) {
      const t = setup({
        settings: { rules: [SETTER_ONE], apart: [{ people: [A, G] }], spreadGender: true },
        random: seeded(seed),
      });
      const teams = teamIds((await t.service.draw(OWNER, GROUP_ID, DATE)).teams);
      for (const team of teams) {
        expect(countIn(team, SETTERS)).toBe(1);
        expect(countIn(team, [A, G])).toBeLessThanOrEqual(1);
      }
      expect(spread(teams.map((team) => countIn(team, MEN)))).toBeLessThanOrEqual(1);
      expect(spread(teams.map((team) => countIn(team, WOMEN)))).toBeLessThanOrEqual(1);
    }
  });

  it('TIM-23 / TIM-16: os fixados não deixam espalhar → o sorteio fica com o mais perto possível, sem conflito e sem mover fixado', async () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const t = setup({ settings: { spreadGender: true }, random: seeded(seed) });
      t.seedTeams({ teams: [[A, G, E2, E3], []], pinned: [A, G, E2, E3] });
      const teams = teamIds((await t.service.draw(OWNER, GROUP_ID, DATE)).teams);
      expect(sortedIds(teams[0] ?? [])).toEqual(expect.arrayContaining(sortedIds([A, G, E2, E3])));
      // Sobram 2 mulheres: as duas vão para o Time 2 (4 × 2 é o mais perto possível).
      expect(countIn(teams[1] ?? [], [E4, E5])).toBe(2);
    }
  });

  it('TIM-23: com ela ligada, cada time mostra quantos homens e mulheres tem (quem não informou não conta), para o dono, os membros e o link do jogo', async () => {
    const t = setup({ settings: { spreadGender: true } });
    const drawn = await t.service.draw(OWNER, GROUP_ID, DATE);
    expect(TeamsResponseSchema.parse(drawn)).toEqual(drawn);
    expect(drawn.teams?.genders).toEqual(teamIds(drawn.teams).map(gendersOf));

    await t.service.publish(OWNER, GROUP_ID, DATE);
    for (const res of [
      await t.service.get(OWNER, GROUP_ID, DATE),
      await t.service.get(A, GROUP_ID, DATE),
      await t.service.get(R, GROUP_ID, DATE),
      await t.service.guestGet(OUTSIDER, 'tok-guest'),
    ])
      expect(res.teams?.genders).toEqual(teamIds(drawn.teams).map(gendersOf));
  });

  it('TIM-23: desligada, nenhum time mostra homens e mulheres', async () => {
    const t = setup({ settings: { allowOutsideRules: true } });
    await t.service.draw(OWNER, GROUP_ID, DATE);
    await t.service.publish(OWNER, GROUP_ID, DATE);
    for (const res of [await t.service.get(OWNER, GROUP_ID, DATE), await t.service.get(A, GROUP_ID, DATE)])
      expect(res.teams?.genders).toBeUndefined();
  });

  it('TIM-23 / TIM-20: montando à mão, o dono vê os números, mas a preferência nunca aparece como fora das regras nem bloqueia publicar', async () => {
    const t = setup({ settings: { spreadGender: true } });
    const res = await t.service.save(OWNER, GROUP_ID, DATE, { teams: [WOMEN, MEN], positions: {} });
    expect(res.teams?.genders).toEqual([
      { M: 0, F: 6 },
      { M: 5, F: 0 },
    ]);
    expect(res.teams?.violations ?? []).toEqual([]);
    expect((await t.service.publish(OWNER, GROUP_ID, DATE)).teams?.status).toBe('published');
  });

  it('TIM-23 / TIM-24: o gênero do avulso conta nos números', async () => {
    const t = setup({ settings: { spreadGender: true } });
    const res = await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [
        [A, X1],
        [X2, E7],
      ],
      positions: {},
      extras: [ZE, LU],
    });
    expect(res.teams?.genders).toEqual([
      { M: 1, F: 1 },
      { M: 0, F: 1 },
    ]);
  });
});

describe('avulso: pessoa sem conta só neste jogo (TIM-24, TIM-08)', () => {
  const ZE_VIEW = {
    userId: X1,
    name: 'Zé',
    role: 'guest',
    positions: ['setter'],
    adjusted: false,
    inList: true,
    bench: false,
    pinned: false,
    extra: true,
  };

  it('TIM-24 / TIM-08: o dono salva um avulso num time e outro sem time; o dono vê os dois marcados como avulso', async () => {
    const t = setup();
    const res = await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [[A, X1], [G]],
      positions: {},
      extras: [ZE, LU],
    });
    expect(TeamsResponseSchema.parse(res)).toEqual(res);
    expect(res.teams?.teams[0]?.[1]).toMatchObject({ ...ZE_VIEW, gender: 'M' });
    expect(res.teams?.unassigned.find((p) => p.userId === X2)).toMatchObject({
      userId: X2,
      name: 'Lu',
      extra: true,
      inList: true,
      bench: false,
      positions: [],
    });
    for (const p of [...(res.teams?.teams.flat() ?? []), ...(res.teams?.unassigned ?? [])])
      if (p.userId !== X1 && p.userId !== X2) expect(p.extra).toBe(false);
    expect(t.stored()).toMatchObject({ extras: [ZE, LU] });
  });

  it('TIM-24: publicados, todos que veem os times veem o nome do avulso, com a marca (membros e link do jogo)', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[A, X1], [G]], positions: {}, extras: [ZE] });
    await t.service.publish(OWNER, GROUP_ID, DATE);
    for (const res of [
      await t.service.get(A, GROUP_ID, DATE),
      await t.service.guestGet(OUTSIDER, 'tok-guest'),
    ]) {
      expect(teamIds(res.teams)).toEqual([[A, X1], [G]]);
      expect(res.teams?.teams[0]?.[1]).toMatchObject({ userId: X1, name: 'Zé', extra: true, pinned: false });
    }
  });

  it('TIM-24: o avulso não recebe aviso ao publicar', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [
        [A, X1],
        [G, X2],
      ],
      positions: {},
      extras: [ZE, LU],
    });
    await t.service.publish(OWNER, GROUP_ID, DATE);
    expect(t.sent.length).toBeGreaterThan(0);
    expect(t.sent.map((s) => s.userId)).not.toEqual(expect.arrayContaining([X1]));
    expect(t.sent.map((s) => s.userId)).not.toEqual(expect.arrayContaining([X2]));
  });

  it('TIM-24: o dono muda o nome, o gênero e as posições salvando o avulso de novo', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[X1], []], positions: {}, extras: [ZE] });
    const edited: TeamExtra = { id: X1, name: 'José', gender: 'F', positions: ['libero', 'outside'] };
    const res = await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [[X1], []],
      positions: {},
      extras: [edited],
    });
    expect(res.teams?.teams[0]?.[0]).toMatchObject({
      userId: X1,
      name: 'José',
      gender: 'F',
      positions: ['libero', 'outside'],
    });
    expect(t.stored()).toMatchObject({ extras: [edited] });
  });

  it('TIM-24 / TIM-08: remover o avulso = salvar sem ele; continuar com o id dele num time sem o avulso → TEAM_PLAYER_NOT_FOUND (404), sem gravar', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[X1], [A]], positions: {}, extras: [ZE] });
    const before = t.puts.length;
    await expectAppError(
      t.service.save(OWNER, GROUP_ID, DATE, { teams: [[X1], [A]], positions: {}, extras: [] }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );
    expect(t.puts.length).toBe(before);

    const res = await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[], [A]], positions: {} });
    expect(
      [...(res.teams?.teams.flat() ?? []), ...(res.teams?.unassigned ?? [])].map((p) => p.userId),
    ).not.toContain(X1);
  });

  it('TIM-24 / TIM-06: descartar os times apaga os avulsos (o id dele não volta sem o avulso)', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[X1], [A]], positions: {}, extras: [ZE] });
    await t.service.discard(OWNER, GROUP_ID, DATE);
    expect(await t.service.get(OWNER, GROUP_ID, DATE)).toEqual({ teams: null, defaultTeamCount: 2 });
    await expectAppError(
      t.service.save(OWNER, GROUP_ID, DATE, { teams: [[X1], [A]], positions: {} }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );
  });

  it('TIM-24 / TIM-02: posição do avulso de outro esporte → TEAM_POSITION_INVALID (422) com details.position, sem gravar', async () => {
    const t = setup();
    const err = await expectAppError(
      t.service.save(OWNER, GROUP_ID, DATE, {
        teams: [[X1], []],
        positions: {},
        extras: [{ ...ZE, positions: ['setter', 'goalkeeper'] }],
      }),
      'TEAM_POSITION_INVALID',
      422,
    );
    expect(err.details).toEqual({ position: 'goalkeeper' });
    expect(t.puts).toEqual([]);
  });

  it('TIM-24: o contrato pede nome de 1 a 40 (sem só espaços), até 20 avulsos, ids únicos, e as posições no próprio avulso', () => {
    expect(TEAM_EXTRA_LIMITS).toEqual({ name: { min: 1, max: 40 }, perGame: 20 });
    const parse = (extras: unknown[], positions: Record<string, unknown> = {}) =>
      SaveTeamsInputSchema.safeParse({ teams: [[], []], positions, extras }).success;
    const extra = (n: number, name = 'Zé') => ({
      id: `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, '0')}`,
      name,
      positions: [],
    });
    expect(parse([extra(1)])).toBe(true);
    expect(parse([extra(1, 'x'.repeat(40))])).toBe(true);
    expect(parse([extra(1, '')])).toBe(false);
    expect(parse([extra(1, '   ')])).toBe(false);
    expect(parse([extra(1, 'x'.repeat(41))])).toBe(false);
    expect(parse(range(20).map((i) => extra(i + 1)))).toBe(true);
    expect(parse(range(21).map((i) => extra(i + 1)))).toBe(false);
    expect(parse([extra(1), extra(1, 'Outro')])).toBe(false);
    expect(parse([{ ...extra(1), gender: 'X' }])).toBe(false);
    expect(parse([{ ...extra(1), positions: ['setter', 'setter'] }])).toBe(false);
    expect(parse([extra(1)], { [extra(1).id]: ['setter'] })).toBe(false);
    expect(SaveTeamsInputSchema.parse({ teams: [[], []], positions: {} }).extras).toEqual([]);
  });

  it('TIM-24 / TIM-16: o avulso pode ser fixado e fica no time dele em todo sorteio', async () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const t = setup({ random: seeded(seed) });
      await t.service.save(OWNER, GROUP_ID, DATE, {
        teams: [[], [X1]],
        positions: {},
        pinned: [X1],
        extras: [ZE],
      });
      const res = await t.service.draw(OWNER, GROUP_ID, DATE);
      expect(teamIds(res.teams)[1]).toContain(X1);
      expect(res.teams?.teams[1]?.find((p) => p.userId === X1)?.pinned).toBe(true);
    }
  });
});

describe('avulso no sorteio e nas regras (TIM-24, TIM-15, TIM-18)', () => {
  it('TIM-15 / TIM-24: os avulsos entram no sorteio como quem está dentro (12 + 2 avulsos → 7 e 7) e continuam no jogo', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[], []], positions: {}, extras: [ZE, LU] });
    const res = await t.service.draw(OWNER, GROUP_ID, DATE);
    const teams = teamIds(res.teams);
    expect(teams.map((team) => team.length)).toEqual([7, 7]);
    expect(teams.flat()).toEqual(expect.arrayContaining([X1, X2]));
    expect(t.stored()).toMatchObject({ extras: [ZE, LU] });
  });

  it('TIM-24 / TIM-18: o avulso conta para as regras com a principal dele: 3 times com 1 levantador por time e o Zé levantador → um em cada', async () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const t = setup({ settings: { rules: [SETTER_ONE] }, random: seeded(seed) });
      await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[], [], []], positions: {}, extras: [ZE] });
      for (const team of teamIds((await t.service.draw(OWNER, GROUP_ID, DATE)).teams))
        expect(countIn(team, [E0, E1, X1])).toBe(1);
    }
  });

  it('TIM-24 / TIM-19: sem o avulso, a mesma regra com 3 times não dá (o avulso é que completa)', async () => {
    const t = setup({ settings: { rules: [SETTER_MIN] } });
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[], [], []], positions: {}, extras: [] });
    expect(await conflictsOfDraw(t)).toEqual([
      { reason: 'not_enough', rule: SETTER_MIN, needed: 3, available: 2 },
    ]);
  });

  it('TIM-24 / TIM-20: montando à mão, o avulso conta com a principal e o gênero dele', async () => {
    const t = setup({ settings: { rules: [SETTER_MIN, WOMEN_ONE] } });
    const res = await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [
        [E0, A],
        [X1, X2],
      ],
      positions: {},
      extras: [ZE, LU],
    });
    expect(res.teams?.violations ?? []).toEqual([]);

    const without = await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [[E0, A], [X2]],
      positions: {},
      extras: [ZE, LU],
    });
    expectSameViolations(without.teams?.violations, [{ kind: 'count', team: 2, rule: SETTER_MIN, count: 0 }]);
  });
});
