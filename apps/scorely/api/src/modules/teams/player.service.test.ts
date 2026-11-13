import { AppError, appError } from '@scorely/api/src/lib/errors';
import { asUserId, type UserId } from '@scorely/api/src/lib/ids';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import type { PlayerRepository, StoredPlayer } from '@scorely/api/src/modules/teams/player.repository';
import { canManageTeams, createPlayerService } from '@scorely/api/src/modules/teams/player.service';
import {
  type Attendee,
  type ErrorCode,
  type Game,
  type Member,
  type MemberRole,
  type PlayerPosition,
  PlayerSchema,
  type PublicUserId,
  PublicUserIdSchema,
  SPORT_POSITIONS,
  type Sport,
  UpdatePlayerInputSchema,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

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
const LATER = new Date('2026-11-12T13:00:00.000Z');

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
    ownerPublicId: pub(OWNER),
    inviteToken: 'tok-member',
    reserveInviteToken: 'tok-reserve',
    guestToken: 'tok-guest',
    maxMembers: 30,
    maxReserves: 30,
    ...extra,
  };
}

const member = (userId: UserId, name: string, role: MemberRole = 'member'): RosterMember => ({
  userId,
  publicId: pub(userId),
  name,
  isOwner: userId === OWNER,
  role,
});

const attendee = (userId: UserId, name: string, role: Attendee['role'], minute: number): RosterAttendee => ({
  userId,
  publicId: pub(userId),
  name,
  role,
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
function gameOf(confirmed: RosterAttendee[], waitlist: RosterAttendee[]): RosterGame {
  return {
    groupId: GROUP_ID,
    date: '2026-11-06',
    startsAt: '2026-11-06T22:00:00.000Z',
    opensAt: '2026-11-04T22:00:00.000Z',
    reservesOpensAt: '2026-11-05T22:00:00.000Z',
    guestsOpensAt: '2026-11-06T10:00:00.000Z',
    status: 'open',
    slots: 12,
    confirmed,
    waitlist,
  };
}

const GAME = gameOf(
  [attendee(A, 'Ana', 'member', 0), attendee(G, 'Gabi', 'guest', 1), attendee(R, 'Rafa', 'reserve', 2)],
  [attendee(H, 'Heitor', 'guest', 3)],
);

const unused = () => Promise.reject(new Error('not used by the teams module'));

/**
 * Contexto em memória. `state` é mutável de propósito (sair do grupo/da lista entre chamadas).
 * Participação do grupo: os membros do roster; o `currentGame` responde `GROUP_ARCHIVED` com o grupo arquivado
 * (o jogo só existe com o grupo ativo, GRP-37), então o service não deve chamá-lo nesse caso.
 */
function setup(opts: { group?: Partial<StoredGroup>; members?: RosterMember[]; game?: RosterGame } = {}) {
  const clock = { now: NOW };
  const state = {
    group: storedGroup(opts.group),
    members: opts.members ?? MEMBERS,
    game: opts.game ?? GAME,
  };
  const saved: { groupId: string; userId: string; positions: PlayerPosition[]; now: string }[] = [];
  const store = new Map<string, StoredPlayer>();
  const key = (groupId: string, userId: string) => `${groupId}#${userId}`;

  const groups: GroupRepository = {
    get: async (id) => (id === state.group.id ? state.group : undefined),
    roleOf: async (groupId, userId) =>
      groupId === state.group.id ? state.members.find((m) => m.userId === userId)?.role : undefined,
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

  const players: PlayerRepository = {
    getMany: async (groupId, userIds) =>
      userIds.flatMap((userId) => {
        const p = store.get(key(groupId, userId));
        return p ? [{ ...p }] : [];
      }),
    save: async (groupId, userId, positions, now) => {
      saved.push({ groupId, userId, positions: [...positions], now });
      const prev = store.get(key(groupId, userId));
      const next: StoredPlayer = {
        groupId,
        userId,
        positions: [...positions],
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      };
      store.set(key(groupId, userId), next);
      return { ...next };
    },
  };

  const roster = {
    members: async (_userId: string, _groupId: string) => state.members.map((m) => ({ ...m })),
    currentGame: async (_userId: string, _groupId: string) => {
      if (state.group.archivedAt) throw appError('GROUP_ARCHIVED');
      return state.game;
    },
  };

  /** USR-17: o PUT recebe o id público e traduz; `getMany` traz quem saiu do grupo. */
  const users = {
    resolve: async (publicIds: readonly PublicUserId[]) => resolveIn(publicIds),
  };

  const raw = createPlayerService({ groups, roster, players, users, now: () => clock.now });
  const service = atTheEdge(raw);
  /** Grava direto no repositório (posição definida antes, por exemplo em outra semana). */
  const seed = (userId: UserId, positions: PlayerPosition[], groupId = GROUP_ID) =>
    players.save(groupId, userId, positions, '2026-10-01T00:00:00.000Z');
  return { clock, state, saved, store, service, raw, seed };
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
    expect(list.map((p) => [p.userId, p.role])).toEqual([
      [OWNER, 'member'],
      [B, 'member'],
      [A, 'member'],
      [R, 'reserve'],
      [G, 'guest'],
      [H, 'guest'],
    ]);
    expect(list.find((p) => p.userId === G)?.name).toBe('Gabi');
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
    const saved = await t.service.update(OWNER, GROUP_ID, G, { positions: ['libero'] });

    expect(saved).toEqual({ userId: G, name: 'Gabi', role: 'guest', positions: ['libero'] });
    const list = await t.service.list(OWNER, GROUP_ID);
    expect(list.find((p) => p.userId === G)?.positions).toEqual(['libero']);
  });
});

describe('times: posições do esporte (TIM-02)', () => {
  it('TIM-02: catálogo do contrato = todas as posições de cada esporte, na ordem de exibição', () => {
    const expected: Record<Sport, PlayerPosition[]> = {
      volleyball: ['setter', 'opposite', 'outside', 'middle', 'libero'],
      soccer: ['goalkeeper', 'defender', 'fullback', 'defensive_mid', 'midfielder', 'forward'],
      basketball: ['guard', 'wing', 'center'],
      other: [],
    };
    for (const sport of Object.keys(expected) as Sport[]) {
      expect([...SPORT_POSITIONS[sport]]).toEqual(expected[sport]);
    }
  });

  it('TIM-02: o padrão é nenhuma posição', async () => {
    const t = setup();
    const list = await t.service.list(OWNER, GROUP_ID);
    for (const p of list) expect(p.positions).toEqual([]);
  });

  it('TIM-02: a pessoa pode ter mais de uma posição do esporte, e gravar substitui as anteriores', async () => {
    const t = setup();
    const many = await t.service.update(OWNER, GROUP_ID, A, { positions: ['setter', 'middle', 'libero'] });
    expect(many.positions).toEqual(['setter', 'middle', 'libero']);

    const one = await t.service.update(OWNER, GROUP_ID, A, { positions: ['libero'] });
    expect(one).toEqual({ userId: A, name: 'Ana', role: 'member', positions: ['libero'] });
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
    const first = await t.service.update(OWNER, GROUP_ID, A, { positions: ['outside', 'middle'] });
    expect(first.positions).toEqual(['outside', 'middle']);
    expect(t.saved.at(-1)?.positions).toEqual(['outside', 'middle']);
    expect((await t.service.list(OWNER, GROUP_ID)).find((p) => p.userId === A)?.positions).toEqual([
      'outside',
      'middle',
    ]);

    // Trocar a principal = mesma lista em outra ordem (fora da ordem do catálogo inclusive).
    const swapped = await t.service.update(OWNER, GROUP_ID, A, { positions: ['middle', 'outside'] });
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
    const cleared = await t.service.update(OWNER, GROUP_ID, A, { positions: [] });

    expect(cleared.positions).toEqual([]);
    const list = await t.service.list(OWNER, GROUP_ID);
    expect(list.find((p) => p.userId === A)?.positions).toEqual([]);
  });

  it('TIM-02: cada esporte aceita todas as suas posições, na ordem enviada', async () => {
    const cases: [Sport, PlayerPosition[]][] = [
      ['volleyball', ['libero', 'opposite', 'outside', 'middle', 'setter']],
      ['soccer', ['forward', 'goalkeeper', 'defender', 'fullback', 'defensive_mid', 'midfielder']],
      ['basketball', ['center', 'guard', 'wing']],
    ];
    for (const [sport, positions] of cases) {
      const t = setup({ group: { sport } });
      const saved = await t.service.update(OWNER, GROUP_ID, A, { positions });
      expect(saved.positions).toEqual(positions);
    }
  });

  it('TIM-02: posição de outro esporte → TEAM_POSITION_INVALID (422) com details.position = a 1ª inválida, sem gravar', async () => {
    const t = setup();
    const err = await expectAppError(
      t.service.update(OWNER, GROUP_ID, A, { positions: ['setter', 'goalkeeper', 'center'] }),
      'TEAM_POSITION_INVALID',
      422,
    );
    expect(err.details).toEqual({ position: 'goalkeeper' });
    expect(t.saved).toEqual([]);
  });

  it('TIM-02: posição do futebol no basquete (atacante) → TEAM_POSITION_INVALID', async () => {
    const t = setup({ group: { sport: 'basketball' } });
    const err = await expectAppError(
      t.service.update(OWNER, GROUP_ID, A, { positions: ['guard', 'forward'] }),
      'TEAM_POSITION_INVALID',
      422,
    );
    expect(err.details).toEqual({ position: 'forward' });
    expect(t.saved).toEqual([]);
  });

  it('TIM-02: outro não tem posição nenhuma (qualquer uma → TEAM_POSITION_INVALID; [] vale)', async () => {
    const t = setup({ group: { sport: 'other' } });
    const err = await expectAppError(
      t.service.update(OWNER, GROUP_ID, A, { positions: ['setter'] }),
      'TEAM_POSITION_INVALID',
      422,
    );
    expect(err.details).toEqual({ position: 'setter' });
    const ok = await t.service.update(OWNER, GROUP_ID, A, { positions: [] });
    expect(ok.positions).toEqual([]);
  });

  it('TIM-02: o contrato recusa posição repetida e posição fora do catálogo', () => {
    expect(UpdatePlayerInputSchema.safeParse({ positions: ['setter', 'setter'] }).success).toBe(false);
    expect(UpdatePlayerInputSchema.safeParse({ positions: ['striker'] }).success).toBe(false);
    expect(UpdatePlayerInputSchema.safeParse({ roles: ['setter'] }).success).toBe(false);
    expect(UpdatePlayerInputSchema.safeParse({ positions: ['middle', 'setter'] }).data).toEqual({
      positions: ['middle', 'setter'],
    });
    expect(UpdatePlayerInputSchema.safeParse({ positions: [] }).success).toBe(true);
  });
});

describe('times: todos do grupo veem, só o dono muda (TIM-03)', () => {
  it('TIM-03: canManageTeams é verdadeiro só para o dono', () => {
    const group = storedGroup();
    expect(canManageTeams(group, OWNER)).toBe(true);
    expect(canManageTeams(group, A)).toBe(false);
    expect(canManageTeams(group, R)).toBe(false);
  });

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

  it('TIM-03: membro e reserva que não são donos → mudar responde GROUP_NOT_OWNER (403), sem gravar', async () => {
    const t = setup();
    for (const who of [A, R]) {
      await expectAppError(
        t.service.update(who, GROUP_ID, B, { positions: ['setter'] }),
        'GROUP_NOT_OWNER',
        403,
      );
      await expectAppError(
        t.service.update(who, GROUP_ID, who, { positions: ['setter'] }),
        'GROUP_NOT_OWNER',
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
        t.service.update(who, GROUP_ID, A, { positions: ['setter'] }),
        'GROUP_NOT_FOUND',
        404,
      );
    }
    await expectAppError(t.service.list(OWNER, OTHER_GROUP_ID), 'GROUP_NOT_FOUND', 404);
    await expectAppError(
      t.service.update(OWNER, OTHER_GROUP_ID, A, { positions: ['setter'] }),
      'GROUP_NOT_FOUND',
      404,
    );
    expect(t.saved).toEqual([]);
  });

  it('TIM-03: a permissão vem antes da validação (não dono com posição inválida e pessoa de fora → 403)', async () => {
    const t = setup({ group: { sport: 'basketball' } });
    await expectAppError(
      t.service.update(A, GROUP_ID, OUTSIDER, { positions: ['setter'] }),
      'GROUP_NOT_OWNER',
      403,
    );
  });

  it('TIM-03: grupo arquivado → mudar responde GROUP_ARCHIVED (antes de conferir pessoa e posição)', async () => {
    const t = setup({ group: { archivedAt: '2026-11-01T00:00:00.000Z' } });
    await expectAppError(
      t.service.update(OWNER, GROUP_ID, A, { positions: ['setter'] }),
      'GROUP_ARCHIVED',
      409,
    );
    await expectAppError(
      t.service.update(OWNER, GROUP_ID, OUTSIDER, { positions: ['goalkeeper'] }),
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
    const cases: [UserId, Attendee['role']][] = [
      [OWNER, 'member'],
      [B, 'member'],
      [R, 'reserve'],
      [G, 'guest'],
      [H, 'guest'],
    ];
    for (const [who, role] of cases) {
      const p = await t.service.update(OWNER, GROUP_ID, who, { positions: ['setter'] });
      expect(p).toMatchObject({ userId: who, role, positions: ['setter'] });
    }
  });

  it('TIM-04: pessoa fora do grupo e da lista → TEAM_PLAYER_NOT_FOUND (404), antes de conferir a posição', async () => {
    const t = setup();
    await expectAppError(
      t.service.update(OWNER, GROUP_ID, OUTSIDER, { positions: ['setter'] }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );
    await expectAppError(
      t.service.update(OWNER, GROUP_ID, OUTSIDER, { positions: ['goalkeeper'] }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );
    expect(t.saved).toEqual([]);
  });

  it('TIM-04: o convidado que saiu da lista não pode ser classificado, e o que tinha fica guardado para quando voltar', async () => {
    const t = setup();
    await t.service.update(OWNER, GROUP_ID, G, { positions: ['libero'] });

    // Desistiu: sai da lista do jogo.
    t.state.game = gameOf([attendee(A, 'Ana', 'member', 0)], [attendee(H, 'Heitor', 'guest', 3)]);
    expect(ids(await t.service.list(OWNER, GROUP_ID))).not.toContain(G);
    await expectAppError(
      t.service.update(OWNER, GROUP_ID, G, { positions: ['setter'] }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );

    // Outra semana, confirma de novo: as posições continuam lá.
    t.clock.now = LATER;
    t.state.game = gameOf([attendee(G, 'Gabi', 'guest', 5)], []);
    const back = await t.service.list(OWNER, GROUP_ID);
    expect(back.find((p) => p.userId === G)).toMatchObject({ role: 'guest', positions: ['libero'] });
  });

  it('TIM-04: o membro que sai do grupo e volta mantém as posições', async () => {
    const t = setup();
    await t.service.update(OWNER, GROUP_ID, B, { positions: ['setter'] });

    t.state.members = MEMBERS.filter((m) => m.userId !== B);
    expect(ids(await t.service.list(OWNER, GROUP_ID))).not.toContain(B);

    t.state.members = [...MEMBERS.filter((m) => m.userId !== B), member(B, 'Beatriz', 'reserve')];
    const back = await t.service.list(OWNER, GROUP_ID);
    expect(back.find((p) => p.userId === B)).toMatchObject({ role: 'reserve', positions: ['setter'] });
  });

  it('TIM-04: mudar de novo grava com a hora atual e não apaga o que existe para outras pessoas', async () => {
    const t = setup();
    await t.seed(A, ['setter']);
    await t.seed(G, ['libero']);
    t.clock.now = LATER;
    await t.service.update(OWNER, GROUP_ID, A, { positions: ['libero'] });

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
    const saved = await t.raw.update(OWNER, GROUP_ID, pub(A), { positions: ['setter'] });
    expect(saved).toEqual({ userId: pub(A), name: 'Ana', role: 'member', positions: ['setter'] });
    expect(t.saved.at(-1)).toMatchObject({ groupId: GROUP_ID, userId: A, positions: ['setter'] });
  });

  it('USR-17: id público que não existe → TEAM_PLAYER_NOT_FOUND (o mesmo de quem não está), sem gravar', async () => {
    const t = setup();
    const unknown = await expectAppError(
      t.raw.update(OWNER, GROUP_ID, UNKNOWN, { positions: ['setter'] }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );
    const outsider = await expectAppError(
      t.raw.update(OWNER, GROUP_ID, pub(OUTSIDER), { positions: ['setter'] }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );
    expect(unknown.message).toBe(outsider.message);
    expect(t.saved).toEqual([]);
  });

  it('USR-17: o id do sistema no lugar do público não acha ninguém (TEAM_PLAYER_NOT_FOUND)', async () => {
    const t = setup();
    await expectAppError(
      t.raw.update(OWNER, GROUP_ID, A as unknown as PublicUserId, { positions: ['setter'] }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );
    expect(t.saved).toEqual([]);
  });

  it('USR-17: a permissão vem de quem pede: membro mudando a posição de outro → GROUP_NOT_OWNER', async () => {
    const t = setup();
    await expectAppError(
      t.raw.update(A, GROUP_ID, pub(B), { positions: ['setter'] }),
      'GROUP_NOT_OWNER',
      403,
    );
    expect(t.saved).toEqual([]);
  });
});
