import { AppError } from '@scorely/api/src/lib/errors';
import { asUserId, type UserId } from '@scorely/api/src/lib/ids';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import type {
  StoredTeamSettings,
  TeamSettingsRepository,
} from '@scorely/api/src/modules/teams/settings.repository';
import { createTeamSettingsService } from '@scorely/api/src/modules/teams/settings.service';
import type { UserRecord } from '@scorely/api/src/modules/users/user.repository';
import {
  type Attendee,
  type ErrorCode,
  type Game,
  type Member,
  type MemberRole,
  type PublicUserId,
  PublicUserIdSchema,
  type StaffRoleId,
  TEAM_APART_LIMITS,
  TEAM_RULE_LIMITS,
  type TeamRule,
  TeamSettingsSchema,
  UpdateTeamSettingsInputSchema,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// E3 etapa 4 (`.claude/work/e3-times-4.md`): configuração de times do grupo, TIM-17 e TIM-18.
// Interface assumida (não está no doc nem no arquivo de trabalho; ver o relatório do test-writer):
//   settings.repository.ts: `TeamSettingsRepository { get(groupId), put(stored) }`, `StoredTeamSettings = TeamSettings & { groupId, createdAt, updatedAt }`;
//   settings.service.ts: `createTeamSettingsService({ groups, settings, now })` com `get(userId, groupId)` e `update(userId, groupId, input)`.
// E3 etapas 5 e 6 (`.claude/work/e3-times-5-6.md`): times opostos (TIM-22) e a preferência de gênero (TIM-23).
// Interface assumida (o arquivo de trabalho diz "a mesma lista do player.service, TIM-04", sem definir as deps):
//   o service ganha `roster: { members(userId, groupId), currentGame(userId, groupId) }` (o mesmo de `TeamsDeps`)
//   e `users: Pick<UserDirectory, 'getMany'>` (o nome de quem está nos opostos, inclusive quem saiu do grupo).

const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GROUP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER = asUserId('11111111-1111-4111-8111-111111111111');
const A = asUserId('22222222-2222-4222-8222-222222222222');
const R = asUserId('88888888-8888-4888-8888-888888888888');
const OUTSIDER = asUserId('66666666-6666-4666-8666-666666666666');
/** Convidado dentro da lista do jogo atual. */
const G = asUserId('99999999-9999-4999-8999-999999999999');
/** Convidado na fila do jogo atual. */
const H = asUserId('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
/** Membro que saiu do grupo (não está nos membros nem no jogo). */
const LEFT = asUserId('77777777-7777-4777-8777-777777777777');

const NAMES: Record<string, string> = {
  [OWNER]: 'Dono',
  [A]: 'Ana',
  [R]: 'Rafa',
  [G]: 'Gabi',
  [H]: 'Heitor',
  [LEFT]: 'Lia',
  [OUTSIDER]: 'Fora',
};

const PEOPLE: UserId[] = [OWNER, A, R, G, H, OUTSIDER, LEFT];
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

const NOW = new Date('2026-11-12T13:00:00.000Z');

const DEFAULTS = { teamCount: 2, rules: [], allowOutsideRules: false };
/** A resposta com o que falta no input: sem opostos, sem a preferência e sem nomes. */
const full = <T extends object>(input: T) => ({ apart: [], spreadGender: false, names: {}, ...input });

const SETTER_ONE: TeamRule = { target: { kind: 'position', position: 'setter' }, min: 1, max: 1 };
const WOMEN_TWO: TeamRule = { target: { kind: 'gender', gender: 'F' }, min: 2 };
const LIBERO_MAX: TeamRule = { target: { kind: 'position', position: 'libero' }, max: 1 };

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

const unused = () => Promise.reject(new Error('not used by the team settings'));

const attendee = (userId: UserId, role: Attendee['role'], minute: number): RosterAttendee => ({
  userId,
  publicId: pub(userId),
  name: NAMES[userId],
  role,
  confirmedAt: new Date(Date.UTC(2026, 10, 11, 22, minute)).toISOString(),
});

/** Jogo atual: A e o convidado G dentro, o convidado H na fila. */
const GAME: RosterGame = {
  groupId: GROUP_ID,
  date: '2026-11-13',
  startsAt: '2026-11-13T22:00:00.000Z',
  opensAt: '2026-11-11T22:00:00.000Z',
  reservesOpensAt: '2026-11-12T22:00:00.000Z',
  guestsOpensAt: '2026-11-13T10:00:00.000Z',
  status: 'open',
  slots: 12,
  confirmed: [attendee(A, 'member', 0), attendee(G, 'guest', 1)],
  waitlist: [attendee(H, 'guest', 2)],
};

/**
 * Contexto em memória. `state` é mutável de propósito (sair do grupo, trocar o jogo entre chamadas).
 * O `currentGame` falha com o grupo arquivado (o jogo só existe com o grupo ativo, GRP-37).
 */
function setup(opts: { group?: Partial<StoredGroup> } = {}) {
  const clock = { now: NOW };
  const state = {
    group: storedGroup(opts.group),
    members: { [OWNER]: 'member', [A]: 'member', [R]: 'reserve' } as Record<string, MemberRole>,
    /** Cargo de cada pessoa (GRP-48): `admin` dá o `teams.manage`. */
    staff: {} as Record<string, StaffRoleId>,
    game: GAME,
  };
  const store = new Map<string, StoredTeamSettings>();
  const puts: StoredTeamSettings[] = [];

  const groups: GroupRepository = {
    get: async (id) => (id === state.group.id ? state.group : undefined),
    roleOf: async (groupId, userId) => (groupId === state.group.id ? state.members[userId] : undefined),
    getByToken: unused,
    create: unused,
    addMember: unused,
    counts: unused,
    getMembership: async (groupId, userId) => {
      const role = groupId === state.group.id ? state.members[userId] : undefined;
      if (!role) return undefined;
      const staffRoleId = state.staff[userId];
      return staffRoleId === undefined ? { role } : { role, staffRoleId };
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
    removeMember: unused,
  };

  const settings: TeamSettingsRepository = {
    get: async (groupId) => {
      const s = store.get(groupId);
      return s ? structuredClone(s) : undefined;
    },
    put: async (s) => {
      puts.push(structuredClone(s));
      store.set(s.groupId, structuredClone(s));
    },
  };

  const roster = {
    members: async (_userId: UserId, groupId: string): Promise<RosterMember[]> =>
      groupId === state.group.id
        ? Object.entries(state.members).map(([id, role]) => ({
            userId: asUserId(id),
            publicId: pub(asUserId(id)),
            name: NAMES[id],
            isOwner: id === OWNER,
            role,
          }))
        : [],
    currentGame: async (_userId: UserId, groupId: string): Promise<RosterGame> => {
      if (groupId !== state.group.id) throw new Error('unknown group');
      if (state.group.archivedAt) throw new Error('archived group has no game (GRP-37)');
      return structuredClone(state.game);
    },
  };

  const users = {
    getMany: async (ids: readonly UserId[]): Promise<UserRecord[]> =>
      ids.map((id) => ({
        id,
        publicId: pub(id),
        name: NAMES[id],
        createdAt: '2026-01-01T00:00:00.000Z',
      })),
    /** USR-17: id público → id do sistema; o desconhecido fica de fora. */
    resolve: async (publicIds: readonly PublicUserId[]) => resolveIn(publicIds),
  };

  const raw = createTeamSettingsService({ groups, settings, roster, users, now: () => clock.now });
  const service = atTheEdge(raw);
  return { clock, state, store, puts, service, raw };
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

describe('configuração de times do grupo (TIM-17)', () => {
  it('TIM-17: sem nada salvo, vale o padrão: 2 times, sem regras, sem opostos, não espalha, não permite publicar fora das regras', async () => {
    const t = setup();
    const res = await t.service.get(OWNER, GROUP_ID);
    expect(TeamSettingsSchema.parse(toWire(res))).toEqual(toWire(res));
    expect(res).toEqual(full(DEFAULTS));
    expect(t.puts).toEqual([]);
  });

  it('TIM-17: o dono salva a configuração inteira, recebe ela de volta e o GET devolve o que foi salvo', async () => {
    const t = setup();
    const input = { teamCount: 3, rules: [SETTER_ONE, WOMEN_TWO, LIBERO_MAX], allowOutsideRules: true };
    const res = await t.service.update(OWNER, GROUP_ID, input);

    expect(res).toEqual(full(input));
    expect(t.puts).toHaveLength(1);
    expect(t.puts[0]).toMatchObject({ groupId: GROUP_ID, ...input });
    expect(await t.service.get(OWNER, GROUP_ID)).toEqual(full(input));
  });

  it('TIM-17: salvar de novo substitui tudo (regras removidas somem)', async () => {
    const t = setup();
    await t.service.update(OWNER, GROUP_ID, {
      teamCount: 3,
      rules: [SETTER_ONE, WOMEN_TWO],
      apart: [{ people: [A, G] }],
      spreadGender: true,
      allowOutsideRules: true,
    });
    const next = { teamCount: 2, rules: [LIBERO_MAX], allowOutsideRules: false };
    expect(await t.service.update(OWNER, GROUP_ID, next)).toEqual(full(next));
    expect(await t.service.get(OWNER, GROUP_ID)).toEqual(full(next));
  });

  it('TIM-17: a quantidade padrão vai de 2 a 8 (o contrato recusa fora disso)', () => {
    const ok = (teamCount: number) =>
      UpdateTeamSettingsInputSchema.safeParse({ teamCount, rules: [], allowOutsideRules: false }).success;
    expect(ok(2)).toBe(true);
    expect(ok(8)).toBe(true);
    expect(ok(1)).toBe(false);
    expect(ok(9)).toBe(false);
    expect(ok(2.5)).toBe(false);
  });

  it('TIM-17: membro e reserva sem cargo (sem teams.manage) → GROUP_PERMISSION_DENIED (403) para ver e para mudar, sem gravar', async () => {
    const t = setup();
    for (const who of [A, R]) {
      await expectAppError(t.service.get(who, GROUP_ID), 'GROUP_PERMISSION_DENIED', 403);
      await expectAppError(t.service.update(who, GROUP_ID, DEFAULTS), 'GROUP_PERMISSION_DENIED', 403);
    }
    expect(t.puts).toEqual([]);
  });

  it('TIM-17: quem não participa do grupo, ou grupo inexistente → GROUP_NOT_FOUND (404)', async () => {
    const t = setup();
    await expectAppError(t.service.get(OUTSIDER, GROUP_ID), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.service.update(OUTSIDER, GROUP_ID, DEFAULTS), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.service.get(OWNER, OTHER_GROUP_ID), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.service.update(OWNER, OTHER_GROUP_ID, DEFAULTS), 'GROUP_NOT_FOUND', 404);
    expect(t.puts).toEqual([]);
  });

  it('TIM-17: grupo arquivado → mudar responde GROUP_ARCHIVED (409), sem gravar; ver continua valendo', async () => {
    const t = setup();
    await t.service.update(OWNER, GROUP_ID, {
      teamCount: 3,
      rules: [SETTER_ONE],
      apart: [{ people: [A, R] }],
      allowOutsideRules: false,
    });
    t.state.group = storedGroup({ archivedAt: '2026-11-10T00:00:00.000Z' });
    const before = t.puts.length;

    await expectAppError(t.service.update(OWNER, GROUP_ID, DEFAULTS), 'GROUP_ARCHIVED', 409);
    expect(t.puts.length).toBe(before);
    expect(await t.service.get(OWNER, GROUP_ID)).toEqual(
      full({
        teamCount: 3,
        rules: [SETTER_ONE],
        apart: [{ people: [A, R] }],
        names: { [A]: 'Ana', [R]: 'Rafa' },
        allowOutsideRules: false,
      }),
    );
  });

  it('TIM-17: com o grupo arquivado, quem não tem teams.manage continua recebendo GROUP_PERMISSION_DENIED (a permissão vem antes)', async () => {
    const t = setup({ group: { archivedAt: '2026-11-10T00:00:00.000Z' } });
    await expectAppError(t.service.update(A, GROUP_ID, DEFAULTS), 'GROUP_PERMISSION_DENIED', 403);
  });

  it('TIM-17: item antigo, gravado sem opostos e sem a preferência, vale como [] e desligada', async () => {
    const t = setup();
    t.store.set(GROUP_ID, {
      groupId: GROUP_ID,
      teamCount: 3,
      rules: [SETTER_ONE],
      allowOutsideRules: true,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    });
    expect(await t.service.get(OWNER, GROUP_ID)).toEqual(
      full({ teamCount: 3, rules: [SETTER_ONE], allowOutsideRules: true }),
    );
  });
});

describe('regra de quantidade por time (TIM-18)', () => {
  const settingsWith = (rules: unknown[]) =>
    UpdateTeamSettingsInputSchema.safeParse({ teamCount: 2, rules, allowOutsideRules: false }).success;

  it('TIM-18: aceita regra de posição ou de gênero, com mínimo, máximo ou os dois', () => {
    expect(settingsWith([SETTER_ONE])).toBe(true);
    expect(settingsWith([WOMEN_TWO])).toBe(true);
    expect(settingsWith([LIBERO_MAX])).toBe(true);
    expect(settingsWith([{ target: { kind: 'gender', gender: 'M' }, min: 0, max: 50 }])).toBe(true);
  });

  it('TIM-18: sem mínimo e sem máximo, mínimo acima do máximo ou fora de 0 a 50 → recusado (VALIDATION_ERROR)', () => {
    const target = { kind: 'position', position: 'setter' };
    expect(settingsWith([{ target }])).toBe(false);
    expect(settingsWith([{ target, min: 2, max: 1 }])).toBe(false);
    expect(settingsWith([{ target, min: -1 }])).toBe(false);
    expect(settingsWith([{ target, max: 51 }])).toBe(false);
    expect(settingsWith([{ target, min: 1.5 }])).toBe(false);
    expect(settingsWith([{ target: { kind: 'gender', gender: 'X' }, min: 1 }])).toBe(false);
    expect(settingsWith([{ target: { kind: 'position', position: 'pitcher' }, min: 1 }])).toBe(false);
  });

  it('TIM-18: até 10 regras, e cada posição ou gênero numa regra só (VALIDATION_ERROR)', () => {
    expect(TEAM_RULE_LIMITS.rules).toBe(10);
    const positions = [
      'setter',
      'opposite',
      'outside',
      'middle',
      'libero',
      'goalkeeper',
      'defender',
      'fullback',
    ];
    const ten = [
      ...positions.map((position) => ({ target: { kind: 'position', position }, max: 1 })),
      { target: { kind: 'gender', gender: 'M' }, max: 3 },
      { target: { kind: 'gender', gender: 'F' }, min: 1 },
    ];
    expect(settingsWith(ten)).toBe(true);
    expect(settingsWith([...ten, { target: { kind: 'position', position: 'forward' }, max: 1 }])).toBe(false);
    expect(settingsWith([SETTER_ONE, { target: { kind: 'position', position: 'setter' }, max: 2 }])).toBe(
      false,
    );
    expect(settingsWith([WOMEN_TWO, { target: { kind: 'gender', gender: 'F' }, max: 4 }])).toBe(false);
    expect(settingsWith([SETTER_ONE, WOMEN_TWO, { target: { kind: 'gender', gender: 'M' }, min: 1 }])).toBe(
      true,
    );
  });

  it('TIM-18: posição de outro esporte → TEAM_POSITION_INVALID (422) com details.position, sem gravar', async () => {
    const t = setup();
    const err = await expectAppError(
      t.service.update(OWNER, GROUP_ID, {
        teamCount: 2,
        rules: [SETTER_ONE, { target: { kind: 'position', position: 'goalkeeper' }, max: 1 }],
        allowOutsideRules: false,
      }),
      'TEAM_POSITION_INVALID',
      422,
    );
    expect(err.details).toEqual({ position: 'goalkeeper' });
    expect(t.puts).toEqual([]);
  });

  it('TIM-18: no esporte "outro" só há regra de gênero (posição → TEAM_POSITION_INVALID; gênero salva)', async () => {
    const t = setup({ group: { sport: 'other' } });
    const err = await expectAppError(
      t.service.update(OWNER, GROUP_ID, { teamCount: 2, rules: [SETTER_ONE], allowOutsideRules: false }),
      'TEAM_POSITION_INVALID',
      422,
    );
    expect(err.details).toEqual({ position: 'setter' });
    const ok = { teamCount: 2, rules: [WOMEN_TWO], allowOutsideRules: false };
    expect(await t.service.update(OWNER, GROUP_ID, ok)).toEqual(full(ok));
  });

  it('TIM-18: a posição precisa ser do esporte do grupo (futebol aceita goleiro e recusa levantador)', async () => {
    const t = setup({ group: { sport: 'soccer' } });
    const keeper: TeamRule = { target: { kind: 'position', position: 'goalkeeper' }, min: 1, max: 1 };
    const ok = { teamCount: 2, rules: [keeper], allowOutsideRules: false };
    expect(await t.service.update(OWNER, GROUP_ID, ok)).toEqual(full(ok));
    await expectAppError(
      t.service.update(OWNER, GROUP_ID, { teamCount: 2, rules: [SETTER_ONE], allowOutsideRules: false }),
      'TEAM_POSITION_INVALID',
      422,
    );
  });
});

describe('times opostos na configuração (TIM-22)', () => {
  const apartWith = (apart: unknown) =>
    UpdateTeamSettingsInputSchema.safeParse({ teamCount: 2, rules: [], apart, allowOutsideRules: false })
      .success;
  const uuid = (n: number) => `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, '0')}`;
  /** Id público (USR-15) para os testes do contrato. */
  const code = (n: number) => `EEEE${String(n).padStart(4, '0')}`;

  it('TIM-22: o dono salva um par e um conjunto, e recebe de volta com o nome de cada pessoa', async () => {
    const t = setup();
    const input = {
      teamCount: 3,
      rules: [],
      apart: [{ people: [A, R] }, { people: [A, G, H] }],
      allowOutsideRules: false,
    };
    const expected = full({
      ...input,
      names: { [A]: 'Ana', [R]: 'Rafa', [G]: 'Gabi', [H]: 'Heitor' },
    });
    const res = await t.service.update(OWNER, GROUP_ID, input);

    expect(TeamSettingsSchema.parse(toWire(res))).toEqual(toWire(res));
    expect(res).toEqual(expected);
    expect(t.puts[0]).toMatchObject({ groupId: GROUP_ID, apart: input.apart });
    expect(await t.service.get(OWNER, GROUP_ID)).toEqual(expected);
  });

  it('TIM-22: entra quem o dono pode classificar (TIM-04): membro, reserva, o próprio dono e convidados de dentro e da fila', async () => {
    const t = setup();
    const input = {
      teamCount: 2,
      rules: [],
      apart: [{ people: [OWNER, A, R, G, H] }],
      allowOutsideRules: false,
    };
    expect((await t.service.update(OWNER, GROUP_ID, input)).apart).toEqual(input.apart);
  });

  it('TIM-22: pessoa que o dono não pode classificar (fora do grupo e da lista, ou um avulso) → TEAM_PLAYER_NOT_FOUND (404), sem gravar', async () => {
    const t = setup();
    for (const who of [OUTSIDER, uuid(1)])
      await expectAppError(
        t.service.update(OWNER, GROUP_ID, {
          teamCount: 2,
          rules: [],
          apart: [{ people: [A, who] }],
          allowOutsideRules: false,
        }),
        'TEAM_PLAYER_NOT_FOUND',
        404,
      );
    expect(t.puts).toEqual([]);
  });

  it('TIM-22: a regra fica guardada se a pessoa sair do grupo, com o nome dela; salvar de novo com ela continua aceito', async () => {
    const t = setup();
    t.state.members = { ...t.state.members, [LEFT]: 'member' };
    const apart = [{ people: [A, LEFT] }];
    await t.service.update(OWNER, GROUP_ID, { teamCount: 2, rules: [], apart, allowOutsideRules: false });

    const { [LEFT]: _gone, ...rest } = t.state.members;
    t.state.members = rest;
    expect(await t.service.get(OWNER, GROUP_ID)).toEqual(
      full({ ...DEFAULTS, apart, names: { [A]: 'Ana', [LEFT]: 'Lia' } }),
    );

    const res = await t.service.update(OWNER, GROUP_ID, {
      teamCount: 4,
      rules: [SETTER_ONE],
      apart,
      allowOutsideRules: true,
    });
    expect(res.apart).toEqual(apart);
    expect(res.names).toEqual({ [A]: 'Ana', [LEFT]: 'Lia' });
  });

  it('TIM-22: quem saiu do grupo e não estava na regra salva não pode entrar numa regra nova → TEAM_PLAYER_NOT_FOUND', async () => {
    const t = setup();
    await t.service.update(OWNER, GROUP_ID, {
      teamCount: 2,
      rules: [],
      apart: [{ people: [A, R] }],
      allowOutsideRules: false,
    });
    await expectAppError(
      t.service.update(OWNER, GROUP_ID, {
        teamCount: 2,
        rules: [],
        apart: [{ people: [A, R] }, { people: [A, LEFT] }],
        allowOutsideRules: false,
      }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );
  });

  it('TIM-22: a mesma pessoa pode estar em mais de uma regra (Ana × Rafa e Ana × Gabi)', () => {
    expect(apartWith([{ people: [pub(A), pub(R)] }, { people: [pub(A), pub(G)] }])).toBe(true);
  });

  it('TIM-22: de 2 a 8 pessoas por regra, sem repetir, e até 10 regras (o contrato recusa fora disso: VALIDATION_ERROR)', () => {
    expect(TEAM_APART_LIMITS).toEqual({ people: { min: 2, max: 8 }, rules: 10 });
    const people = (n: number) => Array.from({ length: n }, (_, i) => code(i));
    expect(apartWith([{ people: people(2) }])).toBe(true);
    expect(apartWith([{ people: people(8) }])).toBe(true);
    expect(apartWith([{ people: people(1) }])).toBe(false);
    expect(apartWith([{ people: people(9) }])).toBe(false);
    expect(apartWith([{ people: [pub(A), pub(A)] }])).toBe(false);
    expect(apartWith([{ people: [pub(A), pub(R), pub(A)] }])).toBe(false);
    expect(apartWith([{ people: [pub(A), 'not-a-code'] }])).toBe(false);
    const rule = { people: [pub(A), pub(R)] };
    expect(apartWith(Array.from({ length: 10 }, () => rule))).toBe(true);
    expect(apartWith(Array.from({ length: 11 }, () => rule))).toBe(false);
  });

  it('TIM-22: sem opostos no input, salva como nenhum (substitui os que havia)', async () => {
    const t = setup();
    await t.service.update(OWNER, GROUP_ID, {
      teamCount: 2,
      rules: [],
      apart: [{ people: [A, R] }],
      allowOutsideRules: false,
    });
    expect(await t.service.update(OWNER, GROUP_ID, DEFAULTS)).toEqual(full(DEFAULTS));
  });
});

describe('preferência "Espalhar homens e mulheres" na configuração (TIM-23)', () => {
  it('TIM-23: desligada por padrão; o dono liga, recebe de volta e o GET devolve ligada', async () => {
    const t = setup();
    expect((await t.service.get(OWNER, GROUP_ID)).spreadGender).toBe(false);
    const input = { ...DEFAULTS, spreadGender: true };
    expect(await t.service.update(OWNER, GROUP_ID, input)).toEqual(full(input));
    expect(t.puts[0]).toMatchObject({ spreadGender: true });
    expect((await t.service.get(OWNER, GROUP_ID)).spreadGender).toBe(true);
  });

  it('TIM-23: o contrato aceita só booleano e, sem o campo, vale desligada', () => {
    const parse = (extra: object) => UpdateTeamSettingsInputSchema.safeParse({ ...DEFAULTS, ...extra });
    expect(parse({}).data?.spreadGender).toBe(false);
    expect(parse({ spreadGender: true }).data?.spreadGender).toBe(true);
    expect(parse({ spreadGender: 'yes' }).success).toBe(false);
  });
});

describe('times opostos pelo id público (USR-16, USR-17)', () => {
  it('USR-16: o contrato dos opostos recusa o id do sistema (uuid): só aceita o id público', () => {
    const parse = (people: string[]) =>
      UpdateTeamSettingsInputSchema.safeParse({ ...DEFAULTS, apart: [{ people }] }).success;
    expect(parse([pub(A), pub(R)])).toBe(true);
    expect(parse([A, R])).toBe(false);
  });

  it('USR-17: os opostos entram pelo id público e são guardados pelo id do sistema', async () => {
    const t = setup();
    await t.raw.update(OWNER, GROUP_ID, { ...DEFAULTS, apart: [{ people: [pub(A), pub(G)] }] });
    expect(t.puts[0]?.apart).toEqual([{ people: [A, G] }]);
  });

  it('USR-16: a configuração sai com os opostos e os nomes pelo id público, inclusive de quem saiu do grupo', async () => {
    const t = setup();
    t.state.members = { ...t.state.members, [LEFT]: 'member' };
    await t.raw.update(OWNER, GROUP_ID, { ...DEFAULTS, apart: [{ people: [pub(A), pub(LEFT)] }] });
    const { [LEFT]: _gone, ...rest } = t.state.members;
    t.state.members = rest;
    const res = await t.raw.get(OWNER, GROUP_ID);
    expect(res.apart).toEqual([{ people: [pub(A), pub(LEFT)] }]);
    expect(res.names).toEqual({ [pub(A)]: 'Ana', [pub(LEFT)]: 'Lia' });
    expect(leaksSystemId(res)).toBe(false);
  });

  it('USR-17: id público que não existe nos opostos → TEAM_PLAYER_NOT_FOUND, sem gravar', async () => {
    const t = setup();
    await expectAppError(
      t.raw.update(OWNER, GROUP_ID, { ...DEFAULTS, apart: [{ people: [pub(A), UNKNOWN] }] }),
      'TEAM_PLAYER_NOT_FOUND',
      404,
    );
    expect(t.puts).toEqual([]);
  });
});

describe('configuração de times com cargo (TIM-17)', () => {
  it('TIM-17: membro e reserva com o cargo Admin (teams.manage) veem e mudam a configuração', async () => {
    const t = setup();
    for (const who of [A, R]) {
      t.state.staff[who] = 'admin';
      const input = { teamCount: 3, rules: [SETTER_ONE], allowOutsideRules: false };
      expect(await t.service.update(who, GROUP_ID, input)).toEqual(full(input));
      expect(await t.service.get(who, GROUP_ID)).toEqual(full(input));
    }
    expect(t.puts).toHaveLength(2);
  });

  it('TIM-17: sem cargo, a resposta traz a permissão que faltou (teams.manage)', async () => {
    const t = setup();
    const err = await expectAppError(t.service.get(A, GROUP_ID), 'GROUP_PERMISSION_DENIED', 403);
    expect(err.details).toEqual({ permission: 'teams.manage' });
  });

  it('TIM-17: o Admin com o grupo arquivado → mudar responde GROUP_ARCHIVED (GRP-52: a permissão vem antes)', async () => {
    const t = setup({ group: { archivedAt: '2026-11-10T00:00:00.000Z' } });
    t.state.staff[A] = 'admin';
    await expectAppError(t.service.update(A, GROUP_ID, DEFAULTS), 'GROUP_ARCHIVED', 409);
    expect(t.puts).toEqual([]);
  });
});
