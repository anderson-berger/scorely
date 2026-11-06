import { randomUUID } from 'node:crypto';
import {
  type CreateGroupInput,
  CreateGroupInputSchema,
  type ErrorCode,
  GameSchema,
  type Group,
  GroupLayersSchema,
  GroupSchema,
  GuestGameSchema,
  type InviteKind,
  InviteSchema,
  type MemberRole,
  MyGroupSchema,
  type Notification,
  UpdateGroupInputSchema,
  type User,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/errors';
import type { NewNotification } from '../notifications/notification.service';
import type { AttendanceRecord, GameRecord, GameRepository } from './game.repository';
import { createGameService } from './game.service';
import type { GroupRepository, RemoveMemberResult, StoredGroup } from './group.repository';
import { createGroupService } from './group.service';

// Plano 003, bloco 2: casos 1, 2, 3 (api), 4 (service), 5, 6, 7, 8, 10–13 e a corrida na criação do jogo (tarefa 6a).
// Plano 006: casos 11–13 (remoção de membro com `not_member`/`stale`).
// Plano 007 (E2): casos 1–15 (reservas, link do jogo e camadas), no fim do arquivo.

type ReadOpts = { consistent?: boolean };
type Stored = StoredGroup;
type RemoveArgs = Parameters<GroupRepository['removeMember']>[0];
type GroupPatch = Parameters<GroupRepository['update']>[1];

const MINUTE = 60 * 1000;
const iso = (value: string | Date) => new Date(value).toISOString();

/** Quinta 2026-11-05 10:00 em São Paulo. */
const THURSDAY_10H = new Date('2026-11-05T13:00:00.000Z');
/** Quinta 2026-11-05 19:00 em São Paulo (24 h antes do jogo: abertura das reservas por padrão). */
const THURSDAY_19H = new Date('2026-11-05T22:00:00.000Z');
/** Sexta 2026-11-06 13:00 em São Paulo (6 h antes do jogo). */
const FRIDAY_13H = new Date('2026-11-06T16:00:00.000Z');
/** Sexta 2026-11-06 20:00 em São Paulo (jogo de 19h em andamento). */
const FRIDAY_20H = new Date('2026-11-06T23:00:00.000Z');
/** Sexta 2026-11-06 22:01 em São Paulo (passou a janela de 3 h). */
const FRIDAY_22H01 = new Date('2026-11-07T01:01:00.000Z');
/** Quarta 2026-11-04 19:00 em São Paulo (48 h antes: abertura dos membros). */
const WEDNESDAY_19H = new Date('2026-11-04T22:00:00.000Z');
const DATE = '2026-11-06';
const NEXT_DATE = '2026-11-13';

const OWNER = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333';
const C = '44444444-4444-4444-8444-444444444444';
const D = '55555555-5555-4555-8555-555555555555';
const OUTSIDER = '66666666-6666-4666-8666-666666666666';
const LISBON_OWNER = '77777777-7777-4777-8777-777777777777';
/** Reserva (entra pelo link de reserva). */
const R = '88888888-8888-4888-8888-888888888888';
/** Convidado (só pelo link do jogo). */
const G = '99999999-9999-4999-8999-999999999999';

const user = (id: string, extra: Partial<User> = {}): User => ({
  id,
  email: `${id.slice(0, 4)}@example.com`,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const USERS: User[] = [
  user(OWNER, { name: 'Dono' }),
  user(A, { name: 'Ana' }),
  user(B, { name: 'Beatriz', nickname: 'Bia' }),
  user(C, { name: 'Caio' }),
  user(D, { name: 'Duda' }),
  user(OUTSIDER, { name: 'Fora' }),
  user(LISBON_OWNER, { name: 'Lis', timeZone: 'Europe/Lisbon' }),
  user(R, { name: 'Rafa' }),
  user(G, { name: 'Gabi' }),
];

const BASE_INPUT: CreateGroupInput = {
  name: 'Vôlei de sexta',
  sport: 'volleyball',
  weekday: 5,
  time: '19:00',
  slots: 12,
  listOpensHoursBefore: 48,
};
const INPUT: CreateGroupInput = { ...BASE_INPUT, timeZone: 'America/Sao_Paulo' };

const KINDS: InviteKind[] = ['member', 'reserve', 'guest'];
/** Campo do grupo com o token de cada tipo de link (plano 007, D5). */
const TOKEN_FIELD = { member: 'inviteToken', reserve: 'reserveInviteToken', guest: 'guestToken' } as const;

/**
 * Repositórios em memória com o estado compartilhado (o `removeMember` do grupo apaga a presença do jogo, D12).
 * Papéis por grupo na ordem de entrada; o papel de um token sai de qual campo do grupo ele ocupa (D5).
 * O `get` devolve o grupo como foi gravado (grupo antigo continua sem os campos da E2, D3).
 * `race.stale`: a próxima leitura não consistente do jogo por data não enxerga nada (simula a corrida do D2).
 */
function memoryStore() {
  const groups = new Map<string, Stored>();
  const members = new Map<string, { userId: string; role: MemberRole }[]>();
  const games = new Map<string, GameRecord>();
  const gameByDate = new Map<string, string>();
  const attendance = new Map<string, AttendanceRecord>();
  const race = { stale: false };
  const findByDateReads: (ReadOpts | undefined)[] = [];
  /** Chamadas ao `removeMember` do repositório (cópia do grupo recebido). */
  const removeCalls: RemoveArgs[] = [];
  /** Respostas forçadas do `removeMember`, consumidas na ordem (plano 006); vazia → comportamento normal. */
  const removeScript: ((args: RemoveArgs) => RemoveMemberResult)[] = [];

  const attKey = (gameId: string, userId: string) => `${gameId}#${userId}`;
  const membersOf = (groupId: string) => members.get(groupId) ?? [];
  const roleIn = (groupId: string, userId: string) =>
    membersOf(groupId).find((m) => m.userId === userId)?.role;
  const setRole = (groupId: string, userId: string, role: MemberRole | undefined) => {
    const others = membersOf(groupId).filter((m) => m.userId !== userId);
    members.set(groupId, role ? [...others, { userId, role }] : others);
  };
  const swapToken = (groupId: string, kind: InviteKind, newToken: string) => {
    const stored = groups.get(groupId);
    if (stored) groups.set(groupId, { ...stored, [TOKEN_FIELD[kind]]: newToken });
  };
  const findByToken = (token: string) => {
    const found = [...groups.values()].flatMap((g) => {
      const kind = KINDS.find((k) => (g as Record<string, unknown>)[TOKEN_FIELD[k]] === token);
      return kind ? [{ group: { ...g }, kind }] : [];
    });
    return found[0];
  };
  const dropAttendance = (a: AttendanceRecord) => attendance.delete(attKey(a.gameId, a.userId));

  /** Nomes da E1; o plano 007 troca por `getByToken`/`rotateToken`. Vão por spread caso a interface ainda os tenha. */
  const legacy = {
    async getByInvite(token: string) {
      const found = findByToken(token);
      return found?.kind === 'member' ? found.group : undefined;
    },
    async rotateInvite(group: Stored, newToken: string) {
      swapToken(group.id, 'member', newToken);
    },
  };

  const groupRepo: GroupRepository = {
    ...legacy,
    async get(id: string, _opts?: ReadOpts) {
      const g = groups.get(id);
      return g && { ...g };
    },
    getByToken: async (token: string) => findByToken(token),
    async create(group: Stored) {
      groups.set(group.id, { ...group });
      members.set(group.id, [{ userId: group.ownerId, role: 'member' }]);
    },
    roleOf: async (groupId: string, userId: string) => roleIn(groupId, userId),
    async addMember(groupId: string, userId: string, role: MemberRole) {
      const current = roleIn(groupId, userId);
      // D5: membro aceitando o link de reserva continua membro; reserva aceitando o de membro vira membro.
      if (current === 'member' || current === role) return;
      setRole(groupId, userId, role);
    },
    listMembers: async (groupId: string) => membersOf(groupId).map((m) => ({ ...m })),
    listGroupsOf: async (userId: string) =>
      [...members.entries()]
        .filter(([, list]) => list.some((m) => m.userId === userId))
        .map(([groupId]) => groupId),
    async rotateToken(group: Stored, kind: InviteKind, newToken: string) {
      swapToken(group.id, kind, newToken);
    },
    async update(groupId: string, patch: GroupPatch) {
      const stored = groups.get(groupId);
      if (!stored) throw new Error('group not found in memory store');
      const merged = Object.fromEntries(
        Object.entries({ ...stored, ...patch }).filter(([, v]) => v !== null && v !== undefined),
      ) as Stored;
      groups.set(groupId, merged);
      return { ...merged };
    },
    async removeMember(args: RemoveArgs): Promise<RemoveMemberResult> {
      removeCalls.push({ ...args, group: { ...args.group } });
      const scripted = removeScript.shift();
      if (scripted) return scripted(args);
      if (roleIn(args.group.id, args.userId) !== args.role) return 'not_member';
      setRole(args.group.id, args.userId, undefined);
      swapToken(args.group.id, args.role, args.newToken);
      if (args.attendance) dropAttendance(args.attendance);
      return 'removed';
    },
  };

  const gameRepo: GameRepository = {
    async findByDate(groupId: string, date: string, opts?: ReadOpts) {
      findByDateReads.push(opts);
      if (race.stale && !opts?.consistent) {
        race.stale = false;
        return undefined;
      }
      const id = gameByDate.get(`${groupId}#${date}`);
      const g = id === undefined ? undefined : games.get(id);
      return g && { ...g };
    },
    async create(game: GameRecord) {
      const key = `${game.groupId}#${game.date}`;
      if (gameByDate.has(key)) return false;
      gameByDate.set(key, game.id);
      games.set(game.id, { ...game });
      return true;
    },
    async cancel(gameId: string, cancelledAt: string) {
      const g = games.get(gameId);
      if (g) games.set(gameId, { ...g, cancelledAt });
    },
    listAttendance: async (gameId: string, _opts?: ReadOpts) =>
      [...attendance.values()]
        .filter((a) => a.gameId === gameId)
        .sort((x, y) => x.confirmedAt.localeCompare(y.confirmedAt) || x.userId.localeCompare(y.userId))
        .map((a) => ({ ...a })),
    async getAttendance(gameId: string, userId: string) {
      const a = attendance.get(attKey(gameId, userId));
      return a && { ...a };
    },
    async addAttendance(a: AttendanceRecord) {
      const key = attKey(a.gameId, a.userId);
      if (attendance.has(key)) return false;
      attendance.set(key, { ...a });
      return true;
    },
    async removeAttendance(a: AttendanceRecord) {
      dropAttendance(a);
    },
  };

  /** Grava um grupo como era antes da E2 (sem reservas, convidados nem os 2 links novos, D3), com o dono membro. */
  const seedLegacy = (raw: Record<string, unknown> & { id: string; ownerId: string }) => {
    groups.set(raw.id, raw as unknown as Stored);
    members.set(raw.id, [{ userId: raw.ownerId, role: 'member' }]);
  };

  return {
    groups: groupRepo,
    games: gameRepo,
    race,
    findByDateReads,
    removeCalls,
    removeScript,
    swapToken,
    seedLegacy,
    gameCount: () => games.size,
  };
}

type Sent = { userId: string } & NewNotification;

function setupServices(now: Date = THURSDAY_10H) {
  const clock = { now };
  const store = memoryStore();
  const sent: Sent[] = [];
  const byId = new Map(USERS.map((u) => [u.id, u]));
  const deps = {
    groups: store.groups,
    games: store.games,
    users: {
      get: async (id: string) => byId.get(id),
      getMany: async (ids: string[]) => ids.flatMap((id) => byId.get(id) ?? []),
    },
    notifications: {
      async notify(userId: string, input: NewNotification): Promise<Notification> {
        sent.push({ userId, ...input });
        return { id: randomUUID(), createdAt: clock.now.toISOString(), userId, ...input };
      },
    },
    now: () => clock.now,
  };
  const tick = () => {
    clock.now = new Date(clock.now.getTime() + MINUTE);
  };
  return { clock, store, sent, tick, groups: createGroupService(deps), games: createGameService(deps) };
}

function tokenOf(group: Group): string {
  expect(group.inviteToken).toBeTypeOf('string');
  return group.inviteToken ?? '';
}

function reserveTokenOf(group: Group): string {
  expect(group.reserveInviteToken).toBeTypeOf('string');
  return group.reserveInviteToken ?? '';
}

function guestTokenOf(group: Group): string {
  expect(group.guestToken).toBeTypeOf('string');
  return group.guestToken ?? '';
}

type SetupOpts = {
  slots?: number;
  listOpensHoursBefore?: number;
  reservesOpenHoursBefore?: number;
  guestsOpenHoursBefore?: number;
  /** Entram pelo link de membro. */
  members?: string[];
  /** Entram pelo link de reserva (depois dos membros). */
  reserves?: string[];
  now?: Date;
};

/** Grupo do OWNER (sexta 19h, São Paulo) com os `members` e as `reserves` entrando pelos links. */
async function setup(opts: SetupOpts = {}) {
  const s = setupServices(opts.now);
  const group = await s.groups.create(OWNER, {
    ...INPUT,
    slots: opts.slots ?? INPUT.slots,
    listOpensHoursBefore: opts.listOpensHoursBefore ?? INPUT.listOpensHoursBefore,
    ...(opts.reservesOpenHoursBefore === undefined
      ? {}
      : { reservesOpenHoursBefore: opts.reservesOpenHoursBefore }),
    ...(opts.guestsOpenHoursBefore === undefined
      ? {}
      : { guestsOpenHoursBefore: opts.guestsOpenHoursBefore }),
  });
  for (const id of opts.members ?? []) await s.groups.acceptInvite(id, tokenOf(group));
  for (const id of opts.reserves ?? []) await s.groups.acceptInvite(id, reserveTokenOf(group));
  /** Confirma um por vez, avançando o relógio 1 min entre eles (`confirmedAt` define a ordem). */
  const confirmInOrder = async (...ids: string[]) => {
    for (const id of ids) {
      await s.games.confirm(id, group.id, DATE);
      s.tick();
    }
  };
  /** Como `confirmInOrder`, pelo link do jogo (`guestConfirm`). */
  const guestConfirmInOrder = async (...ids: string[]) => {
    for (const id of ids) {
      await s.games.guestConfirm(id, group.guestToken ?? '', DATE);
      s.tick();
    }
  };
  return { ...s, group, confirmInOrder, guestConfirmInOrder };
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
const ofType = (sent: Sent[], type: Notification['type']) =>
  sent.filter((n) => n.type === type).map((n) => n.userId);

describe('grupos: criar (caso 1)', () => {
  it('caso 1: cria grupo válido → dono, com inviteToken e createdAt do relógio', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, INPUT);
    expect(GroupSchema.parse(group)).toEqual(group);
    expect(group).toMatchObject({ ...INPUT, ownerId: OWNER });
    expect(tokenOf(group).length).toBeGreaterThan(0);
    expect(group.createdAt).toBe(THURSDAY_10H.toISOString());
  });

  it('caso 1: o dono é membro e o grupo aparece em "meus grupos"', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, INPUT);
    const members = await s.groups.members(OWNER, group.id);
    expect(members).toEqual([{ userId: OWNER, name: 'Dono', isOwner: true, role: 'member' }]);
    const mine = await s.groups.myGroups(OWNER);
    expect(mine.map((g) => g.id)).toEqual([group.id]);
    expect(MyGroupSchema.parse(mine[0])).toBeTruthy();
  });

  it('caso 1: a lista do jogo atual está vazia (o dono não entra sozinho)', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, INPUT);
    const game = await s.games.current(OWNER, group.id);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game.confirmed).toEqual([]);
    expect(game.waitlist).toEqual([]);
    expect(game.me).toBeUndefined();
    const [mine] = await s.groups.myGroups(OWNER);
    expect(mine?.game.confirmedCount).toBe(0);
  });

  it('caso 1: sem timeZone → o fuso do perfil do dono', async () => {
    const s = setupServices();
    const group = await s.groups.create(LISBON_OWNER, BASE_INPUT);
    expect(group.timeZone).toBe('Europe/Lisbon');
  });

  it('caso 1: sem timeZone e dono sem fuso no perfil → America/Sao_Paulo', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, BASE_INPUT);
    expect(group.timeZone).toBe('America/Sao_Paulo');
  });

  it('caso 1: timeZone informado vence o do perfil', async () => {
    const s = setupServices();
    const group = await s.groups.create(LISBON_OWNER, { ...BASE_INPUT, timeZone: 'America/Sao_Paulo' });
    expect(group.timeZone).toBe('America/Sao_Paulo');
  });

  it('caso 1 (contrato): vagas 1 → inválido (422 no handler)', () => {
    const result = CreateGroupInputSchema.safeParse({ ...INPUT, slots: 1 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['slots']);
  });

  it('caso 1 (contrato): antecedência 200 → inválido (422 no handler)', () => {
    const result = CreateGroupInputSchema.safeParse({ ...INPUT, listOpensHoursBefore: 200 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['listOpensHoursBefore']);
  });
});

describe('grupos: convite (casos 2 e 3)', () => {
  it('caso 2: dono gera link → token novo, e o get do dono mostra o novo', async () => {
    const t = await setup();
    const old = tokenOf(t.group);
    const invite = await t.groups.rotateInvite(OWNER, t.group.id, 'member');
    expect(invite.token).not.toBe(old);
    expect((await t.groups.get(OWNER, t.group.id)).inviteToken).toBe(invite.token);
  });

  it('caso 2: gera outro → o antigo dá GROUP_INVITE_INVALID e o novo funciona', async () => {
    const t = await setup();
    const old = tokenOf(t.group);
    const invite = await t.groups.rotateInvite(OWNER, t.group.id, 'member');
    await expectAppError(t.groups.acceptInvite(A, old), 'GROUP_INVITE_INVALID', 404);
    expect(await t.groups.members(OWNER, t.group.id)).toHaveLength(1);
    const joined = await t.groups.acceptInvite(A, invite.token);
    expect(joined.id).toBe(t.group.id);
  });

  it('caso 2: membro tenta gerar → GROUP_NOT_OWNER; não-membro → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(t.groups.rotateInvite(A, t.group.id, 'member'), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.rotateInvite(OUTSIDER, t.group.id, 'member'), 'GROUP_NOT_FOUND', 404);
    expect((await t.groups.get(OWNER, t.group.id)).inviteToken).toBe(tokenOf(t.group));
  });

  it('caso 3: outro usuário aceita o token → vira membro (sem inviteToken no get dele)', async () => {
    const t = await setup();
    const joined = await t.groups.acceptInvite(A, tokenOf(t.group));
    expect(joined.id).toBe(t.group.id);
    expect(joined.inviteToken).toBeUndefined();
    const seen = await t.groups.get(A, t.group.id);
    expect(seen.id).toBe(t.group.id);
    expect(seen.inviteToken).toBeUndefined();
    expect((await t.groups.myGroups(A)).map((g) => g.id)).toEqual([t.group.id]);
  });

  it('caso 3: aceitar 2ª vez não duplica o membro', async () => {
    const t = await setup();
    await t.groups.acceptInvite(A, tokenOf(t.group));
    const again = await t.groups.acceptInvite(A, tokenOf(t.group));
    expect(again.id).toBe(t.group.id);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A]);
    expect(await t.groups.myGroups(A)).toHaveLength(1);
  });

  it('caso 3: o dono aceitando o próprio link continua dono e não duplica', async () => {
    const t = await setup();
    await t.groups.acceptInvite(OWNER, tokenOf(t.group));
    expect(await t.groups.members(OWNER, t.group.id)).toEqual([
      { userId: OWNER, name: 'Dono', isOwner: true, role: 'member' },
    ]);
  });

  it('caso 3: token desconhecido → GROUP_INVITE_INVALID', async () => {
    const t = await setup();
    await expectAppError(t.groups.acceptInvite(A, 'nope'), 'GROUP_INVITE_INVALID', 404);
  });

  it('caso 3: não-membro no get → GROUP_NOT_FOUND', async () => {
    const t = await setup();
    await expectAppError(t.groups.get(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.groups.members(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
  });
});

describe('jogo atual: status no tempo (caso 4, service)', () => {
  it('caso 4: quinta 10h, antecedência 48h → open, jogo de sexta (virtual) com instantes em UTC', async () => {
    const t = await setup({ members: [A] });
    const game = await t.games.current(A, t.group.id);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game).toMatchObject({ groupId: t.group.id, date: DATE, status: 'open', slots: 12 });
    expect(iso(game.startsAt)).toBe('2026-11-06T22:00:00.000Z');
    expect(iso(game.opensAt)).toBe('2026-11-04T22:00:00.000Z');
    expect(t.store.gameCount()).toBe(0);
  });

  it('caso 4: antecedência 24h → scheduled e confirmar dá GAME_LIST_NOT_OPEN com { opensAt }', async () => {
    const t = await setup({ listOpensHoursBefore: 24, members: [A] });
    const game = await t.games.current(A, t.group.id);
    expect(game.status).toBe('scheduled');
    expect(iso(game.opensAt)).toBe('2026-11-05T22:00:00.000Z');
    const err = await expectAppError(t.games.confirm(A, t.group.id, DATE), 'GAME_LIST_NOT_OPEN', 409);
    expect(iso((err.details as { opensAt: string }).opensAt)).toBe('2026-11-05T22:00:00.000Z');
    expect((await t.games.current(A, t.group.id)).confirmed).toEqual([]);
  });

  it('caso 4: antecedência 24h → desistir também dá GAME_LIST_NOT_OPEN', async () => {
    const t = await setup({ listOpensHoursBefore: 24, members: [A] });
    await expectAppError(t.games.leave(A, t.group.id, DATE), 'GAME_LIST_NOT_OPEN', 409);
  });

  it('caso 4: sexta 20h → in_progress, lista visível', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    t.clock.now = FRIDAY_20H;
    const game = await t.games.current(A, t.group.id);
    expect(game.status).toBe('in_progress');
    expect(game.date).toBe(DATE);
    expect(ids(game.confirmed)).toEqual([A, B]);
  });

  it('caso 4: sexta 20h → confirmar, desistir e cancelar dão GAME_CLOSED', async () => {
    const t = await setup({ members: [A, B, C] });
    await t.confirmInOrder(A, B);
    t.clock.now = FRIDAY_20H;
    await expectAppError(t.games.confirm(C, t.group.id, DATE), 'GAME_CLOSED', 409);
    await expectAppError(t.games.leave(A, t.group.id, DATE), 'GAME_CLOSED', 409);
    await expectAppError(t.games.cancel(OWNER, t.group.id, DATE), 'GAME_CLOSED', 409);
    const game = await t.games.current(A, t.group.id);
    expect(game.status).toBe('in_progress');
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(t.sent).toEqual([]);
  });

  it('caso 4: sexta 22h01 → o atual é o da sexta seguinte, com a lista vazia', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    t.clock.now = FRIDAY_22H01;
    const game = await t.games.current(A, t.group.id);
    expect(game.date).toBe(NEXT_DATE);
    expect(game.status).toBe('scheduled');
    expect(iso(game.startsAt)).toBe('2026-11-13T22:00:00.000Z');
    expect(game.confirmed).toEqual([]);
    expect(game.me).toBeUndefined();
  });

  it('caso 4: data diferente do jogo atual (ou inválida) → GAME_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(t.games.confirm(A, t.group.id, NEXT_DATE), 'GAME_NOT_FOUND', 404);
    await expectAppError(t.games.confirm(A, t.group.id, 'not-a-date'), 'GAME_NOT_FOUND', 404);
    await expectAppError(t.games.leave(A, t.group.id, '2026-10-30'), 'GAME_NOT_FOUND', 404);
    await expectAppError(t.games.cancel(OWNER, t.group.id, NEXT_DATE), 'GAME_NOT_FOUND', 404);
  });
});

describe('jogo atual: corrida na criação do jogo (tarefa 6a, D2)', () => {
  it('6a: confirmar no jogo virtual e perder a corrida → relê consistente e usa o jogo vencedor', async () => {
    const t = await setup({ members: [A] });
    const winner: GameRecord = {
      id: randomUUID(),
      createdAt: THURSDAY_10H.toISOString(),
      groupId: t.group.id,
      date: DATE,
    };
    expect(await t.store.games.create(winner)).toBe(true);
    t.store.race.stale = true;

    const game = await t.games.confirm(A, t.group.id, DATE);

    expect(t.store.gameCount()).toBe(1);
    expect(t.store.findByDateReads).toContainEqual({ consistent: true });
    expect(ids(await t.store.games.listAttendance(winner.id))).toEqual([A]);
    expect(ids(game.confirmed)).toEqual([A]);
  });

  it('6a: cancelar no jogo virtual e perder a corrida → cancela o jogo vencedor', async () => {
    const t = await setup();
    const winner: GameRecord = {
      id: randomUUID(),
      createdAt: THURSDAY_10H.toISOString(),
      groupId: t.group.id,
      date: DATE,
    };
    expect(await t.store.games.create(winner)).toBe(true);
    t.store.race.stale = true;

    const game = await t.games.cancel(OWNER, t.group.id, DATE);

    expect(game.status).toBe('cancelled');
    expect(t.store.gameCount()).toBe(1);
    expect(t.store.findByDateReads).toContainEqual({ consistent: true });
    expect(
      (await t.store.games.findByDate(t.group.id, DATE, { consistent: true }))?.cancelledAt,
    ).toBeDefined();
  });

  it('6a: a primeira escrita materializa o jogo uma vez só', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    expect(t.store.gameCount()).toBe(1);
  });
});

describe('presença (caso 5)', () => {
  it('caso 5: membro confirma → entra na ordem, com confirmedAt do relógio', async () => {
    const t = await setup({ members: [A] });
    const game = await t.games.confirm(A, t.group.id, DATE);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(ids(game.confirmed)).toEqual([A]);
    expect(iso(game.confirmed[0]?.confirmedAt ?? '')).toBe(THURSDAY_10H.toISOString());
    expect(game.me).toEqual({ list: 'confirmed', position: 1 });
  });

  it('caso 5: confirma de novo → mesma posição e mesmo confirmedAt', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    const again = await t.games.confirm(A, t.group.id, DATE);
    expect(ids(again.confirmed)).toEqual([A, B]);
    expect(iso(again.confirmed[0]?.confirmedAt ?? '')).toBe(THURSDAY_10H.toISOString());
    expect(again.me).toEqual({ list: 'confirmed', position: 1 });
  });

  it('caso 5: desiste → sai da lista; desistir sem presença é ok', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    await t.games.leave(A, t.group.id, DATE);
    const game = await t.games.current(A, t.group.id);
    expect(ids(game.confirmed)).toEqual([B]);
    expect(game.me).toBeUndefined();
    await expect(t.games.leave(A, t.group.id, DATE)).resolves.toBeUndefined();
    await expect(t.games.leave(OWNER, t.group.id, DATE)).resolves.toBeUndefined();
  });

  it('caso 5: reconfirmar depois de desistir vai para o fim (D5)', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    await t.games.leave(A, t.group.id, DATE);
    t.tick();
    const game = await t.games.confirm(A, t.group.id, DATE);
    expect(ids(game.confirmed)).toEqual([B, A]);
    expect(game.me).toEqual({ list: 'confirmed', position: 2 });
  });

  it('caso 5: não-membro → GROUP_NOT_FOUND em confirmar, desistir e ver o jogo', async () => {
    const t = await setup();
    await expectAppError(t.games.confirm(OUTSIDER, t.group.id, DATE), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.games.leave(OUTSIDER, t.group.id, DATE), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.games.current(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.games.current(A, randomUUID()), 'GROUP_NOT_FOUND', 404);
    expect(t.store.gameCount()).toBe(0);
  });

  it('caso 5: não-membro com data errada → GROUP_NOT_FOUND vem antes de GAME_NOT_FOUND', async () => {
    const t = await setup();
    await expectAppError(t.games.confirm(OUTSIDER, t.group.id, NEXT_DATE), 'GROUP_NOT_FOUND', 404);
  });

  it('caso 5: o dono só entra na lista se confirmar', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A, OWNER);
    const game = await t.games.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, OWNER]);
    expect(game.me).toEqual({ list: 'confirmed', position: 2 });
  });
});

describe('fila (caso 6)', () => {
  it('caso 6: vagas 2, três confirmam → 3º na fila', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    const game = await t.games.current(C, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ids(game.waitlist)).toEqual([C]);
    expect(game.me).toEqual({ list: 'waitlist', position: 1 });
    expect(t.sent).toEqual([]);
  });

  it('caso 6: 1º desiste → 3º fica dentro e recebe waitlist_promoted', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.games.leave(A, t.group.id, DATE);
    const game = await t.games.current(C, t.group.id);
    expect(ids(game.confirmed)).toEqual([B, C]);
    expect(game.waitlist).toEqual([]);
    expect(game.me).toEqual({ list: 'confirmed', position: 2 });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ userId: C, type: 'waitlist_promoted', link: `/groups/${t.group.id}` });
  });

  it('caso 6: quem estava na fila desiste → ninguém é notificado', async () => {
    const t = await setup({ slots: 2, members: [A, B, C, D] });
    await t.confirmInOrder(A, B, C, D);
    await t.games.leave(C, t.group.id, DATE);
    const game = await t.games.current(D, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ids(game.waitlist)).toEqual([D]);
    expect(game.me).toEqual({ list: 'waitlist', position: 1 });
    expect(t.sent).toEqual([]);
  });

  it('caso 6: desistência de quem está dentro sem ninguém na fila → ninguém é notificado', async () => {
    const t = await setup({ slots: 2, members: [A, B] });
    await t.confirmInOrder(A, B);
    await t.games.leave(A, t.group.id, DATE);
    expect(t.sent).toEqual([]);
  });
});

describe('cancelamento (caso 7)', () => {
  it('caso 7: dono cancela → cancelled; confirmados e fila recebem game_cancelled, o dono não', async () => {
    const t = await setup({ slots: 2, members: [A, B] });
    await t.confirmInOrder(OWNER, A, B);
    const game = await t.games.cancel(OWNER, t.group.id, DATE);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game.status).toBe('cancelled');
    expect(ofType(t.sent, 'game_cancelled').sort()).toEqual([A, B].sort());
    expect(t.sent.every((n) => n.link === `/groups/${t.group.id}`)).toBe(true);
    expect((await t.games.current(A, t.group.id)).status).toBe('cancelled');
  });

  it('caso 7: confirmar ou desistir depois → GAME_CANCELLED', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A);
    await t.games.cancel(OWNER, t.group.id, DATE);
    await expectAppError(t.games.confirm(B, t.group.id, DATE), 'GAME_CANCELLED', 409);
    await expectAppError(t.games.leave(A, t.group.id, DATE), 'GAME_CANCELLED', 409);
  });

  it('caso 7: cancelado continua cancelled durante a janela do jogo (GAME_CANCELLED antes de GAME_CLOSED)', async () => {
    const t = await setup({ members: [A] });
    await t.games.cancel(OWNER, t.group.id, DATE);
    t.clock.now = FRIDAY_20H;
    expect((await t.games.current(A, t.group.id)).status).toBe('cancelled');
    await expectAppError(t.games.confirm(A, t.group.id, DATE), 'GAME_CANCELLED', 409);
  });

  it('caso 7: cancelar de novo devolve igual e não notifica outra vez', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    const first = await t.games.cancel(OWNER, t.group.id, DATE);
    t.tick();
    const second = await t.games.cancel(OWNER, t.group.id, DATE);
    expect(second).toEqual(first);
    expect(ofType(t.sent, 'game_cancelled')).toEqual([A]);
  });

  it('caso 7: cancelar o jogo virtual (sem ninguém) funciona e não notifica', async () => {
    const t = await setup({ members: [A] });
    const game = await t.games.cancel(OWNER, t.group.id, DATE);
    expect(game.status).toBe('cancelled');
    expect(t.sent).toEqual([]);
    expect((await t.games.current(A, t.group.id)).status).toBe('cancelled');
  });

  it('caso 7: membro cancela → GROUP_NOT_OWNER; não-membro → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    await expectAppError(t.games.cancel(A, t.group.id, DATE), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.games.cancel(OUTSIDER, t.group.id, DATE), 'GROUP_NOT_FOUND', 404);
    expect((await t.games.current(A, t.group.id)).status).toBe('open');
    expect(t.sent).toEqual([]);
  });
});

describe('listas e meus grupos (caso 8)', () => {
  it('caso 8: membro vê confirmed e waitlist com nomes', async () => {
    const t = await setup({ slots: 2, members: [A, C, D] });
    await t.confirmInOrder(A, C, D);
    const game = await t.games.current(A, t.group.id);
    expect(game.confirmed.map((x) => [x.userId, x.name])).toEqual([
      [A, 'Ana'],
      [C, 'Caio'],
    ]);
    expect(game.waitlist.map((x) => [x.userId, x.name])).toEqual([[D, 'Duda']]);
    expect(iso(game.waitlist[0]?.confirmedAt ?? '')).toBe(
      new Date(THURSDAY_10H.getTime() + 2 * MINUTE).toISOString(),
    );
  });

  it('caso 8: lista de membros com o dono primeiro e name = nickname ?? name', async () => {
    const t = await setup({ members: [B, A] });
    const members = await t.groups.members(A, t.group.id);
    expect(members[0]).toEqual({ userId: OWNER, name: 'Dono', isOwner: true, role: 'member' });
    expect(members.slice(1).sort((x, y) => x.userId.localeCompare(y.userId))).toEqual([
      { userId: A, name: 'Ana', isOwner: false, role: 'member' },
      { userId: B, name: 'Bia', isOwner: false, role: 'member' },
    ]);
  });

  it('caso 8: "meus grupos" traz o jogo atual de cada grupo (confirmedCount = min(lista, vagas) e me)', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    const other = await t.groups.create(OWNER, {
      ...INPUT,
      name: 'Futebol de terça',
      sport: 'soccer',
      weekday: 2,
    });
    await t.groups.acceptInvite(C, tokenOf(other));

    const mine = await t.groups.myGroups(C);
    expect(mine.map((g) => g.id).sort()).toEqual([t.group.id, other.id].sort());
    for (const g of mine) expect(MyGroupSchema.parse(g)).toBeTruthy();

    const volley = mine.find((g) => g.id === t.group.id);
    expect(volley?.game).toMatchObject({ date: DATE, status: 'open', slots: 2, confirmedCount: 2 });
    expect(volley?.game.me).toEqual({ list: 'waitlist', position: 1 });
    expect(iso(volley?.game.startsAt ?? '')).toBe('2026-11-06T22:00:00.000Z');
    expect(volley?.inviteToken).toBeUndefined();

    const soccer = mine.find((g) => g.id === other.id);
    expect(soccer?.game).toMatchObject({ date: '2026-11-10', confirmedCount: 0 });
    expect(soccer?.game.me).toBeUndefined();

    const [mineA] = await t.groups.myGroups(A);
    expect(mineA?.game.me).toEqual({ list: 'confirmed', position: 1 });
  });

  it('caso 8: quem não está em nenhum grupo → "meus grupos" vazio', async () => {
    const t = await setup();
    expect(await t.groups.myGroups(OUTSIDER)).toEqual([]);
  });
});

describe('remover membro (casos 10–13)', () => {
  it('caso 10: dono remove A (dentro) → A perde o grupo e sai da lista', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await expect(t.groups.removeMember(OWNER, t.group.id, A)).resolves.toBeUndefined();
    await expectAppError(t.groups.get(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.games.current(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(await t.groups.myGroups(A)).toEqual([]);
    expect(ids(await t.groups.members(OWNER, t.group.id))).not.toContain(A);
  });

  it('caso 10: C sobe e recebe waitlist_promoted; A não é notificado', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.groups.removeMember(OWNER, t.group.id, A);
    const game = await t.games.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([B, C]);
    expect(game.waitlist).toEqual([]);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ userId: C, type: 'waitlist_promoted', link: `/groups/${t.group.id}` });
  });

  it('caso 10: remover quem estava na fila → sai da lista e ninguém é notificado', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.groups.removeMember(OWNER, t.group.id, C);
    const game = await t.games.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(game.waitlist).toEqual([]);
    expect(t.sent).toEqual([]);
  });

  it('caso 10: remover membro sem presença (jogo virtual) funciona', async () => {
    const t = await setup({ members: [A] });
    await t.groups.removeMember(OWNER, t.group.id, A);
    await expectAppError(t.groups.get(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(t.sent).toEqual([]);
  });

  it('caso 11: dono tenta se remover → GROUP_OWNER_NOT_REMOVABLE', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(t.groups.removeMember(OWNER, t.group.id, OWNER), 'GROUP_OWNER_NOT_REMOVABLE', 409);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toContain(OWNER);
  });

  it('caso 11: membro tenta remover outro → GROUP_NOT_OWNER', async () => {
    const t = await setup({ members: [A, B] });
    await expectAppError(t.groups.removeMember(A, t.group.id, B), 'GROUP_NOT_OWNER', 403);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toContain(B);
  });

  it('caso 11: remover quem não é membro → GROUP_MEMBER_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(t.groups.removeMember(OWNER, t.group.id, OUTSIDER), 'GROUP_MEMBER_NOT_FOUND', 404);
    expect((await t.groups.get(OWNER, t.group.id)).inviteToken).toBe(tokenOf(t.group));
  });

  it('caso 11: ordem dos erros → não-membro dá GROUP_NOT_FOUND; membro removendo o dono dá GROUP_NOT_OWNER', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(t.groups.removeMember(OUTSIDER, t.group.id, A), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.groups.removeMember(A, t.group.id, OWNER), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.removeMember(A, t.group.id, OUTSIDER), 'GROUP_NOT_OWNER', 403);
  });

  it('caso 12: depois de uma remoção, o token antigo dá GROUP_INVITE_INVALID e o grupo tem um token novo', async () => {
    const t = await setup({ members: [A] });
    const old = tokenOf(t.group);
    await t.groups.removeMember(OWNER, t.group.id, A);
    await expectAppError(t.groups.acceptInvite(A, old), 'GROUP_INVITE_INVALID', 404);
    await expectAppError(t.groups.acceptInvite(OUTSIDER, old), 'GROUP_INVITE_INVALID', 404);
    const fresh = tokenOf(await t.groups.get(OWNER, t.group.id));
    expect(fresh).not.toBe(old);
    const joined = await t.groups.acceptInvite(OUTSIDER, fresh);
    expect(joined.id).toBe(t.group.id);
  });

  it('caso 13: jogo in_progress, dono remove um confirmado → perde o acesso, continua na lista, ninguém notificado', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    t.clock.now = FRIDAY_20H;
    await t.groups.removeMember(OWNER, t.group.id, A);
    await expectAppError(t.groups.get(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(await t.groups.myGroups(A)).toEqual([]);
    const game = await t.games.current(OWNER, t.group.id);
    expect(game.status).toBe('in_progress');
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ids(game.waitlist)).toEqual([C]);
    expect(t.sent).toEqual([]);
  });
});

describe('remover membro: corrida com outra escrita (plano 006, casos 11–13)', () => {
  it('caso 11: B já foi removido por outra requisição (not_member) → GROUP_MEMBER_NOT_FOUND e ninguém notificado', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    t.store.removeScript.push(() => 'not_member');
    await expectAppError(t.groups.removeMember(OWNER, t.group.id, B), 'GROUP_MEMBER_NOT_FOUND', 404);
    expect(t.store.removeCalls).toHaveLength(1);
    expect(t.sent).toEqual([]);
  });

  it('caso 12: convite trocado no meio (stale e depois removed) → remove com o grupo relido e promove uma vez', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    const rotated = 'rotated-by-another-request';
    t.store.removeScript.push((args) => {
      t.store.swapToken(args.group.id, 'member', rotated);
      return 'stale';
    });

    await expect(t.groups.removeMember(OWNER, t.group.id, B)).resolves.toBeUndefined();

    expect(t.store.removeCalls).toHaveLength(2);
    expect(t.store.removeCalls[0]?.group.inviteToken).toBe(tokenOf(t.group));
    expect(t.store.removeCalls[1]?.group.inviteToken).toBe(rotated);
    expect(t.store.removeCalls[1]?.userId).toBe(B);
    expect(ids(await t.groups.members(OWNER, t.group.id))).not.toContain(B);
    const game = await t.games.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, C]);
    expect(game.waitlist).toEqual([]);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([C]);
    expect(t.sent).toHaveLength(1);
  });

  it('caso 13: stale 3 vezes → erro comum (500), não appError, e nada muda', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    t.store.removeScript.push(
      () => 'stale',
      () => 'stale',
      () => 'stale',
    );

    const err = await t.groups.removeMember(OWNER, t.group.id, B).then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AppError);
    expect(t.store.removeCalls).toHaveLength(3);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toContain(B);
    expect(t.sent).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Plano 007 (E2): reservas, link do jogo e lista em camadas. Relógio: quinta 10h, jogo sexta 19h.
// ---------------------------------------------------------------------------------------------

const opensAtOf = (err: AppError) => iso((err.details as { opensAt: string }).opensAt);
const fieldOf = (err: AppError) => (err.details as { field: string }).field;
const noTokens = (g: Group) => {
  expect(g.inviteToken).toBeUndefined();
  expect(g.reserveInviteToken).toBeUndefined();
  expect(g.guestToken).toBeUndefined();
};

describe('E2: criar com camadas (casos 1 e 2)', () => {
  it('caso 1: sem os campos novos, membros 48 → reservas 24, convidados desligados e os 3 links gerados', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, INPUT);
    expect(GroupSchema.parse(group)).toEqual(group);
    expect(group.reservesOpenHoursBefore).toBe(24);
    expect(group.guestsOpenHoursBefore).toBeUndefined();
    expect(group.myRole).toBe('member');
    const tokens = [tokenOf(group), reserveTokenOf(group), guestTokenOf(group)];
    expect(tokens.every((tk) => tk.length > 0)).toBe(true);
    expect(new Set(tokens).size).toBe(3);
  });

  it('caso 1: reservas padrão = metade dos membros arredondada para baixo (25 → 12)', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, { ...INPUT, listOpensHoursBefore: 25 });
    expect(group.reservesOpenHoursBefore).toBe(12);
  });

  it('caso 1: reservas e convidados informados são gravados', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, {
      ...INPUT,
      reservesOpenHoursBefore: 10,
      guestsOpenHoursBefore: 2,
    });
    expect(group).toMatchObject({
      listOpensHoursBefore: 48,
      reservesOpenHoursBefore: 10,
      guestsOpenHoursBefore: 2,
    });
  });

  it('caso 1: o dono vê os 3 links; membro e reserva não veem nenhum', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const own = await t.groups.get(OWNER, t.group.id);
    expect(own.inviteToken).toBe(tokenOf(t.group));
    expect(own.reserveInviteToken).toBe(reserveTokenOf(t.group));
    expect(own.guestToken).toBe(guestTokenOf(t.group));
    for (const id of [A, R]) {
      noTokens(await t.groups.get(id, t.group.id));
      const [mine] = await t.groups.myGroups(id);
      expect(mine).toBeDefined();
      if (mine) noTokens(mine);
    }
  });

  it('caso 2 (contrato): reservas 50 com membros 48 → issue em reservesOpenHoursBefore', () => {
    const result = CreateGroupInputSchema.safeParse({ ...INPUT, reservesOpenHoursBefore: 50 });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path)).toEqual([['reservesOpenHoursBefore']]);
  });

  it('caso 2 (contrato): convidados 30 com reservas 24 (informadas ou pela metade) → issue em guestsOpenHoursBefore', () => {
    const explicit = CreateGroupInputSchema.safeParse({
      ...INPUT,
      reservesOpenHoursBefore: 24,
      guestsOpenHoursBefore: 30,
    });
    expect(explicit.error?.issues.map((i) => i.path)).toEqual([['guestsOpenHoursBefore']]);
    const halved = CreateGroupInputSchema.safeParse({ ...INPUT, guestsOpenHoursBefore: 30 });
    expect(halved.error?.issues.map((i) => i.path)).toEqual([['guestsOpenHoursBefore']]);
    expect(CreateGroupInputSchema.safeParse({ ...INPUT, guestsOpenHoursBefore: 24 }).success).toBe(true);
  });

  it('caso 2: o service recusa reservas acima dos membros → GROUP_LAYERS_INVALID (reservesOpenHoursBefore) e não cria', async () => {
    const s = setupServices();
    const err = await expectAppError(
      s.groups.create(OWNER, { ...INPUT, reservesOpenHoursBefore: 50 }),
      'GROUP_LAYERS_INVALID',
      422,
    );
    expect(fieldOf(err)).toBe('reservesOpenHoursBefore');
    expect(await s.groups.myGroups(OWNER)).toEqual([]);
  });

  it('caso 2: o service recusa convidados acima das reservas → GROUP_LAYERS_INVALID (guestsOpenHoursBefore)', async () => {
    const s = setupServices();
    const explicit = await expectAppError(
      s.groups.create(OWNER, { ...INPUT, reservesOpenHoursBefore: 24, guestsOpenHoursBefore: 30 }),
      'GROUP_LAYERS_INVALID',
      422,
    );
    expect(fieldOf(explicit)).toBe('guestsOpenHoursBefore');
    const halved = await expectAppError(
      s.groups.create(OWNER, { ...INPUT, guestsOpenHoursBefore: 30 }),
      'GROUP_LAYERS_INVALID',
      422,
    );
    expect(fieldOf(halved)).toBe('guestsOpenHoursBefore');
    expect(await s.groups.myGroups(OWNER)).toEqual([]);
  });
});

describe('E2: link de reserva (casos 3 e 4)', () => {
  it('caso 3: aceitar o link de reserva → myRole reserve, em "meus grupos" e em members com role reserve', async () => {
    const t = await setup();
    const joined = await t.groups.acceptInvite(R, reserveTokenOf(t.group));
    expect(GroupSchema.parse(joined)).toBeTruthy();
    expect(joined).toMatchObject({ id: t.group.id, myRole: 'reserve' });
    noTokens(joined);
    expect((await t.groups.get(R, t.group.id)).myRole).toBe('reserve');
    const mine = await t.groups.myGroups(R);
    expect(mine.map((g) => [g.id, g.myRole])).toEqual([[t.group.id, 'reserve']]);
    expect(await t.groups.members(OWNER, t.group.id)).toEqual([
      { userId: OWNER, name: 'Dono', isOwner: true, role: 'member' },
      { userId: R, name: 'Rafa', isOwner: false, role: 'reserve' },
    ]);
  });

  it('caso 3: aceitar o link de reserva de novo → nada duplica', async () => {
    const t = await setup({ reserves: [R] });
    const again = await t.groups.acceptInvite(R, reserveTokenOf(t.group));
    expect(again.myRole).toBe('reserve');
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, R]);
    expect(await t.groups.myGroups(R)).toHaveLength(1);
  });

  it('caso 3: members traz os membros primeiro (dono no topo) e depois as reservas', async () => {
    const t = await setup();
    await t.groups.acceptInvite(R, reserveTokenOf(t.group));
    await t.groups.acceptInvite(A, tokenOf(t.group));
    await t.groups.acceptInvite(B, tokenOf(t.group));
    const list = await t.groups.members(R, t.group.id);
    expect(list.map((m) => m.role)).toEqual(['member', 'member', 'member', 'reserve']);
    expect(list[0]?.userId).toBe(OWNER);
    expect(list[3]?.userId).toBe(R);
  });

  it('caso 4: reserva aceita o link de membro → vira membro (sai das reservas)', async () => {
    const t = await setup({ reserves: [R] });
    const joined = await t.groups.acceptInvite(R, tokenOf(t.group));
    expect(joined.myRole).toBe('member');
    expect(await t.store.groups.roleOf(t.group.id, R)).toBe('member');
    const list = await t.groups.members(OWNER, t.group.id);
    expect(list.filter((m) => m.userId === R)).toEqual([
      { userId: R, name: 'Rafa', isOwner: false, role: 'member' },
    ]);
    expect(list.some((m) => m.role === 'reserve')).toBe(false);
  });

  it('caso 4: membro aceita o link de reserva → continua membro (o dono também)', async () => {
    const t = await setup({ members: [A] });
    expect((await t.groups.acceptInvite(A, reserveTokenOf(t.group))).myRole).toBe('member');
    expect((await t.groups.acceptInvite(OWNER, reserveTokenOf(t.group))).myRole).toBe('member');
    expect(await t.groups.members(OWNER, t.group.id)).toEqual([
      { userId: OWNER, name: 'Dono', isOwner: true, role: 'member' },
      { userId: A, name: 'Ana', isOwner: false, role: 'member' },
    ]);
  });
});

describe('E2: presença por camada (casos 5–7)', () => {
  it('caso 5: às 10h de quinta o membro confirma e a reserva recebe GAME_LIST_NOT_OPEN com opensAt = quinta 19h', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const game = await t.games.confirm(A, t.group.id, DATE);
    expect(ids(game.confirmed)).toEqual([A]);
    const err = await expectAppError(t.games.confirm(R, t.group.id, DATE), 'GAME_LIST_NOT_OPEN', 409);
    expect(opensAtOf(err)).toBe(THURSDAY_19H.toISOString());
    expect(ids((await t.games.current(OWNER, t.group.id)).confirmed)).toEqual([A]);
  });

  it('caso 5: às 19h de quinta a reserva confirma e entra com role reserve', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await t.confirmInOrder(A);
    t.clock.now = THURSDAY_19H;
    const game = await t.games.confirm(R, t.group.id, DATE);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game.confirmed.map((x) => [x.userId, x.role])).toEqual([
      [A, 'member'],
      [R, 'reserve'],
    ]);
    expect(game.me).toEqual({ list: 'confirmed', position: 2 });
  });

  it('caso 6: myOpensAt da reserva = abertura das reservas; do membro = opensAt; reservesOpensAt igual para todos', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const forMember = await t.games.current(A, t.group.id);
    const forReserve = await t.games.current(R, t.group.id);
    expect(GameSchema.parse(forMember)).toBeTruthy();
    expect(GameSchema.parse(forReserve)).toBeTruthy();
    expect(iso(forMember.opensAt)).toBe(WEDNESDAY_19H.toISOString());
    expect(iso(forMember.myOpensAt ?? '')).toBe(iso(forMember.opensAt));
    expect(iso(forReserve.myOpensAt ?? '')).toBe(THURSDAY_19H.toISOString());
    expect(iso(forMember.reservesOpensAt)).toBe(THURSDAY_19H.toISOString());
    expect(iso(forReserve.reservesOpensAt)).toBe(THURSDAY_19H.toISOString());
    expect(forMember.guestsOpensAt).toBeUndefined();
    expect(forReserve.guestsOpensAt).toBeUndefined();
  });

  it('caso 6: o status segue a camada dos membros, também para a reserva', async () => {
    const t = await setup({ reserves: [R] });
    expect((await t.games.current(R, t.group.id)).status).toBe('open');
  });

  it('caso 6: com convidados 6 h, guestsOpensAt = sexta 13h para membro e reserva', async () => {
    const t = await setup({ members: [A], reserves: [R], guestsOpenHoursBefore: 6 });
    for (const id of [A, R]) {
      expect(iso((await t.games.current(id, t.group.id)).guestsOpensAt ?? '')).toBe(FRIDAY_13H.toISOString());
    }
  });

  it('caso 7: vagas 2, A e R dentro; B confirma → fila (D1); R desiste → B sobe e recebe waitlist_promoted', async () => {
    const t = await setup({ slots: 2, reservesOpenHoursBefore: 48, members: [A, B], reserves: [R] });
    await t.confirmInOrder(A, R, B);
    const full = await t.games.current(B, t.group.id);
    expect(full.confirmed.map((x) => [x.userId, x.role])).toEqual([
      [A, 'member'],
      [R, 'reserve'],
    ]);
    expect(ids(full.waitlist)).toEqual([B]);
    expect(full.me).toEqual({ list: 'waitlist', position: 1 });
    expect(t.sent).toEqual([]);

    await t.games.leave(R, t.group.id, DATE);
    const game = await t.games.current(B, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(game.waitlist).toEqual([]);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ userId: B, type: 'waitlist_promoted', link: `/groups/${t.group.id}` });
  });
});

describe('E2: link do jogo (casos 8–10)', () => {
  it('caso 8: convidados desligados → ver, confirmar e desistir pelo link dão GAME_LINK_INVALID', async () => {
    const t = await setup();
    const token = guestTokenOf(t.group);
    await expectAppError(t.games.guestView(G, token), 'GAME_LINK_INVALID', 404);
    await expectAppError(t.games.guestConfirm(G, token, DATE), 'GAME_LINK_INVALID', 404);
    await expectAppError(t.games.guestLeave(G, token, DATE), 'GAME_LINK_INVALID', 404);
  });

  it('caso 8: token desconhecido → GAME_LINK_INVALID', async () => {
    const t = await setup({ guestsOpenHoursBefore: 6 });
    await expectAppError(t.games.guestView(G, 'nope'), 'GAME_LINK_INVALID', 404);
    await expectAppError(t.games.guestView(G, tokenOf(t.group)), 'GAME_LINK_INVALID', 404);
  });

  it('caso 8: o dono liga convidados com 6 h → o mesmo link vale; antes de sexta 13h vê o jogo e confirmar dá GAME_LIST_NOT_OPEN', async () => {
    const t = await setup();
    const token = guestTokenOf(t.group);
    const updated = await t.groups.update(OWNER, t.group.id, { guestsOpenHoursBefore: 6 });
    expect(updated.guestsOpenHoursBefore).toBe(6);
    expect(updated.guestToken).toBe(token);

    const view = await t.games.guestView(G, token);
    expect(GuestGameSchema.parse(view)).toBeTruthy();
    expect(view.myRole).toBe('guest');
    expect(view.group).toMatchObject({
      id: t.group.id,
      name: INPUT.name,
      sport: INPUT.sport,
      weekday: INPUT.weekday,
      time: INPUT.time,
      timeZone: 'America/Sao_Paulo',
    });
    expect(view.group).not.toHaveProperty('inviteToken');
    expect(view.group).not.toHaveProperty('reserveInviteToken');
    expect(view.group).not.toHaveProperty('guestToken');
    expect(view.game.date).toBe(DATE);
    expect(iso(view.game.myOpensAt ?? '')).toBe(FRIDAY_13H.toISOString());
    expect(iso(view.game.guestsOpensAt ?? '')).toBe(FRIDAY_13H.toISOString());

    const err = await expectAppError(t.games.guestConfirm(G, token, DATE), 'GAME_LIST_NOT_OPEN', 409);
    expect(opensAtOf(err)).toBe(FRIDAY_13H.toISOString());
  });

  it('caso 8: a partir de sexta 13h o convidado confirma e aparece na lista com role guest', async () => {
    const t = await setup({ members: [A], guestsOpenHoursBefore: 6 });
    t.clock.now = FRIDAY_13H;
    await t.confirmInOrder(A);
    const game = await t.games.guestConfirm(G, guestTokenOf(t.group), DATE);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game.confirmed.map((x) => [x.userId, x.name, x.role])).toEqual([
      [A, 'Ana', 'member'],
      [G, 'Gabi', 'guest'],
    ]);
    expect(game.me).toEqual({ list: 'confirmed', position: 2 });
    const seen = await t.games.current(OWNER, t.group.id);
    expect(seen.confirmed.find((x) => x.userId === G)?.role).toBe('guest');
    expect((await t.games.guestView(G, guestTokenOf(t.group))).game.me).toEqual({
      list: 'confirmed',
      position: 2,
    });
  });

  it('caso 9: convidado não vira membro: fora de members e de "meus grupos", e o grupo dá GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A], reservesOpenHoursBefore: 48, guestsOpenHoursBefore: 48 });
    await t.guestConfirmInOrder(G);
    expect(ids(await t.groups.members(OWNER, t.group.id))).not.toContain(G);
    expect(await t.store.groups.roleOf(t.group.id, G)).toBeUndefined();
    expect(await t.groups.myGroups(G)).toEqual([]);
    await expectAppError(t.groups.get(G, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.groups.members(G, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.games.current(G, t.group.id), 'GROUP_NOT_FOUND', 404);
  });

  it('caso 9: convidado desiste pelo link → sai da lista; desistir de novo é ok', async () => {
    const t = await setup({ members: [A], reservesOpenHoursBefore: 48, guestsOpenHoursBefore: 48 });
    await t.confirmInOrder(A);
    await t.guestConfirmInOrder(G);
    const token = guestTokenOf(t.group);
    await expect(t.games.guestLeave(G, token, DATE)).resolves.toBeUndefined();
    expect(ids((await t.games.current(OWNER, t.group.id)).confirmed)).toEqual([A]);
    expect((await t.games.guestView(G, token)).game.me).toBeUndefined();
    await expect(t.games.guestLeave(G, token, DATE)).resolves.toBeUndefined();
  });

  it('caso 9: convidado dentro desiste → a fila sobe com aviso', async () => {
    const t = await setup({
      slots: 2,
      members: [A, B],
      reservesOpenHoursBefore: 48,
      guestsOpenHoursBefore: 48,
    });
    await t.confirmInOrder(A);
    await t.guestConfirmInOrder(G);
    await t.confirmInOrder(B);
    expect(ids((await t.games.current(B, t.group.id)).waitlist)).toEqual([B]);
    await t.games.guestLeave(G, guestTokenOf(t.group), DATE);
    const game = await t.games.current(B, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([B]);
    expect(t.sent).toHaveLength(1);
  });

  it('caso 10: membro abre o link do jogo → myRole member e confirma pela camada dos membros', async () => {
    const t = await setup({ members: [A], guestsOpenHoursBefore: 6 });
    const token = guestTokenOf(t.group);
    const view = await t.games.guestView(A, token);
    expect(view.myRole).toBe('member');
    expect(iso(view.game.myOpensAt ?? '')).toBe(WEDNESDAY_19H.toISOString());
    expect((await t.games.guestView(OWNER, token)).myRole).toBe('member');
    const game = await t.games.guestConfirm(A, token, DATE);
    expect(game.confirmed.map((x) => [x.userId, x.role])).toEqual([[A, 'member']]);
    expect((await t.games.current(A, t.group.id)).me).toEqual({ list: 'confirmed', position: 1 });
  });

  it('caso 10: reserva abre o link do jogo → myRole reserve e vale a camada das reservas', async () => {
    const t = await setup({ reserves: [R], guestsOpenHoursBefore: 6 });
    const token = guestTokenOf(t.group);
    const view = await t.games.guestView(R, token);
    expect(view.myRole).toBe('reserve');
    expect(iso(view.game.myOpensAt ?? '')).toBe(THURSDAY_19H.toISOString());
    const err = await expectAppError(t.games.guestConfirm(R, token, DATE), 'GAME_LIST_NOT_OPEN', 409);
    expect(opensAtOf(err)).toBe(THURSDAY_19H.toISOString());
    t.clock.now = THURSDAY_19H;
    const game = await t.games.guestConfirm(R, token, DATE);
    expect(game.confirmed.map((x) => [x.userId, x.role])).toEqual([[R, 'reserve']]);
  });
});

describe('E2: troca dos links (caso 11)', () => {
  it('caso 11: dono troca o link de convidados → o antigo dá GAME_LINK_INVALID e o novo vale; os outros não mudam', async () => {
    const t = await setup({ guestsOpenHoursBefore: 6 });
    const old = guestTokenOf(t.group);
    const invite = await t.groups.rotateInvite(OWNER, t.group.id, 'guest');
    expect(InviteSchema.parse(invite)).toEqual(invite);
    expect(invite.kind).toBe('guest');
    expect(invite.token).not.toBe(old);
    await expectAppError(t.games.guestView(G, old), 'GAME_LINK_INVALID', 404);
    expect((await t.games.guestView(G, invite.token)).myRole).toBe('guest');
    const own = await t.groups.get(OWNER, t.group.id);
    expect(own.guestToken).toBe(invite.token);
    expect(own.inviteToken).toBe(tokenOf(t.group));
    expect(own.reserveInviteToken).toBe(reserveTokenOf(t.group));
  });

  it('caso 11: dono troca o link de reserva → o antigo dá GROUP_INVITE_INVALID; o de membro continua valendo', async () => {
    const t = await setup();
    const old = reserveTokenOf(t.group);
    const invite = await t.groups.rotateInvite(OWNER, t.group.id, 'reserve');
    expect(invite).toMatchObject({ kind: 'reserve' });
    expect(invite.token).not.toBe(old);
    await expectAppError(t.groups.acceptInvite(R, old), 'GROUP_INVITE_INVALID', 404);
    expect((await t.groups.acceptInvite(R, invite.token)).myRole).toBe('reserve');
    expect((await t.groups.acceptInvite(A, tokenOf(t.group))).myRole).toBe('member');
    const own = await t.groups.get(OWNER, t.group.id);
    expect(own.reserveInviteToken).toBe(invite.token);
    expect(own.inviteToken).toBe(tokenOf(t.group));
  });

  it('caso 11: membro ou reserva tenta trocar qualquer link → GROUP_NOT_OWNER e nada muda', async () => {
    const t = await setup({ members: [A], reserves: [R], guestsOpenHoursBefore: 6 });
    for (const id of [A, R]) {
      for (const kind of KINDS) {
        await expectAppError(t.groups.rotateInvite(id, t.group.id, kind), 'GROUP_NOT_OWNER', 403);
      }
    }
    const own = await t.groups.get(OWNER, t.group.id);
    expect([own.inviteToken, own.reserveInviteToken, own.guestToken]).toEqual([
      tokenOf(t.group),
      reserveTokenOf(t.group),
      guestTokenOf(t.group),
    ]);
  });

  it('caso 11: trocar o link de convidados com convidados desligados → GAME_LINK_INVALID', async () => {
    const t = await setup();
    await expectAppError(t.groups.rotateInvite(OWNER, t.group.id, 'guest'), 'GAME_LINK_INVALID', 404);
    expect((await t.groups.get(OWNER, t.group.id)).guestToken).toBe(guestTokenOf(t.group));
  });
});

describe('E2: remover reserva (caso 12)', () => {
  it('caso 12: dono remove reserva confirmada → ela perde o acesso e sai da lista; a fila sobe com aviso', async () => {
    const t = await setup({ slots: 2, reservesOpenHoursBefore: 48, members: [A, B], reserves: [R] });
    await t.confirmInOrder(A, R, B);
    await expect(t.groups.removeMember(OWNER, t.group.id, R)).resolves.toBeUndefined();
    await expectAppError(t.groups.get(R, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.games.current(R, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(await t.groups.myGroups(R)).toEqual([]);
    expect(ids(await t.groups.members(OWNER, t.group.id))).not.toContain(R);
    const game = await t.games.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(game.waitlist).toEqual([]);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ userId: B, type: 'waitlist_promoted' });
    expect(t.store.removeCalls.at(-1)).toMatchObject({ userId: R, role: 'reserve' });
  });

  it('caso 12: remover reserva troca o link de reserva e não o de membro', async () => {
    const t = await setup({ reserves: [R] });
    const oldReserve = reserveTokenOf(t.group);
    await t.groups.removeMember(OWNER, t.group.id, R);
    const own = await t.groups.get(OWNER, t.group.id);
    expect(own.inviteToken).toBe(tokenOf(t.group));
    expect(own.guestToken).toBe(guestTokenOf(t.group));
    expect(own.reserveInviteToken).toBeTypeOf('string');
    expect(own.reserveInviteToken).not.toBe(oldReserve);
    await expectAppError(t.groups.acceptInvite(R, oldReserve), 'GROUP_INVITE_INVALID', 404);
    expect((await t.groups.acceptInvite(OUTSIDER, own.reserveInviteToken ?? '')).myRole).toBe('reserve');
  });

  it('caso 12: remover membro continua trocando só o link de membro', async () => {
    const t = await setup({ members: [A] });
    await t.groups.removeMember(OWNER, t.group.id, A);
    const own = await t.groups.get(OWNER, t.group.id);
    expect(own.inviteToken).not.toBe(tokenOf(t.group));
    expect(own.reserveInviteToken).toBe(reserveTokenOf(t.group));
    expect(t.store.removeCalls.at(-1)).toMatchObject({ userId: A, role: 'member' });
  });
});

describe('E2: configurar as camadas (caso 13)', () => {
  it('caso 13: PATCH por membro ou reserva → GROUP_NOT_OWNER; não-membro → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await expectAppError(
      t.groups.update(A, t.group.id, { listOpensHoursBefore: 30 }),
      'GROUP_NOT_OWNER',
      403,
    );
    await expectAppError(
      t.groups.update(R, t.group.id, { listOpensHoursBefore: 30 }),
      'GROUP_NOT_OWNER',
      403,
    );
    await expectAppError(
      t.groups.update(OUTSIDER, t.group.id, { listOpensHoursBefore: 30 }),
      'GROUP_NOT_FOUND',
      404,
    );
    expect((await t.groups.get(OWNER, t.group.id)).listOpensHoursBefore).toBe(48);
  });

  it('caso 13: { listOpensHoursBefore: 20 } com reservas 24 → GROUP_LAYERS_INVALID (reservesOpenHoursBefore) e nada muda', async () => {
    const t = await setup();
    const err = await expectAppError(
      t.groups.update(OWNER, t.group.id, { listOpensHoursBefore: 20 }),
      'GROUP_LAYERS_INVALID',
      422,
    );
    expect(fieldOf(err)).toBe('reservesOpenHoursBefore');
    expect(await t.groups.get(OWNER, t.group.id)).toMatchObject({
      listOpensHoursBefore: 48,
      reservesOpenHoursBefore: 24,
    });
  });

  it('caso 13: convidados acima das reservas → GROUP_LAYERS_INVALID (guestsOpenHoursBefore)', async () => {
    const t = await setup();
    const err = await expectAppError(
      t.groups.update(OWNER, t.group.id, { guestsOpenHoursBefore: 30 }),
      'GROUP_LAYERS_INVALID',
      422,
    );
    expect(fieldOf(err)).toBe('guestsOpenHoursBefore');
    expect((await t.groups.get(OWNER, t.group.id)).guestsOpenHoursBefore).toBeUndefined();
  });

  it('caso 13: PATCH válido junta com o atual e devolve o grupo do dono; o jogo usa a nova abertura', async () => {
    const t = await setup({ members: [A] });
    const updated = await t.groups.update(OWNER, t.group.id, { listOpensHoursBefore: 30 });
    expect(GroupSchema.parse(updated)).toEqual(updated);
    expect(updated).toMatchObject({
      listOpensHoursBefore: 30,
      reservesOpenHoursBefore: 24,
      myRole: 'member',
    });
    expect(updated.inviteToken).toBe(tokenOf(t.group));
    expect(iso((await t.games.current(A, t.group.id)).opensAt)).toBe('2026-11-05T16:00:00.000Z');
  });

  it('caso 13: { guestsOpenHoursBefore: null } desliga os convidados', async () => {
    const t = await setup({ members: [A], guestsOpenHoursBefore: 6 });
    const token = guestTokenOf(t.group);
    expect((await t.games.guestView(G, token)).myRole).toBe('guest');
    const updated = await t.groups.update(OWNER, t.group.id, { guestsOpenHoursBefore: null });
    expect(updated.guestsOpenHoursBefore).toBeUndefined();
    await expectAppError(t.games.guestView(G, token), 'GAME_LINK_INVALID', 404);
    expect((await t.games.current(A, t.group.id)).guestsOpensAt).toBeUndefined();
  });

  it('caso 13 (contrato): PATCH vazio é inválido; null em convidados é aceito; GroupLayersSchema aponta o campo', () => {
    expect(UpdateGroupInputSchema.safeParse({}).success).toBe(false);
    expect(UpdateGroupInputSchema.safeParse({ guestsOpenHoursBefore: null }).success).toBe(true);
    const layers = GroupLayersSchema.safeParse({ listOpensHoursBefore: 20, reservesOpenHoursBefore: 24 });
    expect(layers.error?.issues.map((i) => i.path)).toEqual([['reservesOpenHoursBefore']]);
  });
});

describe('E2: grupo de antes da E2 (caso 14, D3 e D6)', () => {
  const LEGACY_TOKEN = 'legacy-member-token';

  async function legacySetup() {
    const s = setupServices();
    const id = randomUUID();
    s.store.seedLegacy({
      id,
      createdAt: '2026-10-01T00:00:00.000Z',
      name: 'Vôlei antigo',
      sport: 'volleyball',
      weekday: 5,
      time: '19:00',
      timeZone: 'America/Sao_Paulo',
      slots: 12,
      listOpensHoursBefore: 48,
      ownerId: OWNER,
      inviteToken: LEGACY_TOKEN,
    });
    return { ...s, id };
  }

  it('caso 14: lido com reservas = membros e convidados desligados', async () => {
    const t = await legacySetup();
    const own = await t.groups.get(OWNER, t.id);
    expect(GroupSchema.parse(own)).toBeTruthy();
    expect(own).toMatchObject({ listOpensHoursBefore: 48, reservesOpenHoursBefore: 48, myRole: 'member' });
    expect(own.guestsOpenHoursBefore).toBeUndefined();
    expect(own.inviteToken).toBe(LEGACY_TOKEN);
    expect(own.reserveInviteToken).toBeUndefined();
    expect(own.guestToken).toBeUndefined();
    const game = await t.games.current(OWNER, t.id);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(iso(game.reservesOpensAt)).toBe(iso(game.opensAt));
    expect(game.guestsOpensAt).toBeUndefined();
    expect((await t.groups.acceptInvite(A, LEGACY_TOKEN)).myRole).toBe('member');
  });

  it('caso 14: o dono gera o link de reserva pela troca e ele passa a valer', async () => {
    const t = await legacySetup();
    const invite = await t.groups.rotateInvite(OWNER, t.id, 'reserve');
    expect(invite.kind).toBe('reserve');
    const joined = await t.groups.acceptInvite(R, invite.token);
    expect(joined).toMatchObject({ id: t.id, myRole: 'reserve' });
    const own = await t.groups.get(OWNER, t.id);
    expect(own.reserveInviteToken).toBe(invite.token);
    expect(own.inviteToken).toBe(LEGACY_TOKEN);
  });

  it('caso 14: o link do jogo só sai depois de ligar os convidados', async () => {
    const t = await legacySetup();
    await expectAppError(t.groups.rotateInvite(OWNER, t.id, 'guest'), 'GAME_LINK_INVALID', 404);
    await t.groups.update(OWNER, t.id, { guestsOpenHoursBefore: 6 });
    const invite = await t.groups.rotateInvite(OWNER, t.id, 'guest');
    expect((await t.games.guestView(G, invite.token)).myRole).toBe('guest');
  });
});

describe('E2: o que a reserva vê e faz (caso 15)', () => {
  it('caso 15: reserva vê a página do grupo, os membros e o jogo, sem os tokens', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const seen = await t.groups.get(R, t.group.id);
    expect(seen).toMatchObject({ id: t.group.id, myRole: 'reserve' });
    noTokens(seen);
    expect(ids(await t.groups.members(R, t.group.id))).toEqual([OWNER, A, R]);
    const game = await t.games.current(R, t.group.id);
    expect(game.groupId).toBe(t.group.id);
  });

  it('caso 15: reserva não remove ninguém (GROUP_NOT_OWNER) e ninguém sai', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await expectAppError(t.groups.removeMember(R, t.group.id, A), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.removeMember(R, t.group.id, R), 'GROUP_NOT_OWNER', 403);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A, R]);
  });

  it('caso 15: reserva não cancela o jogo (GROUP_NOT_OWNER)', async () => {
    const t = await setup({ reserves: [R] });
    await expectAppError(t.games.cancel(R, t.group.id, DATE), 'GROUP_NOT_OWNER', 403);
  });
});
