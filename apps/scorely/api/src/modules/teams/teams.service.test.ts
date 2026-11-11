import { randomUUID } from 'node:crypto';
import {
  type Attendee,
  type ErrorCode,
  type Game,
  type GuestGame,
  type MemberRole,
  type Notification,
  type PlayerPosition,
  SaveTeamsInputSchema,
  TEAM_COUNT,
  type TeamPlayer,
  type Teams,
  TeamsResponseSchema,
  type User,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';
import { AppError, appError } from '../../lib/errors';
import type { GroupRepository, StoredGroup } from '../groups/group.repository';
import type { NewNotification } from '../notifications/notification.service';
import type { PlayerRepository, StoredPlayer } from './player.repository';
import type { StoredTeams, TeamsRepository } from './teams.repository';
import { createTeamsService } from './teams.service';

// E3 etapa 2 (`.claude/work/e3-times-2.md`): times manuais, rascunho e publicação, TIM-06 a TIM-13 e GRP-09.
// O roster (jogo atual e link do jogo) é um fake: o jogo atual é o que o módulo de grupos devolve.

const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GROUP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
/** Membro na fila (Banco). */
const B = '33333333-3333-4333-8333-333333333333';
/** Membro fora da lista. */
const C = '44444444-4444-4444-8444-444444444444';
/** Reserva dentro da lista. */
const R = '88888888-8888-4888-8888-888888888888';
/** Convidado dentro da lista. */
const G = '99999999-9999-4999-8999-999999999999';
/** Convidado na fila. */
const H = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OUTSIDER = '66666666-6666-4666-8666-666666666666';

const DATE = '2026-11-06';
const OTHER_DATE = '2026-11-13';
const NOW = new Date('2026-11-05T13:00:00.000Z');
const LATER = new Date('2026-11-06T23:00:00.000Z');

function storedGroup(extra: Partial<StoredGroup> = {}): StoredGroup {
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
    ...extra,
  };
}

const NAMES: Record<string, string> = {
  [OWNER]: 'Dono',
  [A]: 'Ana',
  [B]: 'Beatriz',
  [C]: 'Caio',
  [R]: 'Rafa',
  [G]: 'Gabi',
  [H]: 'Heitor',
  [OUTSIDER]: 'Fora',
};

const MEMBERS: Record<string, MemberRole> = {
  [OWNER]: 'member',
  [A]: 'member',
  [B]: 'member',
  [C]: 'member',
  [R]: 'reserve',
};

const attendee = (userId: string, role: Attendee['role'], minute: number): Attendee => ({
  userId,
  name: NAMES[userId],
  role,
  confirmedAt: new Date(Date.UTC(2026, 10, 4, 22, minute)).toISOString(),
});

function gameOf(confirmed: Attendee[], waitlist: Attendee[], extra: Partial<Game> = {}): Game {
  return {
    groupId: GROUP_ID,
    date: DATE,
    startsAt: '2026-11-06T22:00:00.000Z',
    opensAt: '2026-11-04T22:00:00.000Z',
    reservesOpensAt: '2026-11-05T22:00:00.000Z',
    guestsOpensAt: '2026-11-06T10:00:00.000Z',
    status: 'open',
    slots: 4,
    confirmed,
    waitlist,
    ...extra,
  };
}

/** Dentro: Dono, Ana, Gabi (convidada), Rafa (reserva). Fila: Beatriz (membro), Heitor (convidado). */
const CONFIRMED = [
  attendee(OWNER, 'member', 0),
  attendee(A, 'member', 1),
  attendee(G, 'guest', 2),
  attendee(R, 'reserve', 3),
];
const WAITLIST = [attendee(B, 'member', 4), attendee(H, 'guest', 5)];
const GAME = gameOf(CONFIRMED, WAITLIST);

const unused = () => Promise.reject(new Error('not used by the teams module'));

function setup(opts: { group?: Partial<StoredGroup>; game?: Game } = {}) {
  const clock = { now: NOW };
  const state = {
    group: storedGroup(opts.group),
    members: { ...MEMBERS } as Record<string, MemberRole>,
    game: opts.game ?? GAME,
  };
  const sent: ({ userId: string } & NewNotification)[] = [];
  const puts: StoredTeams[] = [];
  const deletes: { groupId: string; date: string }[] = [];
  const teamsStore = new Map<string, StoredTeams>();
  const playerStore = new Map<string, StoredPlayer>();
  const key = (a: string, b: string) => `${a}#${b}`;

  const groups: GroupRepository = {
    get: async (id) => (id === state.group.id ? state.group : undefined),
    roleOf: async (groupId, userId) => (groupId === state.group.id ? state.members[userId] : undefined),
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
      if (state.group.archivedAt) throw appError('GROUP_ARCHIVED');
      return structuredClone(state.game);
    },
    guestView: async (_userId: string, token: string): Promise<GuestGame> => {
      if (token !== state.group.guestToken || state.group.archivedAt) throw appError('GAME_LINK_INVALID');
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

  const players: Pick<PlayerRepository, 'getMany'> = {
    getMany: async (groupId, userIds) =>
      userIds.flatMap((userId) => {
        const p = playerStore.get(key(groupId, userId));
        return p ? [{ ...p, positions: [...p.positions] }] : [];
      }),
  };

  const users = {
    getMany: async (userIds: readonly string[]): Promise<User[]> =>
      userIds.flatMap((id) =>
        NAMES[id]
          ? [{ id, email: `${id.slice(0, 4)}@x.com`, name: NAMES[id], createdAt: '2026-01-01T00:00:00.000Z' }]
          : [],
      ),
  };

  const notifications = {
    notify: async (userId: string, input: NewNotification): Promise<Notification> => {
      sent.push({ userId, ...input });
      return { id: randomUUID(), createdAt: clock.now.toISOString(), userId, ...input };
    },
  };

  const teams: TeamsRepository = {
    get: async (groupId, date) => {
      const t = teamsStore.get(key(groupId, date));
      return t ? structuredClone(t) : undefined;
    },
    put: async (t) => {
      puts.push(structuredClone(t));
      teamsStore.set(key(t.groupId, t.date), structuredClone(t));
    },
    delete: async (groupId, date) => {
      deletes.push({ groupId, date });
      teamsStore.delete(key(groupId, date));
    },
  };

  const service = createTeamsService({
    groups,
    roster,
    players,
    users,
    notifications,
    teams,
    now: () => clock.now,
  });

  /** Posições do grupo (TIM-04), gravadas direto. */
  const seedPositions = (userId: string, positions: PlayerPosition[]) =>
    playerStore.set(key(GROUP_ID, userId), {
      groupId: GROUP_ID,
      userId,
      positions,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    });

  /** Times gravados direto no repositório. */
  const seedTeams = (extra: Partial<StoredTeams> = {}) =>
    teamsStore.set(key(GROUP_ID, DATE), {
      groupId: GROUP_ID,
      date: DATE,
      status: 'draft',
      teams: [
        [OWNER, A],
        [G, R],
      ],
      positions: {},
      createdAt: '2026-11-04T00:00:00.000Z',
      updatedAt: '2026-11-04T00:00:00.000Z',
      ...extra,
    });

  const stored = () => teamsStore.get(key(GROUP_ID, DATE));
  return { clock, state, sent, puts, deletes, service, seedPositions, seedTeams, stored };
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
const teamIds = (t: Teams | null) => (t ? t.teams.map(ids) : undefined);
const find = (t: Teams | null, userId: string): TeamPlayer | undefined =>
  t ? [...t.teams.flat(), ...t.unassigned].find((p) => p.userId === userId) : undefined;

/** Todas as escritas do dono, para conferir os erros comuns. */
const writes = (t: ReturnType<typeof setup>, who: string, groupId = GROUP_ID, date = DATE) => [
  () => t.service.save(who, groupId, date, { teams: [[A], [G]], positions: {} }),
  () => t.service.publish(who, groupId, date),
  () => t.service.unpublish(who, groupId, date),
  () => t.service.discard(who, groupId, date),
];

describe('times do jogo: uma divisão por jogo, só o jogo atual (TIM-06)', () => {
  it('TIM-06: sem times salvos, o GET responde { teams: null } (para o dono e para os outros)', async () => {
    const t = setup();
    for (const who of [OWNER, A, R])
      expect(await t.service.get(who, GROUP_ID, DATE)).toEqual({ teams: null });
  });

  it('TIM-06: o primeiro save cria o rascunho do jogo atual, com createdAt/updatedAt = agora', async () => {
    const t = setup();
    const res = await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[A], []], positions: {} });

    expect(TeamsResponseSchema.parse(res)).toEqual(res);
    expect(res.teams).toMatchObject({ groupId: GROUP_ID, date: DATE, status: 'draft' });
    expect(res.teams?.publishedAt).toBeUndefined();
    expect(t.stored()).toEqual({
      groupId: GROUP_ID,
      date: DATE,
      status: 'draft',
      teams: [[A], []],
      positions: {},
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
  });

  it('TIM-06: salvar de novo substitui os times e mantém o createdAt', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[A], []], positions: {} });
    t.clock.now = LATER;
    t.state.game = gameOf(CONFIRMED, WAITLIST, { status: 'in_progress' });
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[G], [A], [R]], positions: {} });

    expect(t.stored()).toMatchObject({
      teams: [[G], [A], [R]],
      createdAt: NOW.toISOString(),
      updatedAt: LATER.toISOString(),
    });
  });

  it('TIM-06: outra data que não a do jogo atual → GAME_NOT_FOUND (404) para ler e escrever, sem gravar', async () => {
    const t = setup();
    await expectAppError(t.service.get(OWNER, GROUP_ID, OTHER_DATE), 'GAME_NOT_FOUND', 404);
    for (const write of writes(t, OWNER, GROUP_ID, OTHER_DATE))
      await expectAppError(write(), 'GAME_NOT_FOUND', 404);
    expect(t.puts).toEqual([]);
    expect(t.deletes).toEqual([]);
  });

  it('TIM-06: descartar apaga os times do jogo; depois o GET responde { teams: null }', async () => {
    const t = setup();
    t.seedTeams({ status: 'published', publishedAt: '2026-11-04T00:00:00.000Z' });
    await t.service.discard(OWNER, GROUP_ID, DATE);

    expect(t.deletes).toEqual([{ groupId: GROUP_ID, date: DATE }]);
    expect(t.stored()).toBeUndefined();
    for (const who of [OWNER, A]) expect(await t.service.get(who, GROUP_ID, DATE)).toEqual({ teams: null });
  });

  it('TIM-06: descartar sem times não muda nada (sem erro)', async () => {
    const t = setup();
    await expect(t.service.discard(OWNER, GROUP_ID, DATE)).resolves.toBeUndefined();
    expect(t.puts).toEqual([]);
  });
});

describe('times do jogo: só o dono mexe (TIM-07)', () => {
  it('TIM-07: membro e reserva que não são donos → GROUP_NOT_OWNER (403) em salvar, publicar, voltar e descartar', async () => {
    const t = setup();
    t.seedTeams();
    for (const who of [A, B, R])
      for (const write of writes(t, who)) await expectAppError(write(), 'GROUP_NOT_OWNER', 403);
    expect(t.puts).toEqual([]);
    expect(t.deletes).toEqual([]);
    expect(t.sent).toEqual([]);
  });

  it('TIM-07: quem não participa do grupo (convidado inclusive) ou grupo inexistente → GROUP_NOT_FOUND (404)', async () => {
    const t = setup();
    t.seedTeams({ status: 'published', publishedAt: '2026-11-04T00:00:00.000Z' });
    for (const who of [OUTSIDER, G, H]) {
      await expectAppError(t.service.get(who, GROUP_ID, DATE), 'GROUP_NOT_FOUND', 404);
      for (const write of writes(t, who)) await expectAppError(write(), 'GROUP_NOT_FOUND', 404);
    }
    await expectAppError(t.service.get(OWNER, OTHER_GROUP_ID, DATE), 'GROUP_NOT_FOUND', 404);
    for (const write of writes(t, OWNER, OTHER_GROUP_ID))
      await expectAppError(write(), 'GROUP_NOT_FOUND', 404);
    expect(t.puts).toEqual([]);
  });

  it('TIM-07: a permissão vem antes da data, do arquivado e de quem está na lista', async () => {
    const t = setup({ group: { archivedAt: '2026-11-01T00:00:00.000Z' } });
    await expectAppError(
      t.service.save(A, GROUP_ID, OTHER_DATE, { teams: [[OUTSIDER], []], positions: {} }),
      'GROUP_NOT_OWNER',
      403,
    );
  });
});

describe('times do jogo: como são montados (TIM-08)', () => {
  it('TIM-08: o contrato aceita de 2 a 8 times e recusa menos, mais e a mesma pessoa em dois times', () => {
    expect(TEAM_COUNT).toEqual({ min: 2, max: 8 });
    const team = (id: string) => [id];
    expect(SaveTeamsInputSchema.safeParse({ teams: [[A], []], positions: {} }).success).toBe(true);
    expect(
      SaveTeamsInputSchema.safeParse({ teams: [[], [], [], [], [], [], [], []], positions: {} }).success,
    ).toBe(true);
    expect(SaveTeamsInputSchema.safeParse({ teams: [team(A)], positions: {} }).success).toBe(false);
    expect(
      SaveTeamsInputSchema.safeParse({ teams: Array.from({ length: 9 }, () => []), positions: {} }).success,
    ).toBe(false);
    expect(SaveTeamsInputSchema.safeParse({ teams: [[A], [A]], positions: {} }).success).toBe(false);
    expect(
      SaveTeamsInputSchema.safeParse({
        teams: [
          [A, G],
          [R, G],
        ],
        positions: {},
      }).success,
    ).toBe(false);
  });

  it('TIM-08: quem está dentro e não foi posto em time fica "sem time", na ordem da lista (só o dono vê)', async () => {
    const t = setup();
    const res = await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[A], []], positions: {} });

    expect(teamIds(res.teams)).toEqual([[A], []]);
    expect(ids(res.teams?.unassigned ?? [])).toEqual([OWNER, G, R]);
    const again = await t.service.get(OWNER, GROUP_ID, DATE);
    expect(ids(again.teams?.unassigned ?? [])).toEqual([OWNER, G, R]);
  });

  it('TIM-08: quem está na fila e não foi posto em time não entra em "sem time"', async () => {
    const t = setup();
    const res = await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[], []], positions: {} });
    expect(ids(res.teams?.unassigned ?? [])).toEqual([OWNER, A, G, R]);
  });

  it('TIM-08: o dono põe alguém do Banco num time, marcado como do Banco (bench), com o papel da lista', async () => {
    const t = setup();
    const res = await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [
        [OWNER, A],
        [G, B, H],
      ],
      positions: {},
    });

    expect(teamIds(res.teams)).toEqual([
      [OWNER, A],
      [G, B, H],
    ]);
    expect(find(res.teams, B)).toMatchObject({ name: 'Beatriz', role: 'member', bench: true, inList: true });
    expect(find(res.teams, H)).toMatchObject({ name: 'Heitor', role: 'guest', bench: true, inList: true });
    expect(find(res.teams, G)).toMatchObject({ name: 'Gabi', role: 'guest', bench: false, inList: true });
    expect(find(res.teams, R)).toMatchObject({ role: 'reserve', bench: false });
    expect(ids(res.teams?.unassigned ?? [])).toEqual([R]);
  });

  it('TIM-08: tirar alguém do time = salvar sem ele (quem está dentro volta para "sem time")', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [
        [OWNER, A],
        [G, B],
      ],
      positions: {},
    });
    const res = await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER], [G]], positions: {} });

    expect(teamIds(res.teams)).toEqual([[OWNER], [G]]);
    expect(ids(res.teams?.unassigned ?? [])).toEqual([A, R]);
    expect(find(res.teams, B)).toBeUndefined();
  });

  it('TIM-08: pessoa fora da lista do jogo (membro que não confirmou, ou de fora) → TEAM_PLAYER_NOT_FOUND (404), sem gravar', async () => {
    const t = setup();
    for (const who of [C, OUTSIDER]) {
      await expectAppError(
        t.service.save(OWNER, GROUP_ID, DATE, { teams: [[A], [who]], positions: {} }),
        'TEAM_PLAYER_NOT_FOUND',
        404,
      );
      await expectAppError(
        t.service.save(OWNER, GROUP_ID, DATE, { teams: [[A], [G]], positions: { [who]: ['setter'] } }),
        'TEAM_PLAYER_NOT_FOUND',
        404,
      );
    }
    expect(t.puts).toEqual([]);
  });

  it('TIM-08: o rascunho pode ter time vazio e gente sem time', async () => {
    const t = setup();
    const res = await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[], [], []], positions: {} });
    expect(teamIds(res.teams)).toEqual([[], [], []]);
    expect(res.teams?.status).toBe('draft');
  });

  it('TIM-08: publicar com um time vazio → TEAM_EMPTY (422) com details.team = número do time (1-based), sem publicar', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER], [A], []], positions: {} });

    const err = await expectAppError(t.service.publish(OWNER, GROUP_ID, DATE), 'TEAM_EMPTY', 422);
    expect(err.details).toEqual({ team: 3 });
    expect(t.stored()?.status).toBe('draft');
    expect(t.stored()?.publishedAt).toBeUndefined();
    expect(t.sent).toEqual([]);
  });

  it('TIM-08: gente sem time não impede publicar', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER], [A]], positions: {} });
    const res = await t.service.publish(OWNER, GROUP_ID, DATE);
    expect(res.teams?.status).toBe('published');
    expect(ids(res.teams?.unassigned ?? [])).toEqual([G, R]);
  });
});

describe('times do jogo: rascunho e publicação (TIM-09)', () => {
  it('TIM-09: rascunho → só o dono vê; para membro e reserva é { teams: null }', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [
        [OWNER, A],
        [G, R],
      ],
      positions: {},
    });

    expect((await t.service.get(OWNER, GROUP_ID, DATE)).teams?.status).toBe('draft');
    for (const who of [A, B, R, C]) expect(await t.service.get(who, GROUP_ID, DATE)).toEqual({ teams: null });
  });

  it('TIM-09: publicados → todos do grupo veem os times; "sem time" vem vazio para quem não é dono', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER], [A]], positions: {} });
    const published = await t.service.publish(OWNER, GROUP_ID, DATE);

    expect(published.teams).toMatchObject({ status: 'published', publishedAt: NOW.toISOString() });
    expect(ids(published.teams?.unassigned ?? [])).toEqual([G, R]);
    for (const who of [A, B, R, C]) {
      const res = await t.service.get(who, GROUP_ID, DATE);
      expect(TeamsResponseSchema.parse(res)).toEqual(res);
      expect(teamIds(res.teams)).toEqual([[OWNER], [A]]);
      expect(res.teams?.status).toBe('published');
      expect(res.teams?.unassigned).toEqual([]);
    }
  });

  it('TIM-09: depois de publicados, salvar mantém publicado e a mudança já aparece para todos', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER], [A]], positions: {} });
    await t.service.publish(OWNER, GROUP_ID, DATE);
    const saved = await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [
        [OWNER, G],
        [A, R],
      ],
      positions: {},
    });

    expect(saved.teams?.status).toBe('published');
    expect(t.stored()).toMatchObject({ status: 'published', publishedAt: NOW.toISOString() });
    expect(teamIds((await t.service.get(A, GROUP_ID, DATE)).teams)).toEqual([
      [OWNER, G],
      [A, R],
    ]);
  });

  it('TIM-09: voltar para rascunho esconde dos outros; publicar de novo mostra outra vez', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER], [A]], positions: {} });
    await t.service.publish(OWNER, GROUP_ID, DATE);

    const draft = await t.service.unpublish(OWNER, GROUP_ID, DATE);
    expect(draft.teams?.status).toBe('draft');
    expect(await t.service.get(A, GROUP_ID, DATE)).toEqual({ teams: null });
    expect(t.stored()?.teams).toEqual([[OWNER], [A]]);

    await t.service.publish(OWNER, GROUP_ID, DATE);
    expect(teamIds((await t.service.get(A, GROUP_ID, DATE)).teams)).toEqual([[OWNER], [A]]);
  });

  it('TIM-09: salvar um rascunho mantém rascunho', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER], [A]], positions: {} });
    const res = await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[A], [OWNER]], positions: {} });
    expect(res.teams?.status).toBe('draft');
    expect(t.stored()?.status).toBe('draft');
  });

  it('TIM-09: sem times salvos, publicar → TEAM_EMPTY (Time 1); voltar para rascunho → { teams: null }, sem gravar', async () => {
    const t = setup();
    const err = await expectAppError(t.service.publish(OWNER, GROUP_ID, DATE), 'TEAM_EMPTY', 422);
    expect(err.details).toEqual({ team: 1 });
    expect(await t.service.unpublish(OWNER, GROUP_ID, DATE)).toEqual({ teams: null });
    expect(t.puts).toEqual([]);
    expect(t.sent).toEqual([]);
  });

  it('TIM-09 / GRP-09: pelo link do jogo, quem não participa do grupo vê os times publicados (sem "sem time")', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER, G], [A]], positions: {} });
    await t.service.publish(OWNER, GROUP_ID, DATE);

    for (const who of [OUTSIDER, H, G]) {
      const res = await t.service.guestGet(who, 'tok-guest');
      expect(TeamsResponseSchema.parse(res)).toEqual(res);
      expect(res.teams).toMatchObject({ groupId: GROUP_ID, date: DATE, status: 'published' });
      expect(teamIds(res.teams)).toEqual([[OWNER, G], [A]]);
      expect(res.teams?.unassigned).toEqual([]);
    }
  });

  it('TIM-09 / GRP-09: pelo link do jogo, rascunho e jogo sem times → { teams: null }', async () => {
    const t = setup();
    expect(await t.service.guestGet(OUTSIDER, 'tok-guest')).toEqual({ teams: null });
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER], [A]], positions: {} });
    expect(await t.service.guestGet(OUTSIDER, 'tok-guest')).toEqual({ teams: null });
  });

  it('GRP-09: link do jogo inválido → GAME_LINK_INVALID (404)', async () => {
    const t = setup();
    await expectAppError(t.service.guestGet(OUTSIDER, 'tok-old'), 'GAME_LINK_INVALID', 404);
  });
});

describe('times do jogo: aviso ao publicar (TIM-10)', () => {
  it('TIM-10: a 1ª publicação avisa todos da lista (dentro e fila) menos o dono, com o link do grupo ou do jogo', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER], [A]], positions: {} });
    await t.service.publish(OWNER, GROUP_ID, DATE);

    expect(t.sent.map((n) => n.userId).sort()).toEqual([A, G, R, B, H].sort());
    for (const n of t.sent) {
      expect(n.type).toBe('teams_published');
      expect(n.title).toBe('Times publicados');
      expect(n.body).toContain('Vôlei de sexta');
    }
    const linkOf = (userId: string) => t.sent.find((n) => n.userId === userId)?.link;
    for (const who of [A, R, B]) expect(linkOf(who)).toBe(`/groups/${GROUP_ID}`);
    for (const who of [G, H]) expect(linkOf(who)).toBe('/play/tok-guest');
  });

  it('TIM-10: quem não está na lista (membro que não confirmou) não é avisado', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER], [A]], positions: {} });
    await t.service.publish(OWNER, GROUP_ID, DATE);
    expect(t.sent.map((n) => n.userId)).not.toContain(C);
    expect(t.sent.map((n) => n.userId)).not.toContain(OWNER);
  });

  it('TIM-10: publicar de novo depois de voltar para rascunho não avisa e mantém o publishedAt da 1ª', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER], [A]], positions: {} });
    await t.service.publish(OWNER, GROUP_ID, DATE);
    const first = t.sent.length;

    t.clock.now = LATER;
    t.state.game = gameOf(CONFIRMED, WAITLIST, { status: 'in_progress' });
    await t.service.unpublish(OWNER, GROUP_ID, DATE);
    const again = await t.service.publish(OWNER, GROUP_ID, DATE);

    expect(t.sent.length).toBe(first);
    expect(again.teams?.publishedAt).toBe(NOW.toISOString());
    expect(t.stored()?.publishedAt).toBe(NOW.toISOString());
  });

  it('TIM-10: mudar os times publicados (ou publicar o que já está publicado) não avisa outra vez', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER], [A]], positions: {} });
    await t.service.publish(OWNER, GROUP_ID, DATE);
    const first = t.sent.length;

    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER, G], [A]], positions: {} });
    await t.service.publish(OWNER, GROUP_ID, DATE);
    expect(t.sent.length).toBe(first);
  });
});

describe('times do jogo: até quando dá para mexer (TIM-11)', () => {
  it('TIM-11: com o jogo em andamento (até o fim), o dono ainda mexe', async () => {
    const t = setup({ game: gameOf(CONFIRMED, WAITLIST, { status: 'in_progress' }) });
    t.clock.now = LATER;
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER], [A]], positions: {} });
    const res = await t.service.publish(OWNER, GROUP_ID, DATE);
    expect(res.teams?.status).toBe('published');
  });

  it('TIM-11: depois do fim, o jogo atual é o da semana seguinte → a data antiga responde GAME_NOT_FOUND', async () => {
    const t = setup();
    t.seedTeams({ status: 'published', publishedAt: '2026-11-04T00:00:00.000Z' });
    t.state.game = gameOf([], [], {
      date: OTHER_DATE,
      startsAt: '2026-11-13T22:00:00.000Z',
      status: 'scheduled',
    });

    for (const write of writes(t, OWNER)) await expectAppError(write(), 'GAME_NOT_FOUND', 404);
    expect(t.deletes).toEqual([]);
  });

  it('TIM-11: jogo cancelado → salvar, publicar, voltar e descartar respondem GAME_CANCELLED (409), sem gravar', async () => {
    const t = setup({ game: gameOf(CONFIRMED, WAITLIST, { status: 'cancelled' }) });
    t.seedTeams();
    for (const write of writes(t, OWNER)) await expectAppError(write(), 'GAME_CANCELLED', 409);
    expect(t.puts).toEqual([]);
    expect(t.deletes).toEqual([]);
    expect(t.sent).toEqual([]);
  });

  it('TIM-11: jogo cancelado → os times não aparecem (grupo e link do jogo); reaberto, voltam como estavam', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER], [A]], positions: {} });
    await t.service.publish(OWNER, GROUP_ID, DATE);

    t.state.game = gameOf(CONFIRMED, WAITLIST, { status: 'cancelled' });
    for (const who of [OWNER, A]) expect(await t.service.get(who, GROUP_ID, DATE)).toEqual({ teams: null });
    expect(await t.service.guestGet(OUTSIDER, 'tok-guest')).toEqual({ teams: null });

    t.state.game = GAME;
    const back = await t.service.get(A, GROUP_ID, DATE);
    expect(back.teams).toMatchObject({ status: 'published', publishedAt: NOW.toISOString() });
    expect(teamIds(back.teams)).toEqual([[OWNER], [A]]);
  });

  it('TIM-11: grupo arquivado → as escritas respondem GROUP_ARCHIVED (409), antes da data', async () => {
    const t = setup({ group: { archivedAt: '2026-11-01T00:00:00.000Z' } });
    for (const write of writes(t, OWNER)) await expectAppError(write(), 'GROUP_ARCHIVED', 409);
    for (const write of writes(t, OWNER, GROUP_ID, OTHER_DATE))
      await expectAppError(write(), 'GROUP_ARCHIVED', 409);
    expect(t.puts).toEqual([]);
  });
});

describe('times do jogo: quem saiu da lista continua no time (TIM-12)', () => {
  it('TIM-12: quem desistiu continua no time, marcado inList = false, com o nome, para o dono e para todos', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [
        [OWNER, A],
        [G, H],
      ],
      positions: {},
    });
    await t.service.publish(OWNER, GROUP_ID, DATE);

    // Ana (membro) e Heitor (convidado da fila) desistem.
    t.state.game = gameOf(
      [attendee(OWNER, 'member', 0), attendee(G, 'guest', 2), attendee(R, 'reserve', 3)],
      [attendee(B, 'member', 4)],
    );
    for (const who of [OWNER, R]) {
      const res = await t.service.get(who, GROUP_ID, DATE);
      expect(teamIds(res.teams)).toEqual([
        [OWNER, A],
        [G, H],
      ]);
      expect(find(res.teams, A)).toMatchObject({ name: 'Ana', inList: false });
      expect(find(res.teams, H)).toMatchObject({ name: 'Heitor', inList: false });
      expect(find(res.teams, G)).toMatchObject({ inList: true });
    }
  });

  it('TIM-12: quem saiu do grupo continua no time, marcado', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER, A], [G]], positions: {} });
    delete t.state.members[A];
    t.state.game = gameOf(
      [attendee(OWNER, 'member', 0), attendee(G, 'guest', 2), attendee(R, 'reserve', 3)],
      WAITLIST,
    );

    const res = await t.service.get(OWNER, GROUP_ID, DATE);
    expect(find(res.teams, A)).toMatchObject({ name: 'Ana', inList: false });
  });

  it('TIM-12: o dono pode salvar mantendo quem saiu (sem TEAM_PLAYER_NOT_FOUND), e depois tirar', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER, A], [G]], positions: {} });
    t.state.game = gameOf(
      [attendee(OWNER, 'member', 0), attendee(G, 'guest', 2), attendee(R, 'reserve', 3)],
      WAITLIST,
    );

    const kept = await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [
        [OWNER, A],
        [G, R],
      ],
      positions: { [A]: ['setter'] },
    });
    expect(find(kept.teams, A)).toMatchObject({ inList: false, positions: ['setter'] });

    const removed = await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER], [G, R]], positions: {} });
    expect(find(removed.teams, A)).toBeUndefined();
  });

  it('TIM-12: quem saiu da lista e não estava nos times salvos não pode entrar → TEAM_PLAYER_NOT_FOUND', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER], [G]], positions: {} });
    t.state.game = gameOf([attendee(OWNER, 'member', 0), attendee(G, 'guest', 2)], []);

    await expectAppError(
      t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER, A], [G]], positions: {} }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );
  });

  it('TIM-12: quem entrou na lista depois aparece para o dono como "sem time"', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [
        [OWNER, A],
        [G, R],
      ],
      positions: {},
    });
    t.state.game = gameOf([...CONFIRMED, attendee(C, 'member', 6)], WAITLIST, { slots: 5 });

    const res = await t.service.get(OWNER, GROUP_ID, DATE);
    expect(ids(res.teams?.unassigned ?? [])).toEqual([C]);
    expect(find(res.teams, C)).toMatchObject({ name: 'Caio', inList: true, bench: false, role: 'member' });
  });

  it('TIM-12: os times não mudam sozinhos: quem saiu continua gravado no time', async () => {
    const t = setup();
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[OWNER, A], [G]], positions: {} });
    t.state.game = gameOf([attendee(OWNER, 'member', 0), attendee(G, 'guest', 2)], []);
    await t.service.get(OWNER, GROUP_ID, DATE);
    expect(t.stored()?.teams).toEqual([[OWNER, A], [G]]);
  });
});

describe('times do jogo: posição só no jogo (TIM-13)', () => {
  it('TIM-13: sem ajuste, cada pessoa mostra as posições do grupo (adjusted = false)', async () => {
    const t = setup();
    t.seedPositions(A, ['middle', 'outside']);
    const res = await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[A], [G]], positions: {} });

    expect(find(res.teams, A)).toMatchObject({ positions: ['middle', 'outside'], adjusted: false });
    expect(find(res.teams, G)).toMatchObject({ positions: [], adjusted: false });
  });

  it('TIM-13: com ajuste, vale a posição do jogo (adjusted = true) e o padrão do grupo não muda', async () => {
    const t = setup();
    t.seedPositions(A, ['outside']);
    const res = await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [[A], [G]],
      positions: { [A]: ['setter', 'outside'] },
    });

    expect(find(res.teams, A)).toMatchObject({ positions: ['setter', 'outside'], adjusted: true });
    expect(t.stored()?.positions).toEqual({ [A]: ['setter', 'outside'] });
    // O padrão do grupo (TIM-04) continua o mesmo: sem o ajuste, volta a valer.
    const cleared = await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[A], [G]], positions: {} });
    expect(find(cleared.teams, A)).toMatchObject({ positions: ['outside'], adjusted: false });
  });

  it('TIM-13: o ajuste aparece para todos depois de publicado', async () => {
    const t = setup();
    t.seedPositions(A, ['outside']);
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[A], [G]], positions: { [A]: ['setter'] } });
    await t.service.publish(OWNER, GROUP_ID, DATE);
    const res = await t.service.get(R, GROUP_ID, DATE);
    expect(find(res.teams, A)).toMatchObject({ positions: ['setter'], adjusted: true });
  });

  it('TIM-13: sem ajuste, se o padrão do grupo mudar depois, os times mostram o novo', async () => {
    const t = setup();
    t.seedPositions(A, ['outside']);
    await t.service.save(OWNER, GROUP_ID, DATE, { teams: [[A], [G]], positions: {} });
    t.seedPositions(A, ['libero']);

    const res = await t.service.get(OWNER, GROUP_ID, DATE);
    expect(find(res.teams, A)).toMatchObject({ positions: ['libero'], adjusted: false });
  });

  it('TIM-13: o ajuste vale também para quem está sem time', async () => {
    const t = setup();
    const res = await t.service.save(OWNER, GROUP_ID, DATE, {
      teams: [[A], []],
      positions: { [R]: ['libero'] },
    });
    expect(find(res.teams, R)).toMatchObject({ positions: ['libero'], adjusted: true });
    expect(ids(res.teams?.unassigned ?? [])).toContain(R);
  });

  it('TIM-13: posição de outro esporte no ajuste → TEAM_POSITION_INVALID (422) com details.position, sem gravar', async () => {
    const t = setup();
    const err = await expectAppError(
      t.service.save(OWNER, GROUP_ID, DATE, {
        teams: [[A], [G]],
        positions: { [A]: ['setter', 'goalkeeper'] },
      }),
      'TEAM_POSITION_INVALID',
      422,
    );
    expect(err.details).toEqual({ position: 'goalkeeper' });
    expect(t.puts).toEqual([]);
  });

  it('TIM-13: a pessoa fora da lista é conferida antes da posição (TEAM_PLAYER_NOT_FOUND)', async () => {
    const t = setup();
    await expectAppError(
      t.service.save(OWNER, GROUP_ID, DATE, { teams: [[A], [OUTSIDER]], positions: { [A]: ['goalkeeper'] } }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );
  });
});
