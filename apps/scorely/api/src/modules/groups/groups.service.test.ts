import { randomUUID } from 'node:crypto';
import {
  type CreateGroupInput,
  CreateGroupInputSchema,
  type ErrorCode,
  GameSchema,
  type Group,
  GroupSchema,
  MyGroupSchema,
  type Notification,
  type User,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/errors';
import type { NewNotification } from '../notifications/notification.service';
import type { AttendanceRecord, GameRecord, GameRepository } from './game.repository';
import { createGameService } from './game.service';
import type { GroupRepository } from './group.repository';
import { createGroupService } from './group.service';

// Plano 003, bloco 2: casos 1, 2, 3 (api), 4 (service), 5, 6, 7, 8, 10–13 e a corrida na criação do jogo (tarefa 6a).

type ReadOpts = { consistent?: boolean };
/** Grupo como o repositório guarda: sempre com `inviteToken` (interface do bloco 2). */
type Stored = Group & { inviteToken: string };

const MINUTE = 60 * 1000;
const iso = (value: string | Date) => new Date(value).toISOString();

/** Quinta 2026-11-05 10:00 em São Paulo. */
const THURSDAY_10H = new Date('2026-11-05T13:00:00.000Z');
/** Sexta 2026-11-06 20:00 em São Paulo (jogo de 19h em andamento). */
const FRIDAY_20H = new Date('2026-11-06T23:00:00.000Z');
/** Sexta 2026-11-06 22:01 em São Paulo (passou a janela de 3 h). */
const FRIDAY_22H01 = new Date('2026-11-07T01:01:00.000Z');
const DATE = '2026-11-06';
const NEXT_DATE = '2026-11-13';

const OWNER = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333';
const C = '44444444-4444-4444-8444-444444444444';
const D = '55555555-5555-4555-8555-555555555555';
const OUTSIDER = '66666666-6666-4666-8666-666666666666';
const LISBON_OWNER = '77777777-7777-4777-8777-777777777777';

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

/**
 * Repositórios em memória com o estado compartilhado (o `removeMember` do grupo apaga a presença do jogo, D12).
 * `race.stale`: a próxima leitura não consistente do jogo por data não enxerga nada (simula a corrida do D2).
 */
function memoryStore() {
  const groups = new Map<string, Stored>();
  const invites = new Map<string, string>();
  const members = new Map<string, string[]>();
  const games = new Map<string, GameRecord>();
  const gameByDate = new Map<string, string>();
  const attendance = new Map<string, AttendanceRecord>();
  const race = { stale: false };
  const findByDateReads: (ReadOpts | undefined)[] = [];

  const attKey = (gameId: string, userId: string) => `${gameId}#${userId}`;
  const membersOf = (groupId: string) => members.get(groupId) ?? [];
  const swapInvite = (group: Group, newToken: string) => {
    const stored = groups.get(group.id);
    if (!stored) return;
    invites.delete(stored.inviteToken);
    invites.set(newToken, group.id);
    groups.set(group.id, { ...stored, inviteToken: newToken });
  };
  const dropAttendance = (a: AttendanceRecord) => attendance.delete(attKey(a.gameId, a.userId));

  const groupRepo: GroupRepository = {
    async get(id: string, _opts?: ReadOpts) {
      const g = groups.get(id);
      return g && { ...g };
    },
    async getByInvite(token: string) {
      const id = invites.get(token);
      const g = id === undefined ? undefined : groups.get(id);
      return g && { ...g };
    },
    async create(group: Stored) {
      groups.set(group.id, { ...group });
      invites.set(group.inviteToken, group.id);
      members.set(group.id, [group.ownerId]);
    },
    isMember: async (groupId: string, userId: string) => membersOf(groupId).includes(userId),
    async addMember(groupId: string, userId: string) {
      if (!membersOf(groupId).includes(userId)) members.set(groupId, [...membersOf(groupId), userId]);
    },
    listMembers: async (groupId: string) => [...membersOf(groupId)],
    listGroupsOf: async (userId: string) =>
      [...members.entries()].filter(([, ids]) => ids.includes(userId)).map(([groupId]) => groupId),
    async rotateInvite(group: Group, newToken: string) {
      swapInvite(group, newToken);
    },
    async removeMember(args: {
      group: Group;
      userId: string;
      newToken: string;
      attendance?: AttendanceRecord;
    }) {
      members.set(
        args.group.id,
        membersOf(args.group.id).filter((id) => id !== args.userId),
      );
      swapInvite(args.group, args.newToken);
      if (args.attendance) dropAttendance(args.attendance);
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

  return { groups: groupRepo, games: gameRepo, race, findByDateReads, gameCount: () => games.size };
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

/** Grupo do OWNER (sexta 19h, São Paulo) com os `members` entrando pelo link. */
async function setup(
  opts: { slots?: number; listOpensHoursBefore?: number; members?: string[]; now?: Date } = {},
) {
  const s = setupServices(opts.now);
  const group = await s.groups.create(OWNER, {
    ...INPUT,
    slots: opts.slots ?? INPUT.slots,
    listOpensHoursBefore: opts.listOpensHoursBefore ?? INPUT.listOpensHoursBefore,
  });
  for (const id of opts.members ?? []) await s.groups.acceptInvite(id, tokenOf(group));
  /** Confirma um por vez, avançando o relógio 1 min entre eles (`confirmedAt` define a ordem). */
  const confirmInOrder = async (...ids: string[]) => {
    for (const id of ids) {
      await s.games.confirm(id, group.id, DATE);
      s.tick();
    }
  };
  return { ...s, group, confirmInOrder };
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
    expect(members).toEqual([{ userId: OWNER, name: 'Dono', isOwner: true }]);
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
    const invite = await t.groups.rotateInvite(OWNER, t.group.id);
    expect(invite.inviteToken).not.toBe(old);
    expect((await t.groups.get(OWNER, t.group.id)).inviteToken).toBe(invite.inviteToken);
  });

  it('caso 2: gera outro → o antigo dá GROUP_INVITE_INVALID e o novo funciona', async () => {
    const t = await setup();
    const old = tokenOf(t.group);
    const invite = await t.groups.rotateInvite(OWNER, t.group.id);
    await expectAppError(t.groups.acceptInvite(A, old), 'GROUP_INVITE_INVALID', 404);
    expect(await t.groups.members(OWNER, t.group.id)).toHaveLength(1);
    const joined = await t.groups.acceptInvite(A, invite.inviteToken);
    expect(joined.id).toBe(t.group.id);
  });

  it('caso 2: membro tenta gerar → GROUP_NOT_OWNER; não-membro → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(t.groups.rotateInvite(A, t.group.id), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.rotateInvite(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
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
      { userId: OWNER, name: 'Dono', isOwner: true },
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
    expect(members[0]).toEqual({ userId: OWNER, name: 'Dono', isOwner: true });
    expect(members.slice(1).sort((x, y) => x.userId.localeCompare(y.userId))).toEqual([
      { userId: A, name: 'Ana', isOwner: false },
      { userId: B, name: 'Bia', isOwner: false },
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
