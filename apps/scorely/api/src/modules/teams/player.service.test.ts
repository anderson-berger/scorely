import { AppError, appError } from '@scorely/api/src/lib/errors';
import { asUserId, type UserId } from '@scorely/api/src/lib/ids';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import type { PlayerRepository, StoredPlayer } from '@scorely/api/src/modules/teams/player.repository';
import { createPlayerService } from '@scorely/api/src/modules/teams/player.service';
import {
  type Attendee,
  type ErrorCode,
  type Game,
  type Member,
  type MemberTier,
  type PlayerPosition,
  PlayerSchema,
  type PublicUserId,
  PublicUserIdSchema,
  type RoleId,
  type Sport,
  UpdatePlayerInputSchema,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

/** ADR 0016: o que o banco faz na gravação condicionada pela versão (o repositório lança o mesmo erro). */
function expectVersionIn(current: number, expected: number): void {
  if (current !== expected) throw appError('VERSION_CONFLICT', { currentVersion: current });
}

// E3 etapa 1 (`.claude/work/e3-times-1.md`, retrabalho 1): posições por pessoa no grupo, TIM-01 a TIM-04.
// O roster (membros e jogo atual) é um fake: quem confere participação e permissão é o service (`requireMember` no list, dono no update).

const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GROUP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER = asUserId('11111111-1111-4111-8111-111111111111');
const A = asUserId('22222222-2222-4222-8222-222222222222');
const B = asUserId('33333333-3333-4333-8333-333333333333');
/** Reserva. */
const R = asUserId('88888888-8888-4888-8888-888888888888');
/** Convidado dentro da lista. */
const G = asUserId('99999999-9999-4999-8999-999999999999');
/** Convidado na fila. */
const H = asUserId('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
const OUTSIDER = asUserId('66666666-6666-4666-8666-666666666666');

const PEOPLE: UserId[] = [OWNER, A, B, R, G, H, OUTSIDER];
// ---------------------------------------------------------------------------------------------
// Id público (USR-15–17): por dentro, tudo anda com o id do sistema; na borda (entrada e saída do service), com o
// público. Os testes falam com ids do sistema: `atTheEdge` traduz para o público na ida e volta para o do sistema na
// saída. Um id do sistema que sair do service vira `LEAKED:<id>` e quebra a comparação (USR-16).

/** Id público de cada pessoa do teste: os 4 primeiros e os 4 últimos caracteres do id do sistema, em maiúsculas. */
const pub = (id: UserId): PublicUserId =>
  PublicUserIdSchema.parse(`${id.slice(0, 4)}${id.slice(-4)}`.toUpperCase());
const TO_PUBLIC = new Map<string, string>(PEOPLE.map((id) => [id, pub(id)]));
const TO_SYSTEM = new Map<string, string>(PEOPLE.map((id) => [pub(id), id]));
const resolveIn = (publicIds: readonly PublicUserId[]) =>
  new Map(
    publicIds.flatMap((code) => {
      const id = TO_SYSTEM.get(code);
      return id === undefined ? [] : [[code, asUserId(id)] as const];
    }),
  );

function mapDeep(value: unknown, f: (s: string) => string): unknown {
  if (typeof value === 'string') return f(value);
  if (Array.isArray(value)) return value.map((v) => mapDeep(v, f));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [f(k), mapDeep(v, f)]));
  return value;
}
const toWire = (value: unknown) => mapDeep(value, (s) => TO_PUBLIC.get(s) ?? s);
const fromWire = (value: unknown) =>
  mapDeep(value, (s) => TO_SYSTEM.get(s) ?? (TO_PUBLIC.has(s) ? `LEAKED:${s}` : s));

/** O tipo visto pelo teste: id público vira id do sistema. */
type Sys<T> = T extends PublicUserId
  ? UserId
  : T extends string | number | boolean | null | undefined
    ? T
    : T extends readonly (infer U)[]
      ? Sys<U>[]
      : T extends object
        ? { [K in keyof T]: Sys<T[K]> }
        : T;
type AtTheEdge<S> = {
  [K in keyof S]: S[K] extends (...args: infer P) => Promise<infer R>
    ? (...args: { [I in keyof P]: Sys<P[I]> }) => Promise<Sys<R>>
    : S[K];
};

/** O service visto pelos testes: o 1º argumento (quem pede, o login) passa como está; o resto vai com o público. */
function atTheEdge<S extends object>(service: S): AtTheEdge<S> {
  return new Proxy(service, {
    get(target, prop) {
      const fn: unknown = Reflect.get(target, prop);
      if (typeof fn !== 'function') return fn;
      return async (actor: unknown, ...rest: unknown[]) => {
        try {
          return fromWire(await fn.call(target, actor, ...(toWire(rest) as unknown[])));
        } catch (e) {
          if (e instanceof AppError && e.details !== undefined)
            Object.assign(e, { details: fromWire(e.details) });
          throw e;
        }
      };
    },
  }) as unknown as AtTheEdge<S>;
}

/** Todos os ids do sistema do teste: nenhum pode aparecer numa resposta (USR-16). */
const leaksSystemId = (value: unknown) => PEOPLE.some((id) => JSON.stringify(value).includes(id));
const UNKNOWN = PublicUserIdSchema.parse('ZZZZZZZZ');

/** O que o módulo de grupos entrega aos times (interno): as pessoas com os dois ids. */
type RosterMember = Omit<Member, 'userId'> & { userId: UserId; publicId: PublicUserId };
type RosterAttendee = Omit<Attendee, 'userId'> & { userId: UserId; publicId: PublicUserId };
type RosterGame = Omit<Game, 'confirmed' | 'waitlist'> & {
  confirmed: RosterAttendee[];
  waitlist: RosterAttendee[];
};

const NOW = new Date('2026-11-05T13:00:00.000Z');
/** GRP-10, 64: o horário do grupo e o id do jogo dele (`<scheduleId>_<data>`). */
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
const LATER = new Date('2026-11-12T13:00:00.000Z');

function storedGroup(extra: Partial<StoredGroup> = {}): StoredGroup {
  return {
    id: GROUP_ID,
    createdAt: '2026-01-01T00:00:00.000Z',
    name: 'Vôlei de sexta',
    sportId: 'volleyball',
    schedules: [SCHEDULE],
    timeZone: 'America/Sao_Paulo',
    slots: 12,
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

const member = (userId: UserId, name: string, role: MemberTier = 'member'): RosterMember => ({
  userId,
  publicId: pub(userId),
  nickname: name,
  roleId: userId === OWNER ? 'owner' : 'member',
  tier: role,
});

const attendee = (userId: UserId, name: string, role: Attendee['tier'], minute: number): RosterAttendee => ({
  userId,
  publicId: pub(userId),
  nickname: name,
  tier: role,
  confirmedAt: new Date(Date.UTC(2026, 10, 4, 22, minute)).toISOString(),
});

/** Ordem do GET /members (GRP-06): quem ordena é o módulo de grupos; aqui a ordem é a do fixture. */
const MEMBERS: RosterMember[] = [
  member(OWNER, 'Dono'),
  member(B, 'Beatriz'),
  member(A, 'Ana'),
  member(R, 'Rafa', 'reserve'),
];

/** Jogo atual: membros e convidados misturados, dentro e na fila. */
function gameOf(
  confirmed: RosterAttendee[],
  waitlist: RosterAttendee[],
  extra: Partial<RosterGame> = {},
): RosterGame {
  return {
    id: `${SCHEDULE_ID}_2026-11-06`,
    groupId: GROUP_ID,
    scheduleId: SCHEDULE_ID,
    version: 0,
    date: '2026-11-06',
    startsAt: '2026-11-06T22:00:00.000Z',
    endsAt: '2026-11-07T01:00:00.000Z',
    opensAt: '2026-11-04T22:00:00.000Z',
    reservesOpensAt: '2026-11-05T22:00:00.000Z',
    guestsOpensAt: '2026-11-06T10:00:00.000Z',
    status: 'open',
    slots: 12,
    confirmed,
    waitlist,
    ...extra,
  };
}

const GAME = gameOf(
  [attendee(A, 'Ana', 'member', 0), attendee(G, 'Gabi', 'guest', 1), attendee(R, 'Rafa', 'reserve', 2)],
  [attendee(H, 'Heitor', 'guest', 3)],
);

const unused = () => Promise.reject(new Error('not used by the teams module'));

/**
 * Catálogo de esportes do teste (TIM-02, ESP-05): o `sports.get` do `SportService`, com as posições na ordem.
 * No vôlei, `universal` está desativada (vale para quem já tem). `footvolley` não tem posições.
 */
const catalogPosition = (id: string, active = true) => ({ id, name: { 'pt-BR': id, en: id }, active });
const catalogSport = (id: string, positions: string[], inactive: string[] = []): Sport => ({
  id,
  name: { 'pt-BR': id, en: id },
  positions: [...positions.map((p) => catalogPosition(p)), ...inactive.map((p) => catalogPosition(p, false))],
  active: true,
});
const TEST_SPORTS: Sport[] = [
  catalogSport('volleyball', ['setter', 'opposite', 'outside', 'middle', 'libero'], ['universal']),
  catalogSport('soccer', ['goalkeeper', 'defender', 'fullback', 'defensive_mid', 'midfielder', 'forward']),
  catalogSport('basketball', ['guard', 'wing', 'center']),
  catalogSport('footvolley', []),
];
const sports = { get: async (id: string) => TEST_SPORTS.find((s) => s.id === id) };

/**
 * Contexto em memória. `state` é mutável de propósito (sair do grupo/da lista entre chamadas).
 * Participação do grupo: os membros do roster; o `upcoming` responde `GROUP_ARCHIVED` com o grupo arquivado
 * (o jogo só existe com o grupo ativo, GRP-37), então o service não deve chamá-lo nesse caso.
 */
function setup(opts: { group?: Partial<StoredGroup>; members?: RosterMember[]; game?: RosterGame } = {}) {
  const clock = { now: NOW };
  const state = {
    group: storedGroup(opts.group),
    members: opts.members ?? MEMBERS,
    game: opts.game ?? GAME,
    /** Os próximos jogos dos outros horários (GRP-11), depois do `game`. */
    others: [] as RosterGame[],
    /** Cargo de cada pessoa (GRP-48): `admin` dá o `teams.manage`. */
    staff: {} as Record<string, RoleId>,
  };
  const saved: { groupId: string; userId: string; positions: PlayerPosition[]; now: string }[] = [];
  const store = new Map<string, StoredPlayer>();
  const key = (groupId: string, userId: string) => `${groupId}#${userId}`;

  const groups: GroupRepository = {
    get: async (id) => (id === state.group.id ? state.group : undefined),
    roleOf: async (groupId, userId) =>
      groupId === state.group.id ? state.members.find((m) => m.userId === userId)?.tier : undefined,
    getByToken: unused,
    create: unused,
    addMember: unused,
    counts: unused,
    getMembership: async (groupId, userId) => {
      const role =
        groupId === state.group.id ? state.members.find((m) => m.userId === userId)?.tier : undefined;
      if (!role) return undefined;
      return { tier: role, roleId: state.staff[userId] ?? (userId === OWNER ? 'owner' : 'member') };
    },
    setStaffRole: unused,
    transfer: unused,
    setMemberInvite: unused,
    clearMemberInvite: unused,
    acceptMemberInvite: unused,
    listMembers: unused,
    groupsOf: unused,
    rotateToken: unused,
    archive: unused,
    unarchive: unused,
    update: unused,
    rename: unused,
    removeMember: unused,
  };

  const players: PlayerRepository = {
    getMany: async (groupId, userIds) =>
      userIds.flatMap((userId) => {
        const p = store.get(key(groupId, userId));
        return p ? [{ ...p }] : [];
      }),
    /** TIM-25 (ADR 0016): grava só com a versão atual (`0` = sem posição salva); a nova é a atual + 1. */
    save: async (groupId, userId, positions, now, expectedVersion) => {
      const prev = store.get(key(groupId, userId));
      expectVersionIn(prev?.version ?? 0, expectedVersion);
      saved.push({ groupId, userId, positions: [...positions], now });
      const next: StoredPlayer = {
        groupId,
        userId,
        positions: [...positions],
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
        version: (prev?.version ?? 0) + 1,
      };
      store.set(key(groupId, userId), next);
      return { ...next };
    },
  };

  const roster = {
    members: async (_userId: string, _groupId: string) => state.members.map((m) => ({ ...m })),
    /** GRP-11: os próximos jogos (um por horário). Com o grupo arquivado, GROUP_ARCHIVED (GRP-37). */
    upcoming: async (_userId: string, _groupId: string) => {
      if (state.group.archivedAt) throw appError('GROUP_ARCHIVED');
      return [state.game, ...state.others];
    },
    game: unused,
    guestView: unused,
  };

  /** USR-17: o PUT recebe o id público e traduz; `getMany` traz quem saiu do grupo. */
  const users = {
    resolve: async (publicIds: readonly PublicUserId[]) => resolveIn(publicIds),
  };

  const raw = createPlayerService({ groups, sports, roster, players, users, now: () => clock.now });
  const service = atTheEdge(raw);
  /** Grava direto no repositório (posição definida antes, por exemplo em outra semana). */
  const seed = (userId: UserId, positions: PlayerPosition[], groupId = GROUP_ID) =>
    players.save(
      groupId,
      userId,
      positions,
      '2026-10-01T00:00:00.000Z',
      store.get(key(groupId, userId))?.version ?? 0,
    );
  /** TIM-25: a versão que a tela mostrou, a do jogador (`0` sem posição salva); aceita o id do sistema ou o público. */
  const v = (userId: string, groupId: string = GROUP_ID) => ({
    version: store.get(key(groupId, TO_SYSTEM.get(userId) ?? userId))?.version ?? 0,
  });
  return { clock, state, saved, store, service, raw, seed, v };
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

describe('times: posições por pessoa no grupo (TIM-01)', () => {
  it('TIM-01: membros, reservas e convidados da lista vêm na lista, cada um com o papel no grupo', async () => {
    const t = setup();
    const list = await t.service.list(OWNER, GROUP_ID);

    for (const p of list) expect(PlayerSchema.parse(toWire(p))).toEqual(toWire(p));
    expect(list.map((p) => [p.userId, p.tier])).toEqual([
      [OWNER, 'member'],
      [B, 'member'],
      [A, 'member'],
      [R, 'reserve'],
      [G, 'guest'],
      [H, 'guest'],
    ]);
    expect(list.find((p) => p.userId === G)?.nickname).toBe('Gabi');
  });

  it('TIM-01: as posições são da pessoa naquele grupo; as de outro grupo não aparecem', async () => {
    const t = setup();
    await t.seed(A, ['goalkeeper'], OTHER_GROUP_ID);
    await t.seed(B, ['setter']);

    const list = await t.service.list(OWNER, GROUP_ID);

    expect(list.find((p) => p.userId === A)?.positions).toEqual([]);
    expect(list.find((p) => p.userId === B)?.positions).toEqual(['setter']);
  });

  it('TIM-01: o convidado tem posições como qualquer um (o dono define e a lista mostra)', async () => {
    const t = setup();
    const saved = await t.service.update(OWNER, GROUP_ID, G, { ...t.v(G, GROUP_ID), positions: ['libero'] });

    expect(saved).toEqual({ userId: G, nickname: 'Gabi', tier: 'guest', positions: ['libero'], version: 1 });
    const list = await t.service.list(OWNER, GROUP_ID);
    expect(list.find((p) => p.userId === G)?.positions).toEqual(['libero']);
  });
});

describe('times: posições do esporte (TIM-02)', () => {
  // O conteúdo do catálogo (vôlei, futebol, basquete e as posições) é provado em `sports/catalog.test.ts`.
  it('TIM-02: o padrão é nenhuma posição', async () => {
    const t = setup();
    const list = await t.service.list(OWNER, GROUP_ID);
    for (const p of list) expect(p.positions).toEqual([]);
  });

  it('TIM-02: a pessoa pode ter mais de uma posição do esporte, e gravar substitui as anteriores', async () => {
    const t = setup();
    const many = await t.service.update(OWNER, GROUP_ID, A, {
      ...t.v(A, GROUP_ID),
      positions: ['setter', 'middle', 'libero'],
    });
    expect(many.positions).toEqual(['setter', 'middle', 'libero']);

    const one = await t.service.update(OWNER, GROUP_ID, A, { ...t.v(A, GROUP_ID), positions: ['libero'] });
    expect(one).toEqual({ userId: A, nickname: 'Ana', tier: 'member', positions: ['libero'], version: 2 });
    expect(t.saved.at(-1)).toEqual({
      groupId: GROUP_ID,
      userId: A,
      positions: ['libero'],
      now: NOW.toISOString(),
    });

    const list = await t.service.list(OWNER, GROUP_ID);
    expect(list.find((p) => p.userId === A)?.positions).toEqual(['libero']);
  });

  it('TIM-02: a primeira é a principal: a ordem enviada é a gravada e a devolvida (no PUT e no GET)', async () => {
    const t = setup();
    const first = await t.service.update(OWNER, GROUP_ID, A, {
      ...t.v(A, GROUP_ID),
      positions: ['outside', 'middle'],
    });
    expect(first.positions).toEqual(['outside', 'middle']);
    expect(t.saved.at(-1)?.positions).toEqual(['outside', 'middle']);
    expect((await t.service.list(OWNER, GROUP_ID)).find((p) => p.userId === A)?.positions).toEqual([
      'outside',
      'middle',
    ]);

    // Trocar a principal = mesma lista em outra ordem (fora da ordem do catálogo inclusive).
    const swapped = await t.service.update(OWNER, GROUP_ID, A, {
      ...t.v(A, GROUP_ID),
      positions: ['middle', 'outside'],
    });
    expect(swapped.positions).toEqual(['middle', 'outside']);
    expect(t.saved.at(-1)?.positions).toEqual(['middle', 'outside']);
    expect((await t.service.list(OWNER, GROUP_ID)).find((p) => p.userId === A)?.positions).toEqual([
      'middle',
      'outside',
    ]);
  });

  it('TIM-02: a ordem gravada antes também volta como está na lista', async () => {
    const t = setup();
    await t.seed(B, ['libero', 'setter']);
    const list = await t.service.list(OWNER, GROUP_ID);
    expect(list.find((p) => p.userId === B)?.positions).toEqual(['libero', 'setter']);
  });

  it('TIM-02: tirar todas as posições ([]) volta ao padrão', async () => {
    const t = setup();
    await t.seed(A, ['setter']);
    const cleared = await t.service.update(OWNER, GROUP_ID, A, { ...t.v(A, GROUP_ID), positions: [] });

    expect(cleared.positions).toEqual([]);
    const list = await t.service.list(OWNER, GROUP_ID);
    expect(list.find((p) => p.userId === A)?.positions).toEqual([]);
  });

  it('TIM-02: cada esporte aceita todas as suas posições, na ordem enviada', async () => {
    const cases: [string, PlayerPosition[]][] = [
      ['volleyball', ['libero', 'opposite', 'outside', 'middle', 'setter']],
      ['soccer', ['forward', 'goalkeeper', 'defender', 'fullback', 'defensive_mid', 'midfielder']],
      ['basketball', ['center', 'guard', 'wing']],
    ];
    for (const [sportId, positions] of cases) {
      const t = setup({ group: { sportId } });
      const saved = await t.service.update(OWNER, GROUP_ID, A, { ...t.v(A, GROUP_ID), positions });
      expect(saved.positions).toEqual(positions);
    }
  });

  it('TIM-02: posição de outro esporte → TEAM_POSITION_INVALID (422) com details.position = a 1ª inválida, sem gravar', async () => {
    const t = setup();
    const err = await expectAppError(
      t.service.update(OWNER, GROUP_ID, A, {
        ...t.v(A, GROUP_ID),
        positions: ['setter', 'goalkeeper', 'center'],
      }),
      'TEAM_POSITION_INVALID',
      422,
    );
    expect(err.details).toEqual({ position: 'goalkeeper' });
    expect(t.saved).toEqual([]);
  });

  it('TIM-02: posição do futebol no basquete (atacante) → TEAM_POSITION_INVALID', async () => {
    const t = setup({ group: { sportId: 'basketball' } });
    const err = await expectAppError(
      t.service.update(OWNER, GROUP_ID, A, { ...t.v(A, GROUP_ID), positions: ['guard', 'forward'] }),
      'TEAM_POSITION_INVALID',
      422,
    );
    expect(err.details).toEqual({ position: 'forward' });
    expect(t.saved).toEqual([]);
  });

  it('TIM-02: esporte sem posições no catálogo (qualquer uma → TEAM_POSITION_INVALID; [] vale)', async () => {
    const t = setup({ group: { sportId: 'footvolley' } });
    const err = await expectAppError(
      t.service.update(OWNER, GROUP_ID, A, { ...t.v(A, GROUP_ID), positions: ['setter'] }),
      'TEAM_POSITION_INVALID',
      422,
    );
    expect(err.details).toEqual({ position: 'setter' });
    const ok = await t.service.update(OWNER, GROUP_ID, A, { ...t.v(A, GROUP_ID), positions: [] });
    expect(ok.positions).toEqual([]);
  });

  it('TIM-02: o contrato recusa posição repetida e id de posição fora do formato (ESP-02)', () => {
    expect(UpdatePlayerInputSchema.safeParse({ version: 0, positions: ['setter', 'setter'] }).success).toBe(
      false,
    );
    expect(UpdatePlayerInputSchema.safeParse({ version: 0, positions: ['Striker!'] }).success).toBe(false);
    expect(UpdatePlayerInputSchema.safeParse({ version: 0, roles: ['setter'] }).success).toBe(false);
    expect(UpdatePlayerInputSchema.safeParse({ version: 0, positions: ['middle', 'setter'] }).data).toEqual({
      version: 0,
      positions: ['middle', 'setter'],
    });
    expect(UpdatePlayerInputSchema.safeParse({ version: 0, positions: [] }).success).toBe(true);
  });

  it('TIM-02: posição no formato certo que não existe no catálogo do esporte → TEAM_POSITION_INVALID, sem gravar', async () => {
    const t = setup();
    const err = await expectAppError(
      t.service.update(OWNER, GROUP_ID, A, { ...t.v(A, GROUP_ID), positions: ['setter', 'striker'] }),
      'TEAM_POSITION_INVALID',
      422,
    );
    expect(err.details).toEqual({ position: 'striker' });
    expect(t.saved).toEqual([]);
  });
});

describe('times: posição desativada no catálogo (TIM-02, ESP-05)', () => {
  it('TIM-02 / ESP-05: posição desativada nova → TEAM_POSITION_INVALID (422) com details.position, sem gravar', async () => {
    const t = setup();
    await t.seed(A, ['setter']);
    const before = t.saved.length;
    const err = await expectAppError(
      t.service.update(OWNER, GROUP_ID, A, { ...t.v(A, GROUP_ID), positions: ['setter', 'universal'] }),
      'TEAM_POSITION_INVALID',
      422,
    );
    expect(err.details).toEqual({ position: 'universal' });
    expect(t.saved.length).toBe(before);
  });

  it('TIM-02 / ESP-05: quem já tem a posição desativada continua com ela (mantém, troca a ordem, soma ativas)', async () => {
    const t = setup();
    await t.seed(A, ['universal', 'setter']);
    expect((await t.service.list(OWNER, GROUP_ID)).find((p) => p.userId === A)?.positions).toEqual([
      'universal',
      'setter',
    ]);
    const swapped = await t.service.update(OWNER, GROUP_ID, A, {
      ...t.v(A, GROUP_ID),
      positions: ['setter', 'universal', 'libero'],
    });
    expect(swapped.positions).toEqual(['setter', 'universal', 'libero']);
  });

  it('TIM-02 / ESP-05: a desativada que alguém já tem não vale para outra pessoa', async () => {
    const t = setup();
    await t.seed(A, ['universal']);
    await expectAppError(
      t.service.update(OWNER, GROUP_ID, B, { ...t.v(B, GROUP_ID), positions: ['universal'] }),
      'TEAM_POSITION_INVALID',
      422,
    );
  });

  it('TIM-02 / ESP-05: tirou a desativada, ela não volta (escolher de novo → TEAM_POSITION_INVALID)', async () => {
    const t = setup();
    await t.seed(A, ['universal', 'setter']);
    await t.service.update(OWNER, GROUP_ID, A, { ...t.v(A, GROUP_ID), positions: ['setter'] });
    await expectAppError(
      t.service.update(OWNER, GROUP_ID, A, { ...t.v(A, GROUP_ID), positions: ['setter', 'universal'] }),
      'TEAM_POSITION_INVALID',
      422,
    );
  });

  it('TIM-02 / ESP-05: a desativada de outro grupo não conta como já existente', async () => {
    const t = setup();
    await t.seed(A, ['universal'], OTHER_GROUP_ID);
    await expectAppError(
      t.service.update(OWNER, GROUP_ID, A, { ...t.v(A, GROUP_ID), positions: ['universal'] }),
      'TEAM_POSITION_INVALID',
      422,
    );
  });
});

describe('times: todos do grupo veem, só o dono muda (TIM-03)', () => {
  it('TIM-03: membro e reserva veem a mesma lista do dono, com as posições', async () => {
    const t = setup();
    await t.seed(B, ['setter', 'libero']);
    await t.seed(G, ['middle']);
    const ofOwner = await t.service.list(OWNER, GROUP_ID);

    for (const who of [A, R]) {
      const list = await t.service.list(who, GROUP_ID);
      expect(list).toEqual(ofOwner);
      expect(list.find((p) => p.userId === B)?.positions).toEqual(['setter', 'libero']);
      expect(list.find((p) => p.userId === G)?.positions).toEqual(['middle']);
    }
  });

  it('TIM-03: membro e reserva sem cargo (sem teams.manage) → mudar responde GROUP_PERMISSION_DENIED (403), sem gravar', async () => {
    const t = setup();
    for (const who of [A, R]) {
      await expectAppError(
        t.service.update(who, GROUP_ID, B, { ...t.v(B, GROUP_ID), positions: ['setter'] }),
        'GROUP_PERMISSION_DENIED',
        403,
      );
      await expectAppError(
        t.service.update(who, GROUP_ID, who, { ...t.v(who, GROUP_ID), positions: ['setter'] }),
        'GROUP_PERMISSION_DENIED',
        403,
      );
    }
    expect(t.saved).toEqual([]);
  });

  it('TIM-03: quem não participa (convidado inclusive) ou grupo inexistente → GROUP_NOT_FOUND (404) para ver e mudar', async () => {
    const t = setup();
    for (const who of [OUTSIDER, G]) {
      await expectAppError(t.service.list(who, GROUP_ID), 'GROUP_NOT_FOUND', 404);
      await expectAppError(
        t.service.update(who, GROUP_ID, A, { ...t.v(A, GROUP_ID), positions: ['setter'] }),
        'GROUP_NOT_FOUND',
        404,
      );
    }
    await expectAppError(t.service.list(OWNER, OTHER_GROUP_ID), 'GROUP_NOT_FOUND', 404);
    await expectAppError(
      t.service.update(OWNER, OTHER_GROUP_ID, A, { ...t.v(A, OTHER_GROUP_ID), positions: ['setter'] }),
      'GROUP_NOT_FOUND',
      404,
    );
    expect(t.saved).toEqual([]);
  });

  it('TIM-03: a permissão vem antes da validação (sem teams.manage, com posição inválida e pessoa de fora → 403)', async () => {
    const t = setup({ group: { sportId: 'basketball' } });
    await expectAppError(
      t.service.update(A, GROUP_ID, OUTSIDER, { ...t.v(OUTSIDER, GROUP_ID), positions: ['setter'] }),
      'GROUP_PERMISSION_DENIED',
      403,
    );
  });

  it('TIM-03: grupo arquivado → mudar responde GROUP_ARCHIVED (antes de conferir pessoa e posição)', async () => {
    const t = setup({ group: { archivedAt: '2026-11-01T00:00:00.000Z' } });
    await expectAppError(
      t.service.update(OWNER, GROUP_ID, A, { ...t.v(A, GROUP_ID), positions: ['setter'] }),
      'GROUP_ARCHIVED',
      409,
    );
    await expectAppError(
      t.service.update(OWNER, GROUP_ID, OUTSIDER, { ...t.v(OUTSIDER, GROUP_ID), positions: ['goalkeeper'] }),
      'GROUP_ARCHIVED',
      409,
    );
    expect(t.saved).toEqual([]);
  });

  it('TIM-03: grupo arquivado → ver continua valendo para o dono, membros e reservas', async () => {
    const t = setup({ group: { archivedAt: '2026-11-01T00:00:00.000Z' } });
    await t.seed(B, ['setter']);

    for (const who of [OWNER, A, R]) {
      const list = await t.service.list(who, GROUP_ID);
      expect(list.find((p) => p.userId === B)?.positions).toEqual(['setter']);
    }
  });
});

describe('times: quem o dono classifica (TIM-04)', () => {
  it('TIM-04: a lista segue a ordem dos membros e depois os convidados na ordem do jogo (dentro, depois fila)', async () => {
    const t = setup();
    const list = await t.service.list(OWNER, GROUP_ID);

    // Membro/reserva que está no jogo aparece uma vez só, na posição dos membros.
    expect(ids(list)).toEqual([OWNER, B, A, R, G, H]);
  });

  it('TIM-04: convidados seguem a ordem do jogo, não a de quem foi gravado antes', async () => {
    const t = setup({
      game: gameOf([attendee(H, 'Heitor', 'guest', 0)], [attendee(G, 'Gabi', 'guest', 1)]),
    });
    await t.seed(G, ['libero']);
    const list = await t.service.list(OWNER, GROUP_ID);
    expect(ids(list)).toEqual([OWNER, B, A, R, H, G]);
  });

  it('TIM-04: grupo arquivado não tem jogo → a lista tem só membros e reservas', async () => {
    const t = setup({ group: { archivedAt: '2026-11-01T00:00:00.000Z' } });
    const list = await t.service.list(OWNER, GROUP_ID);
    expect(ids(list)).toEqual([OWNER, B, A, R]);
  });

  it('TIM-04: o dono define para membro, reserva, convidado dentro e convidado na fila', async () => {
    const t = setup();
    const cases: [UserId, Attendee['tier']][] = [
      [OWNER, 'member'],
      [B, 'member'],
      [R, 'reserve'],
      [G, 'guest'],
      [H, 'guest'],
    ];
    for (const [who, role] of cases) {
      const p = await t.service.update(OWNER, GROUP_ID, who, {
        ...t.v(who, GROUP_ID),
        positions: ['setter'],
      });
      expect(p).toMatchObject({ userId: who, tier: role, positions: ['setter'] });
    }
  });

  it('TIM-04: pessoa fora do grupo e da lista → TEAM_PLAYER_NOT_FOUND (404), antes de conferir a posição', async () => {
    const t = setup();
    await expectAppError(
      t.service.update(OWNER, GROUP_ID, OUTSIDER, { ...t.v(OUTSIDER, GROUP_ID), positions: ['setter'] }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );
    await expectAppError(
      t.service.update(OWNER, GROUP_ID, OUTSIDER, { ...t.v(OUTSIDER, GROUP_ID), positions: ['goalkeeper'] }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );
    expect(t.saved).toEqual([]);
  });

  it('TIM-04: o convidado que saiu da lista não pode ser classificado, e o que tinha fica guardado para quando voltar', async () => {
    const t = setup();
    await t.service.update(OWNER, GROUP_ID, G, { ...t.v(G, GROUP_ID), positions: ['libero'] });

    // Desistiu: sai da lista do jogo.
    t.state.game = gameOf([attendee(A, 'Ana', 'member', 0)], [attendee(H, 'Heitor', 'guest', 3)]);
    expect(ids(await t.service.list(OWNER, GROUP_ID))).not.toContain(G);
    await expectAppError(
      t.service.update(OWNER, GROUP_ID, G, { ...t.v(G, GROUP_ID), positions: ['setter'] }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );

    // Outra semana, confirma de novo: as posições continuam lá.
    t.clock.now = LATER;
    t.state.game = gameOf([attendee(G, 'Gabi', 'guest', 5)], []);
    const back = await t.service.list(OWNER, GROUP_ID);
    expect(back.find((p) => p.userId === G)).toMatchObject({ tier: 'guest', positions: ['libero'] });
  });

  it('TIM-04: o membro que sai do grupo e volta mantém as posições', async () => {
    const t = setup();
    await t.service.update(OWNER, GROUP_ID, B, { ...t.v(B, GROUP_ID), positions: ['setter'] });

    t.state.members = MEMBERS.filter((m) => m.userId !== B);
    expect(ids(await t.service.list(OWNER, GROUP_ID))).not.toContain(B);

    t.state.members = [...MEMBERS.filter((m) => m.userId !== B), member(B, 'Beatriz', 'reserve')];
    const back = await t.service.list(OWNER, GROUP_ID);
    expect(back.find((p) => p.userId === B)).toMatchObject({ tier: 'reserve', positions: ['setter'] });
  });

  it('TIM-04: mudar de novo grava com a hora atual e não apaga o que existe para outras pessoas', async () => {
    const t = setup();
    await t.seed(A, ['setter']);
    await t.seed(G, ['libero']);
    t.clock.now = LATER;
    await t.service.update(OWNER, GROUP_ID, A, { ...t.v(A, GROUP_ID), positions: ['libero'] });

    expect(t.saved.at(-1)?.now).toBe(LATER.toISOString());
    const list = await t.service.list(OWNER, GROUP_ID);
    expect(list.find((p) => p.userId === A)?.positions).toEqual(['libero']);
    expect(list.find((p) => p.userId === G)?.positions).toEqual(['libero']);
  });
});

describe('jogadores pelo id público (USR-16, USR-17)', () => {
  it('USR-16: a lista de jogadores sai só com ids públicos', async () => {
    const t = setup();
    const list = await t.raw.list(OWNER, GROUP_ID);
    expect(list.map((p) => p.userId)).toEqual([OWNER, B, A, R, G, H].map(pub));
    expect(leaksSystemId(list)).toBe(false);
  });

  it('USR-17: o PUT recebe o id público, grava pelo id do sistema e devolve o público', async () => {
    const t = setup();
    const saved = await t.raw.update(OWNER, GROUP_ID, pub(A), {
      ...t.v(pub(A), GROUP_ID),
      positions: ['setter'],
    });
    expect(saved).toEqual({
      userId: pub(A),
      nickname: 'Ana',
      tier: 'member',
      positions: ['setter'],
      version: 1,
    });
    expect(t.saved.at(-1)).toMatchObject({ groupId: GROUP_ID, userId: A, positions: ['setter'] });
  });

  it('USR-17: id público que não existe → TEAM_PLAYER_NOT_FOUND (o mesmo de quem não está), sem gravar', async () => {
    const t = setup();
    const unknown = await expectAppError(
      t.raw.update(OWNER, GROUP_ID, UNKNOWN, { ...t.v(UNKNOWN, GROUP_ID), positions: ['setter'] }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );
    const outsider = await expectAppError(
      t.raw.update(OWNER, GROUP_ID, pub(OUTSIDER), {
        ...t.v(pub(OUTSIDER), GROUP_ID),
        positions: ['setter'],
      }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );
    expect(unknown.message).toBe(outsider.message);
    expect(t.saved).toEqual([]);
  });

  it('USR-17: o id do sistema no lugar do público não acha ninguém (TEAM_PLAYER_NOT_FOUND)', async () => {
    const t = setup();
    await expectAppError(
      t.raw.update(OWNER, GROUP_ID, A as unknown as PublicUserId, {
        ...t.v(A as unknown as PublicUserId, GROUP_ID),
        positions: ['setter'],
      }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );
    expect(t.saved).toEqual([]);
  });

  it('USR-17: a permissão vem de quem pede: membro mudando a posição de outro → GROUP_PERMISSION_DENIED', async () => {
    const t = setup();
    await expectAppError(
      t.raw.update(A, GROUP_ID, pub(B), { ...t.v(pub(B), GROUP_ID), positions: ['setter'] }),
      'GROUP_PERMISSION_DENIED',
      403,
    );
    expect(t.saved).toEqual([]);
  });
});

describe('posições com cargo (TIM-03, GRP-49, 53)', () => {
  it('TIM-03: membro e reserva com o cargo Admin (teams.manage) mudam as posições', async () => {
    const t = setup();
    for (const who of [A, R]) {
      t.state.staff[who] = 'admin';
      const p = await t.service.update(who, GROUP_ID, B, { ...t.v(B, GROUP_ID), positions: ['setter'] });
      expect(p).toMatchObject({ userId: B, positions: ['setter'] });
    }
    expect(t.saved).toHaveLength(2);
  });

  it('TIM-03: sem cargo, a resposta traz a permissão que faltou (teams.manage)', async () => {
    const t = setup();
    const err = await expectAppError(
      t.service.update(A, GROUP_ID, B, { ...t.v(B, GROUP_ID), positions: ['setter'] }),
      'GROUP_PERMISSION_DENIED',
      403,
    );
    expect(err.details).toEqual({ permission: 'teams.manage' });
  });

  it('GRP-53: mudar as posições de quem tem cargo segue as regras normais (o dono muda as do Admin)', async () => {
    const t = setup();
    t.state.staff[A] = 'admin';
    const p = await t.service.update(OWNER, GROUP_ID, A, { ...t.v(A, GROUP_ID), positions: ['libero'] });
    expect(p).toMatchObject({ userId: A, positions: ['libero'] });
  });

  it('GRP-52: um cargo que não existe mais conta como sem cargo → GROUP_PERMISSION_DENIED', async () => {
    const t = setup();
    t.state.staff[A] = 'organizer' as never;
    await expectAppError(
      t.service.update(A, GROUP_ID, B, { ...t.v(B, GROUP_ID), positions: ['setter'] }),
      'GROUP_PERMISSION_DENIED',
      403,
    );
    expect(t.saved).toEqual([]);
  });
});

describe('times: a versão que a tela mostrou nas posições (TIM-25)', () => {
  it('TIM-25: pessoa sem posição vem com version 0, e o 1º PUT com 0 grava e devolve a version 1', async () => {
    const t = setup();
    expect((await t.service.list(OWNER, GROUP_ID)).find((p) => p.userId === A)?.version).toBe(0);
    const saved = await t.service.update(OWNER, GROUP_ID, A, { version: 0, positions: ['setter'] });
    expect(saved.version).toBe(1);
    expect((await t.service.list(OWNER, GROUP_ID)).find((p) => p.userId === A)?.version).toBe(1);
  });

  it('TIM-25: a lista traz a version de cada um, e o PUT com ela soma 1', async () => {
    const t = setup();
    await t.seed(A, ['setter']);
    await t.seed(A, ['middle']);
    expect((await t.service.list(OWNER, GROUP_ID)).find((p) => p.userId === A)?.version).toBe(2);
    const saved = await t.service.update(OWNER, GROUP_ID, A, { version: 2, positions: ['libero'] });
    expect(saved).toMatchObject({ positions: ['libero'], version: 3 });
  });

  it('TIM-25: PUT com a versão velha → VERSION_CONFLICT (409, currentVersion) e as posições ficam', async () => {
    const t = setup();
    await t.seed(A, ['setter']);
    await t.seed(A, ['middle']);
    const before = t.saved.length;
    const err = await expectAppError(
      t.service.update(OWNER, GROUP_ID, A, { version: 1, positions: ['libero'] }),
      'VERSION_CONFLICT',
      409,
    );
    expect(err.details).toEqual({ currentVersion: 2 });
    expect(t.saved.length).toBe(before);
    expect((await t.service.list(OWNER, GROUP_ID)).find((p) => p.userId === A)?.positions).toEqual([
      'middle',
    ]);
  });

  it('TIM-25: alguém salvou as posições antes → o PUT com 0 dá VERSION_CONFLICT com a versão de agora', async () => {
    const t = setup();
    await t.seed(A, ['setter']);
    const err = await expectAppError(
      t.service.update(OWNER, GROUP_ID, A, { version: 0, positions: ['libero'] }),
      'VERSION_CONFLICT',
      409,
    );
    expect(err.details).toEqual({ currentVersion: 1 });
  });

  it('TIM-25: o contrato exige a version (inteiro ≥ 0) no PUT', () => {
    expect(UpdatePlayerInputSchema.safeParse({ positions: ['setter'] }).success).toBe(false);
    expect(UpdatePlayerInputSchema.safeParse({ version: 1.5, positions: ['setter'] }).success).toBe(false);
    expect(UpdatePlayerInputSchema.safeParse({ version: 0, positions: ['setter'] }).success).toBe(true);
  });
});

// Horários e jogo próprio (`.claude/work/horarios-jogo.md`): o grupo pode ter mais de um próximo jogo (GRP-11).
describe('times: quem o dono classifica com mais de um próximo jogo (TIM-04)', () => {
  const satGame = (confirmed: RosterAttendee[], waitlist: RosterAttendee[] = []) =>
    gameOf(confirmed, waitlist, {
      id: 'eeeeeeee-0000-4000-8000-000000000002_2026-11-07',
      scheduleId: 'eeeeeeee-0000-4000-8000-000000000002',
      date: '2026-11-07',
      startsAt: '2026-11-07T12:00:00.000Z',
      endsAt: '2026-11-07T14:00:00.000Z',
    });

  it('TIM-04: o convidado da lista de qualquer um dos próximos jogos entra na lista e pode ser classificado', async () => {
    const t = setup({ game: gameOf([attendee(A, 'Ana', 'member', 0)], []) });
    t.state.others = [satGame([attendee(OUTSIDER, 'Fora', 'guest', 0)], [attendee(H, 'Heitor', 'guest', 1)])];
    const list = await t.service.list(OWNER, GROUP_ID);
    expect(ids(list)).toEqual(expect.arrayContaining([OUTSIDER, H]));
    const p = await t.service.update(OWNER, GROUP_ID, OUTSIDER, { ...t.v(OUTSIDER), positions: ['setter'] });
    expect(p).toMatchObject({ userId: OUTSIDER, tier: 'guest', positions: ['setter'] });
  });

  it('TIM-04: o convidado que está em dois dos próximos jogos aparece uma vez só, depois dos membros', async () => {
    const t = setup();
    t.state.others = [satGame([attendee(G, 'Gabi', 'guest', 0)])];
    const list = await t.service.list(OWNER, GROUP_ID);
    expect(ids(list).filter((id) => id === G)).toHaveLength(1);
    expect(ids(list).slice(0, 4)).toEqual([OWNER, B, A, R]);
  });
});
