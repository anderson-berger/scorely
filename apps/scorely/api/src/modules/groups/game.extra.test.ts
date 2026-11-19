import { randomUUID } from 'node:crypto';
import { gameIdOf, zonedToUtc } from '@scorely/api/src/lib/zoned';
import {
  A,
  B,
  C,
  expectAppError,
  expectDenied,
  FRIDAY_20H,
  ids,
  OUTSIDER,
  OWNER,
  ofType,
  setup,
} from '@scorely/api/src/modules/groups/groups.memory';
import {
  type CreateGameInput,
  CreateGameInputSchema,
  GameSchema,
  GroupSchema,
  type PlaceInput,
  RescheduleGameInputSchema,
  ROLES,
  UpdateGroupNameInputSchema,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Jogo extra, remarcar e nome (GRP-68–71, .claude/work/jogo-extra-remarcar-nome.md). O grupo do `setup` joga
// sexta 19:00–22:00 (São Paulo); o relógio começa na quinta 05/11 10:00 (13:00Z).

type T = Awaited<ReturnType<typeof setup>>;

const SAT = '2026-11-07';
/** Sábado 09:00–11:00 em São Paulo. */
const EXTRA: CreateGameInput = { date: SAT, start: '09:00', end: '11:00' };
const utc = (t: T, date: string, time: string) => zonedToUtc(date, time, t.group.timeZone).toISOString();

const PLACE: PlaceInput = {
  name: 'Quadra do clube',
  address: {
    street: 'Rua das Palmeiras',
    number: '10',
    district: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    country: 'BR',
  },
  lat: -23.5614,
  lng: -46.6559,
};

async function addPlace(t: T) {
  const before = t.store.placesOf(t.group.id).length;
  await t.places.create(OWNER, t.group.id, PLACE);
  const created = t.store.placesOf(t.group.id)[before];
  expect(created).toBeDefined();
  return created?.id ?? '';
}

/** A versão gravada do jogo (o virtual ainda não tem item: 0). */
const versionOfGame = (t: T, gameId: string) => t.store.storedGameById(gameId)?.version ?? 0;
const stored = (t: T, gameId: string) => t.store.storedGameById(gameId);

describe('GRP-68: jogo extra', () => {
  it('GRP-68: marcar → um jogo item, sem horário, com um id próprio, no fuso do grupo', async () => {
    const t = await setup({ members: [A] });
    const game = await t.games.createExtra(OWNER, t.group.id, EXTRA);
    expect(GameSchema.parse(game)).toEqual(game);
    expect(game.scheduleId).toBeUndefined();
    expect(game.id).not.toContain(SAT);
    expect(game).toMatchObject({
      groupId: t.group.id,
      date: SAT,
      startsAt: utc(t, SAT, '09:00'),
      endsAt: utc(t, SAT, '11:00'),
    });
    expect(game.rescheduled).toBeUndefined();
    const item = stored(t, game.id);
    expect(item).toMatchObject({ groupId: t.group.id, startsAt: utc(t, SAT, '09:00') });
    expect(item?.scheduleId).toBeUndefined();
  });

  it('GRP-68: ninguém é avisado quando ele é marcado', async () => {
    const t = await setup({ members: [A, B], reserves: [C] });
    await t.games.createExtra(OWNER, t.group.id, EXTRA);
    expect(t.sent).toEqual([]);
  });

  it('GRP-68: aparece entre os próximos jogos (GRP-11), em ordem de início', async () => {
    const t = await setup({ members: [A] });
    const game = await t.games.createExtra(OWNER, t.group.id, EXTRA);
    const list = await t.games.upcoming(A, t.group.id);
    expect(list.map((g) => g.id)).toEqual([t.gameId, game.id]);
    expect(list[1]?.scheduleId).toBeUndefined();
  });

  it('GRP-68: sem vagas, mínimo e lugar valem os do grupo; com eles, são só do jogo (GRP-66)', async () => {
    const t = await setup({ members: [A] });
    const plain = await t.games.createExtra(OWNER, t.group.id, EXTRA);
    expect(plain).toMatchObject({ slots: 12 });
    expect(plain.slotsCustom).not.toBe(true);
    expect(plain.place).toBeUndefined();

    const placeId = await addPlace(t);
    const own = await t.games.createExtra(OWNER, t.group.id, {
      date: '2026-11-08',
      start: '09:00',
      end: '11:00',
      slots: 14,
      minPlayers: 8,
      placeId,
    });
    expect(own).toMatchObject({ slots: 14, slotsCustom: true, minPlayers: 8, minPlayersCustom: true });
    expect(own.place?.id).toBe(placeId);
    expect((await t.groups.get(OWNER, t.group.id)).slots).toBe(12);
  });

  it('GRP-68: lugar que não é do grupo → PLACE_NOT_FOUND; mínimo acima das vagas → GROUP_MIN_PLAYERS_INVALID', async () => {
    const t = await setup();
    await expectAppError(
      t.games.createExtra(OWNER, t.group.id, { ...EXTRA, placeId: randomUUID() }),
      'PLACE_NOT_FOUND',
      404,
    );
    await expectAppError(
      t.games.createExtra(OWNER, t.group.id, { ...EXTRA, slots: 6, minPlayers: 8 }),
      'GROUP_MIN_PLAYERS_INVALID',
      422,
    );
    expect(t.store.gameCount()).toBe(0);
  });

  it('GRP-68 (contrato): duração de 30 min a 6 h, no mesmo dia; o resto é VALIDATION_ERROR', () => {
    const parse = (start: string, end: string) =>
      CreateGameInputSchema.safeParse({ date: SAT, start, end }).success;
    expect(parse('09:00', '09:30')).toBe(true);
    expect(parse('09:00', '15:00')).toBe(true);
    expect(parse('09:00', '09:29')).toBe(false);
    expect(parse('09:00', '15:01')).toBe(false);
    expect(parse('11:00', '09:00')).toBe(false);
    expect(parse('09:00', '09:00')).toBe(false);
  });

  it('GRP-68: o início tem que ser depois de agora e no máximo 30 dias à frente → GAME_START_OUT_OF_RANGE', async () => {
    const t = await setup();
    const past = await expectAppError(
      t.games.createExtra(OWNER, t.group.id, { date: '2026-11-05', start: '09:00', end: '10:00' }),
      'GAME_START_OUT_OF_RANGE',
      422,
    );
    expect(past.details).toEqual({ maxDays: 30 });
    const far = await expectAppError(
      t.games.createExtra(OWNER, t.group.id, { date: '2026-12-05', start: '11:00', end: '12:00' }),
      'GAME_START_OUT_OF_RANGE',
      422,
    );
    expect(far.details).toEqual({ maxDays: 30 });
    // 30 dias exatos depois de agora (quinta 05/11 10:00) ainda vale.
    const edge = await t.games.createExtra(OWNER, t.group.id, {
      date: '2026-12-05',
      start: '10:00',
      end: '11:00',
    });
    expect(edge.date).toBe('2026-12-05');
  });

  it('GRP-70: bater com o jogo calculado de um horário → GAME_OVERLAP com o id dele; o fim é exclusivo', async () => {
    const t = await setup();
    const err = await expectAppError(
      t.games.createExtra(OWNER, t.group.id, { date: '2026-11-06', start: '21:00', end: '23:00' }),
      'GAME_OVERLAP',
      409,
    );
    expect(err.details).toEqual({ gameId: t.gameId });
    const after = await t.games.createExtra(OWNER, t.group.id, {
      date: '2026-11-06',
      start: '22:00',
      end: '23:00',
    });
    const before = await t.games.createExtra(OWNER, t.group.id, {
      date: '2026-11-06',
      start: '17:00',
      end: '19:00',
    });
    expect([after.date, before.date]).toEqual(['2026-11-06', '2026-11-06']);
  });

  it('GRP-70: bater com outro jogo extra → GAME_OVERLAP; o cancelado também bloqueia', async () => {
    const t = await setup();
    const first = await t.games.createExtra(OWNER, t.group.id, EXTRA);
    const err = await expectAppError(
      t.games.createExtra(OWNER, t.group.id, { ...EXTRA, start: '10:00', end: '12:00' }),
      'GAME_OVERLAP',
      409,
    );
    expect(err.details).toEqual({ gameId: first.id });
    await t.games.cancel(OWNER, t.group.id, first.id);
    await expectAppError(
      t.games.createExtra(OWNER, t.group.id, { ...EXTRA, start: '10:00', end: '12:00' }),
      'GAME_OVERLAP',
      409,
    );
  });

  it('GRP-70: dois marcados ao mesmo tempo → a revisão velha pede nova leitura e só um passa', async () => {
    const t = await setup();
    const rival = { ...EXTRA, start: '10:00', end: '12:00' };
    t.store.hooks.beforeGameWrite.push((groupId) => {
      // Outro request grava o jogo rival e soma a revisão entre a leitura do service e a transação.
      t.store.seedGame({
        id: randomUUID(),
        groupId,
        date: SAT,
        startsAt: utc(t, SAT, '10:00'),
        endsAt: utc(t, SAT, '12:00'),
        createdAt: t.clock.now.toISOString(),
        version: 1,
      } as never);
      t.store.forceSchedule({
        ...(t.store.schedulesOf(groupId)[0] as never as Record<string, unknown>),
        id: randomUUID(),
        weekday: 3,
      } as never);
    });
    const err = await expectAppError(t.games.createExtra(OWNER, t.group.id, EXTRA), 'GAME_OVERLAP', 409);
    expect(err.details).toHaveProperty('gameId');
    expect(t.store.scheduleStale).toContain('createExtra');
    expect(rival.start).toBe('10:00');
  });

  it('GRP-70: a revisão mudou por outra coisa → relê, confere de novo e grava', async () => {
    const t = await setup();
    t.store.hooks.beforeGameWrite.push((groupId) => {
      t.store.forceSchedule({
        ...(t.store.schedulesOf(groupId)[0] as never as Record<string, unknown>),
        id: randomUUID(),
        weekday: 3,
        start: '08:00',
        end: '09:00',
      } as never);
    });
    const game = await t.games.createExtra(OWNER, t.group.id, EXTRA);
    expect(t.store.scheduleStale).toEqual(['createExtra']);
    expect(stored(t, game.id)).toBeDefined();
  });

  it('GRP-68, 49: quem não tem game.manage → GROUP_PERMISSION_DENIED; quem não participa → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A, B] });
    await expectDenied(t.games.createExtra(A, t.group.id, EXTRA), 'game.manage');
    await expectAppError(t.games.createExtra(OUTSIDER, t.group.id, EXTRA), 'GROUP_NOT_FOUND', 404);
  });

  it('GRP-68, 32: grupo arquivado → GROUP_ARCHIVED', async () => {
    const t = await setup();
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(t.games.createExtra(OWNER, t.group.id, EXTRA), 'GROUP_ARCHIVED', 409);
  });

  it('GRP-68: depois de marcado é um jogo como os outros → confirmar, cancelar e reabrir (GRP-10, 24, 44)', async () => {
    const t = await setup({ members: [A, B] });
    const game = await t.games.createExtra(OWNER, t.group.id, EXTRA);
    const joined = await t.games.confirm(A, t.group.id, game.id);
    expect(joined.me).toEqual({ list: 'confirmed', position: 1 });
    await t.games.cancel(OWNER, t.group.id, game.id);
    await expectAppError(t.games.confirm(B, t.group.id, game.id), 'GAME_CANCELLED', 409);
    await t.games.reopen(OWNER, t.group.id, game.id);
    const list = await t.games.upcoming(A, t.group.id);
    expect(ids(list.find((g) => g.id === game.id)?.confirmed ?? [])).toEqual([A]);
  });
});

describe('GRP-69: remarcar', () => {
  const MOVE = { date: SAT, start: '15:00', end: '17:00' };

  it('GRP-69: o mesmo jogo e a mesma lista; aparece "Remarcado" e o início novo', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    const moved = await t.games.reschedule(OWNER, t.group.id, t.gameId, {
      ...MOVE,
      version: versionOfGame(t, t.gameId),
    });
    expect(GameSchema.parse(moved)).toEqual(moved);
    expect(moved).toMatchObject({
      id: t.gameId,
      scheduleId: t.schedule.id,
      rescheduled: true,
      date: SAT,
      startsAt: utc(t, SAT, '15:00'),
      endsAt: utc(t, SAT, '17:00'),
    });
    expect(ids(moved.confirmed)).toEqual([A, B]);
    expect(stored(t, t.gameId)?.startsAt).toBe(utc(t, SAT, '15:00'));
    expect(versionOfGame(t, t.gameId)).toBeGreaterThan(0);
  });

  it('GRP-69: o jogo virtual vira item ao ser remarcado, com a versão 0 → 1', async () => {
    const t = await setup({ members: [A] });
    expect(stored(t, t.gameId)).toBeUndefined();
    const moved = await t.games.reschedule(OWNER, t.group.id, t.gameId, { ...MOVE, version: 0 });
    expect(moved.version).toBe(1);
    expect(stored(t, t.gameId)).toMatchObject({ startsAt: utc(t, SAT, '15:00'), version: 1 });
    const list = await t.games.upcoming(A, t.group.id);
    expect(list.find((g) => g.id === t.gameId)).toMatchObject({
      rescheduled: true,
      startsAt: utc(t, SAT, '15:00'),
    });
  });

  it('GRP-69: avisa game_rescheduled a todos da lista (dentro e fila), menos quem remarcou; o resto não recebe', async () => {
    const t = await setup({ slots: 1, members: [A, B, C] });
    await t.confirmInOrder(OWNER, A, B);
    t.sent.length = 0;
    await t.games.reschedule(OWNER, t.group.id, t.gameId, { ...MOVE, version: versionOfGame(t, t.gameId) });
    const got = ofType(t.sent, 'game_rescheduled');
    expect([...got].sort()).toEqual([A, B].sort());
    expect(t.sent.every((n) => n.link === `/groups/${t.group.id}`)).toBe(true);
    const first = t.sent[0];
    expect(first?.title).toContain(t.group.name);
    expect(first?.body).toContain('07/11');
    expect(first?.body).toContain('15:00');
  });

  it('GRP-69: para o mesmo dia, hora e lugar não muda nada e não avisa', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    t.sent.length = 0;
    const version = versionOfGame(t, t.gameId);
    const same = await t.games.reschedule(OWNER, t.group.id, t.gameId, {
      date: '2026-11-06',
      start: '19:00',
      end: '22:00',
      version,
    });
    expect(same.rescheduled).not.toBe(true);
    expect(versionOfGame(t, t.gameId)).toBe(version);
    expect(t.sent).toEqual([]);
  });

  it('GRP-69: o lugar muda se vier, e fica o que era se não vier', async () => {
    const t = await setup({ members: [A] });
    const placeId = await addPlace(t);
    const extra = await t.games.createExtra(OWNER, t.group.id, { ...EXTRA, placeId });
    const moved = await t.games.reschedule(OWNER, t.group.id, extra.id, { ...MOVE, version: extra.version });
    expect(moved.place?.id).toBe(placeId);
    await t.places.create(OWNER, t.group.id, { ...PLACE, name: 'Outra quadra' });
    const otherId = t.store.placesOf(t.group.id)[1]?.id ?? '';
    const again = await t.games.reschedule(OWNER, t.group.id, extra.id, {
      date: '2026-11-08',
      start: '15:00',
      end: '17:00',
      placeId: otherId,
      version: moved.version,
    });
    expect(again.place?.id).toBe(otherId);
    await expectAppError(
      t.games.reschedule(OWNER, t.group.id, extra.id, {
        ...MOVE,
        placeId: randomUUID(),
        version: again.version,
      }),
      'PLACE_NOT_FOUND',
      404,
    );
  });

  it('GRP-69: em andamento → GAME_CLOSED; cancelado → GAME_CANCELLED', async () => {
    const started = await setup({ now: FRIDAY_20H });
    await expectAppError(
      started.games.reschedule(OWNER, started.group.id, started.gameId, { ...MOVE, version: 0 }),
      'GAME_CLOSED',
      409,
    );
    const t = await setup({ members: [A] });
    await t.games.cancel(OWNER, t.group.id, t.gameId);
    await expectAppError(
      t.games.reschedule(OWNER, t.group.id, t.gameId, { ...MOVE, version: versionOfGame(t, t.gameId) }),
      'GAME_CANCELLED',
      409,
    );
  });

  it('GRP-69: jogo que não é um dos próximos → GAME_NOT_FOUND', async () => {
    const t = await setup();
    await expectAppError(
      t.games.reschedule(OWNER, t.group.id, 'not-a-game', { ...MOVE, version: 0 }),
      'GAME_NOT_FOUND',
      404,
    );
    await expectAppError(
      t.games.reschedule(OWNER, t.group.id, gameIdOf(randomUUID(), '2026-11-06'), { ...MOVE, version: 0 }),
      'GAME_NOT_FOUND',
      404,
    );
  });

  it('GRP-69: bater com outro jogo do grupo → GAME_OVERLAP com o id dele', async () => {
    const t = await setup();
    const extra = await t.games.createExtra(OWNER, t.group.id, { ...EXTRA, start: '15:00', end: '17:00' });
    const err = await expectAppError(
      t.games.reschedule(OWNER, t.group.id, t.gameId, { ...MOVE, start: '16:00', end: '18:00', version: 0 }),
      'GAME_OVERLAP',
      409,
    );
    expect(err.details).toEqual({ gameId: extra.id });
    expect(stored(t, t.gameId)).toBeUndefined();
  });

  it('GRP-69, 70: o horário original do jogo remarcado fica livre; o jogo não bate consigo mesmo', async () => {
    const t = await setup();
    await t.games.reschedule(OWNER, t.group.id, t.gameId, { ...MOVE, version: 0 });
    const freed = await t.games.createExtra(OWNER, t.group.id, {
      date: '2026-11-06',
      start: '19:00',
      end: '21:00',
    });
    expect(freed.date).toBe('2026-11-06');
    const overlapSelf = await t.games.reschedule(OWNER, t.group.id, t.gameId, {
      ...MOVE,
      start: '16:00',
      end: '18:00',
      version: 1,
    });
    expect(overlapSelf.startsAt).toBe(utc(t, SAT, '16:00'));
  });

  it('GRP-69: não passa do jogo seguinte do mesmo horário → GAME_OVERLAP com ele; terminar quando ele começa vale', async () => {
    const t = await setup();
    const next = gameIdOf(t.schedule.id, '2026-11-13');
    const err = await expectAppError(
      t.games.reschedule(OWNER, t.group.id, t.gameId, {
        date: '2026-11-13',
        start: '18:00',
        end: '20:00',
        version: 0,
      }),
      'GAME_OVERLAP',
      409,
    );
    expect(err.details).toEqual({ gameId: next });
    const ok = await t.games.reschedule(OWNER, t.group.id, t.gameId, {
      date: '2026-11-13',
      start: '17:00',
      end: '19:00',
      version: 0,
    });
    expect(ok.date).toBe('2026-11-13');
  });

  it('GRP-69: início fora de agora até 30 dias → GAME_START_OUT_OF_RANGE; duração fora de 30 min a 6 h no contrato', async () => {
    const t = await setup();
    const err = await expectAppError(
      t.games.reschedule(OWNER, t.group.id, t.gameId, {
        date: '2026-12-20',
        start: '10:00',
        end: '11:00',
        version: 0,
      }),
      'GAME_START_OUT_OF_RANGE',
      422,
    );
    expect(err.details).toEqual({ maxDays: 30 });
    const parse = (start: string, end: string) =>
      RescheduleGameInputSchema.safeParse({ date: SAT, start, end, version: 0 }).success;
    expect(parse('09:00', '09:30')).toBe(true);
    expect(parse('09:00', '09:29')).toBe(false);
    expect(parse('09:00', '15:01')).toBe(false);
    expect(RescheduleGameInputSchema.safeParse({ date: SAT, start: '09:00', end: '10:00' }).success).toBe(
      false,
    );
  });

  it('GRP-59, 69: versão velha → VERSION_CONFLICT com a versão atual; a corrida na gravação também', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    const stale = await expectAppError(
      t.games.reschedule(OWNER, t.group.id, t.gameId, { ...MOVE, version: 7 }),
      'VERSION_CONFLICT',
      409,
    );
    expect(stale.details).toEqual({ currentVersion: versionOfGame(t, t.gameId) });
    const before = versionOfGame(t, t.gameId);
    t.store.hooks.beforeGameWrite.push(() => {
      const current = stored(t, t.gameId);
      if (current) t.store.seedGame({ ...current, version: (current.version ?? 0) + 1 });
    });
    await expectAppError(
      t.games.reschedule(OWNER, t.group.id, t.gameId, { ...MOVE, version: before }),
      'VERSION_CONFLICT',
      409,
    );
    expect(stored(t, t.gameId)?.startsAt).toBe(utc(t, '2026-11-06', '19:00'));
  });

  it('GRP-70: a revisão da agenda mudou entre a leitura e a gravação → relê e grava', async () => {
    const t = await setup();
    t.store.hooks.beforeGameWrite.push((groupId) => {
      t.store.forceSchedule({
        ...(t.store.schedulesOf(groupId)[0] as never as Record<string, unknown>),
        id: randomUUID(),
        weekday: 3,
        start: '08:00',
        end: '09:00',
      } as never);
    });
    const moved = await t.games.reschedule(OWNER, t.group.id, t.gameId, { ...MOVE, version: 0 });
    expect(moved.rescheduled).toBe(true);
    expect(t.store.scheduleStale).toEqual(['reschedule']);
  });

  it('GRP-69, 49: sem game.manage → GROUP_PERMISSION_DENIED; quem não participa → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await expectDenied(t.games.reschedule(A, t.group.id, t.gameId, { ...MOVE, version: 0 }), 'game.manage');
    await expectAppError(
      t.games.reschedule(OUTSIDER, t.group.id, t.gameId, { ...MOVE, version: 0 }),
      'GROUP_NOT_FOUND',
      404,
    );
  });

  it('GRP-69, 32: grupo arquivado → GROUP_ARCHIVED', async () => {
    const t = await setup();
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(
      t.games.reschedule(OWNER, t.group.id, t.gameId, { ...MOVE, version: 0 }),
      'GROUP_ARCHIVED',
      409,
    );
  });

  it('GRP-11: o jogo remarcado fica entre os próximos até acabar, e o horário não muda', async () => {
    const t = await setup({ members: [A] });
    await t.games.reschedule(OWNER, t.group.id, t.gameId, { ...MOVE, version: 0 });
    const list = await t.games.upcoming(A, t.group.id);
    const starts = list.map((g) => g.startsAt);
    expect(starts).toEqual([...starts].sort());
    expect(list.map((g) => g.id)).toContain(t.gameId);
    expect(t.store.schedulesOf(t.group.id)[0]).toMatchObject({ weekday: 5, start: '19:00', end: '22:00' });
  });
});

describe('GRP-70: os horários conferem os jogos extras e remarcados', () => {
  const sat = (start: string, end: string) => ({ weekday: 6, start, end });

  it('GRP-70: criar um horário que bate com um jogo extra → GAME_OVERLAP com o jogo; sem bater, cria', async () => {
    const t = await setup();
    const extra = await t.games.createExtra(OWNER, t.group.id, EXTRA);
    const err = await expectAppError(
      t.schedules.create(OWNER, t.group.id, sat('10:00', '12:00')),
      'GAME_OVERLAP',
      409,
    );
    expect(err.details).toEqual({ gameId: extra.id });
    await t.schedules.create(OWNER, t.group.id, sat('11:00', '12:00'));
    expect(t.store.schedulesOf(t.group.id)).toHaveLength(2);
  });

  it('GRP-70: o jogo remarcado e o extra cancelado também bloqueiam o horário', async () => {
    const t = await setup();
    await t.games.reschedule(OWNER, t.group.id, t.gameId, {
      date: SAT,
      start: '15:00',
      end: '17:00',
      version: 0,
    });
    await expectAppError(t.schedules.create(OWNER, t.group.id, sat('16:00', '18:00')), 'GAME_OVERLAP', 409);
    const extra = await t.games.createExtra(OWNER, t.group.id, EXTRA);
    await t.games.cancel(OWNER, t.group.id, extra.id);
    await expectAppError(t.schedules.create(OWNER, t.group.id, sat('10:00', '12:00')), 'GAME_OVERLAP', 409);
  });

  it('GRP-70: editar e desarquivar um horário também conferem os jogos', async () => {
    const t = await setup();
    const created = await t.schedules.create(OWNER, t.group.id, sat('14:00', '16:00'));
    await t.games.createExtra(OWNER, t.group.id, EXTRA);
    const versionNow = t.store.schedulesOf(t.group.id).find((s) => s.id === created.id)?.version ?? 0;
    await expectAppError(
      t.schedules.update(OWNER, t.group.id, created.id, { ...sat('10:00', '12:00'), version: versionNow }),
      'GAME_OVERLAP',
      409,
    );
    const archived = await t.schedules.archive(OWNER, t.group.id, created.id, { version: versionNow });
    await t.schedules.update(OWNER, t.group.id, t.schedule.id, {
      weekday: 5,
      start: '19:00',
      end: '22:00',
      version: t.store.schedulesOf(t.group.id).find((s) => s.id === t.schedule.id)?.version ?? 0,
    });
    // Marca o extra de sábado 14/11 no horário do arquivado; desarquivar bate com ele.
    await t.games.createExtra(OWNER, t.group.id, { date: '2026-11-14', start: '14:30', end: '15:30' });
    await expectAppError(
      t.schedules.unarchive(OWNER, t.group.id, created.id, { version: archived.version }),
      'GAME_OVERLAP',
      409,
    );
  });

  it('GRP-70: os jogos do próprio horário que já são item não contam ao editá-lo', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    const updated = await t.schedules.update(OWNER, t.group.id, t.schedule.id, {
      weekday: 5,
      start: '18:00',
      end: '22:00',
      version: t.store.schedulesOf(t.group.id)[0]?.version ?? 0,
    });
    expect(updated.start).toBe('18:00');
  });

  it('GRP-65, 70: dois horários que se sobrepõem continuam sendo SCHEDULE_OVERLAP', async () => {
    const t = await setup();
    await expectAppError(
      t.schedules.create(OWNER, t.group.id, { weekday: 5, start: '21:00', end: '23:00' }),
      'SCHEDULE_OVERLAP',
      409,
    );
  });
});

describe('GRP-71: o nome do grupo', () => {
  const versionOfGroup = (t: T) => t.store.storedGroup(t.group.id)?.version ?? 0;

  it('GRP-71: troca o nome (aparado) com a versão da identidade, e ela soma 1', async () => {
    const t = await setup();
    const before = versionOfGroup(t);
    const renamed = await t.groups.rename(OWNER, t.group.id, {
      version: before,
      name: '  Vôlei de quinta  ',
    });
    expect(GroupSchema.parse(renamed)).toEqual(renamed);
    expect(renamed.name).toBe('Vôlei de quinta');
    expect(versionOfGroup(t)).toBe(before + 1);
    expect((await t.groups.get(OWNER, t.group.id)).name).toBe('Vôlei de quinta');
  });

  it('GRP-71, 59: versão velha → VERSION_CONFLICT com a atual; o nome não muda', async () => {
    const t = await setup();
    const before = versionOfGroup(t);
    await t.groups.rename(OWNER, t.group.id, { version: before, name: 'Novo' });
    const err = await expectAppError(
      t.groups.rename(OWNER, t.group.id, { version: before, name: 'Outro' }),
      'VERSION_CONFLICT',
      409,
    );
    expect(err.details).toEqual({ currentVersion: before + 1 });
    expect(t.store.storedGroup(t.group.id)?.name).toBe('Novo');
  });

  it('GRP-71, 59: o nome tem a versão da identidade, e não a dos Ajustes', async () => {
    const t = await setup();
    await t.groups.rename(OWNER, t.group.id, { version: versionOfGroup(t), name: 'Novo' });
    const updated = await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), slots: 14 });
    expect(updated.slots).toBe(14);
    expect(updated.name).toBe('Novo');
  });

  it('GRP-71 (contrato): de 1 a 80 caracteres, sem espaços nas pontas, com a version', () => {
    const parse = (name: string) => UpdateGroupNameInputSchema.safeParse({ version: 1, name });
    expect(parse('A').success).toBe(true);
    expect(parse('x'.repeat(80)).success).toBe(true);
    expect(parse('x'.repeat(81)).success).toBe(false);
    expect(parse('   ').success).toBe(false);
    expect(parse('').success).toBe(false);
    expect(parse('  Oi  ').data?.name).toBe('Oi');
    expect(UpdateGroupNameInputSchema.safeParse({ name: 'Oi' }).success).toBe(false);
  });

  it('GRP-71, 49: sem settings.edit → GROUP_PERMISSION_DENIED; quem não participa → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await expectDenied(t.groups.rename(A, t.group.id, { version: 1, name: 'X' }), 'settings.edit');
    await expectAppError(
      t.groups.rename(OUTSIDER, t.group.id, { version: 1, name: 'X' }),
      'GROUP_NOT_FOUND',
      404,
    );
  });

  it('GRP-71, 32: grupo arquivado → GROUP_ARCHIVED', async () => {
    const t = await setup();
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(
      t.groups.rename(OWNER, t.group.id, { version: versionOfGroup(t), name: 'X' }),
      'GROUP_ARCHIVED',
      409,
    );
  });
});

describe('GRP-49: permissões novas no catálogo', () => {
  it('GRP-49: dono e Admin têm game.manage e settings.edit; o membro não tem nenhuma', () => {
    for (const role of ['owner', 'admin'] as const) {
      expect(ROLES[role].permissions).toContain('game.manage');
      expect(ROLES[role].permissions).toContain('settings.edit');
    }
    expect(ROLES.member.permissions).toEqual([]);
  });
});

describe('NTF-02: game_rescheduled', () => {
  it('NTF-02: o tipo existe no contrato de notificações', async () => {
    const { NotificationTypeSchema } = await import('@scorely/contracts');
    expect(NotificationTypeSchema.safeParse('game_rescheduled').success).toBe(true);
  });
});
