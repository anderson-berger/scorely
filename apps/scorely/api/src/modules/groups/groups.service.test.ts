import { randomUUID } from 'node:crypto';
import { AppError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import { gameIdOf } from '@scorely/api/src/lib/zoned';
import {
  A,
  B,
  BASE_INPUT,
  C,
  D,
  DATE,
  DAY,
  expectAppError,
  expectDenied,
  FRIDAY_13H,
  FRIDAY_20H,
  FRIDAY_22H01,
  G,
  type GroupPatch,
  guestTokenOf,
  INPUT,
  ids,
  iso,
  KINDS,
  LISBON_OWNER,
  MINUTE,
  N,
  NEXT_DATE,
  OUTSIDER,
  OWNER,
  ofType,
  pub,
  R,
  reserveTokenOf,
  type SetupOpts,
  type Stored,
  setup,
  setupServices,
  sys,
  THURSDAY_10H,
  THURSDAY_19H,
  TOKEN_FIELD,
  tokenOf,
  USERS,
  WEDNESDAY_19H,
} from '@scorely/api/src/modules/groups/groups.memory';
import type { StoredPlace } from '@scorely/api/src/modules/groups/place.repository';
import { SCHEDULE_LIMIT_BY_PLAN } from '@scorely/api/src/modules/groups/plans';
import {
  CreateGroupInputSchema,
  type Game,
  GameSchema,
  type Group,
  GroupLayersSchema,
  GroupSchema,
  GuestGameSchema,
  InviteSchema,
  MemberInviteSchema,
  type MemberTier,
  MyGroupSchema,
  type Permission,
  type PlaceInput,
  PlaceInputSchema,
  PlaceSchema,
  type PublicUserId,
  PublicUserIdSchema,
  type RoleId,
  type ScheduleInput,
  ScheduleInputSchema,
  ScheduleSchema,
  UpdateGameInputSchema,
  UpdateGroupInputSchema,
  UpdateScheduleInputSchema,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

describe('grupos: criar (caso 1)', () => {
  it('caso 1: cria grupo válido → dono, com inviteToken e createdAt do relógio', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, INPUT);
    expect(GroupSchema.parse(group)).toEqual(group);
    const { weekday, start, end, ...rest } = INPUT;
    expect(group).toMatchObject({ ...rest, myTier: 'member', myRoleId: 'owner' });
    expect(group.schedules).toMatchObject([{ weekday, start, end }]);
    expect(tokenOf(group).length).toBeGreaterThan(0);
    expect(group.createdAt).toBe(THURSDAY_10H.toISOString());
  });

  it('caso 1: o dono é membro e o grupo aparece em "meus grupos"', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, INPUT);
    const members = await s.groups.members(OWNER, group.id);
    expect(members).toEqual([{ userId: pub(OWNER), nickname: 'Dono', roleId: 'owner', tier: 'member' }]);
    const mine = await s.groups.myGroups(OWNER);
    expect(mine.map((g) => g.id)).toEqual([group.id]);
    expect(MyGroupSchema.parse(mine[0])).toBeTruthy();
  });

  it('caso 1: a lista do jogo atual está vazia (o dono não entra sozinho)', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, INPUT);
    const game = await s.current(OWNER, group.id);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game.confirmed).toEqual([]);
    expect(game.waitlist).toEqual([]);
    expect(game.me).toBeUndefined();
    const [mine] = await s.groups.myGroups(OWNER);
    expect(mine?.game.confirmedCount).toBe(0);
  });

  it('GRP-13: sem timeZone → o fuso das preferências do dono', async () => {
    const s = setupServices();
    const group = await s.groups.create(LISBON_OWNER, BASE_INPUT);
    expect(group.timeZone).toBe('Europe/Lisbon');
  });

  it('GRP-13: sem timeZone e dono sem fuso nas preferências → America/Sao_Paulo', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, BASE_INPUT);
    expect(group.timeZone).toBe('America/Sao_Paulo');
  });

  it('GRP-13: timeZone informado vence o das preferências', async () => {
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

  it('GRP-04: membro sem cargo tenta gerar → GROUP_PERMISSION_DENIED (members.manage); não-membro → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await expectDenied(t.groups.rotateInvite(A, t.group.id, 'member'), 'members.manage');
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
      { userId: pub(OWNER), nickname: 'Dono', roleId: 'owner', tier: 'member' },
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
    const game = await t.current(A, t.group.id);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game).toMatchObject({ groupId: t.group.id, date: DATE, status: 'open', slots: 12 });
    expect(iso(game.startsAt)).toBe('2026-11-06T22:00:00.000Z');
    expect(iso(game.opensAt)).toBe('2026-11-04T22:00:00.000Z');
    expect(t.store.gameCount()).toBe(0);
  });

  it('caso 4: antecedência 24h → scheduled e confirmar dá GAME_LIST_NOT_OPEN com { opensAt }', async () => {
    const t = await setup({ listOpensHoursBefore: 24, members: [A] });
    const game = await t.current(A, t.group.id);
    expect(game.status).toBe('scheduled');
    expect(iso(game.opensAt)).toBe('2026-11-05T22:00:00.000Z');
    const err = await expectAppError(t.games.confirm(A, t.group.id, t.gameId), 'GAME_LIST_NOT_OPEN', 409);
    expect(iso((err.details as { opensAt: string }).opensAt)).toBe('2026-11-05T22:00:00.000Z');
    expect((await t.current(A, t.group.id)).confirmed).toEqual([]);
  });

  it('caso 4: antecedência 24h → desistir também dá GAME_LIST_NOT_OPEN', async () => {
    const t = await setup({ listOpensHoursBefore: 24, members: [A] });
    await expectAppError(t.games.leave(A, t.group.id, t.gameId), 'GAME_LIST_NOT_OPEN', 409);
  });

  it('caso 4: sexta 20h → in_progress, lista visível', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    t.clock.now = FRIDAY_20H;
    const game = await t.current(A, t.group.id);
    expect(game.status).toBe('in_progress');
    expect(game.date).toBe(DATE);
    expect(ids(game.confirmed)).toEqual([A, B]);
  });

  it('caso 4: sexta 20h → confirmar, desistir e cancelar dão GAME_CLOSED', async () => {
    const t = await setup({ members: [A, B, C] });
    await t.confirmInOrder(A, B);
    t.clock.now = FRIDAY_20H;
    await expectAppError(t.games.confirm(C, t.group.id, t.gameId), 'GAME_CLOSED', 409);
    await expectAppError(t.games.leave(A, t.group.id, t.gameId), 'GAME_CLOSED', 409);
    await expectAppError(t.games.cancel(OWNER, t.group.id, t.gameId), 'GAME_CLOSED', 409);
    const game = await t.current(A, t.group.id);
    expect(game.status).toBe('in_progress');
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(t.sent).toEqual([]);
  });

  it('caso 4: sexta 22h01 → o atual é o da sexta seguinte, com a lista vazia', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    t.clock.now = FRIDAY_22H01;
    const game = await t.current(A, t.group.id);
    expect(game.date).toBe(NEXT_DATE);
    expect(game.status).toBe('scheduled');
    expect(iso(game.startsAt)).toBe('2026-11-13T22:00:00.000Z');
    expect(game.confirmed).toEqual([]);
    expect(game.me).toBeUndefined();
  });

  it('caso 4: data diferente do jogo atual (ou inválida) → GAME_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(t.games.confirm(A, t.group.id, t.gameAt(NEXT_DATE)), 'GAME_NOT_FOUND', 404);
    await expectAppError(t.games.confirm(A, t.group.id, 'not-a-date'), 'GAME_NOT_FOUND', 404);
    await expectAppError(t.games.leave(A, t.group.id, t.gameAt('2026-10-30')), 'GAME_NOT_FOUND', 404);
    await expectAppError(t.games.cancel(OWNER, t.group.id, t.gameAt(NEXT_DATE)), 'GAME_NOT_FOUND', 404);
  });
});

describe('jogo atual: corrida na criação do jogo (tarefa 6a, D2)', () => {
  it('6a: confirmar no jogo virtual e perder a corrida → relê consistente e usa o jogo vencedor', async () => {
    const t = await setup({ members: [A] });
    const winner = t.gameRecord(DATE);
    expect(await t.store.games.create(winner)).toBe(true);
    t.store.race.stale = true;

    const game = await t.games.confirm(A, t.group.id, t.gameId);

    expect(t.store.gameCount()).toBe(1);
    expect(t.store.getReads).toContainEqual({ consistent: true });
    expect((await t.store.games.listPlayers(winner.id)).map((a) => a.userId)).toEqual([A]);
    expect(ids(game.confirmed)).toEqual([A]);
  });

  it('6a: cancelar no jogo virtual e perder a corrida → cancela o jogo vencedor', async () => {
    const t = await setup();
    const winner = t.gameRecord(DATE);
    expect(await t.store.games.create(winner)).toBe(true);
    t.store.race.stale = true;

    const game = await t.games.cancel(OWNER, t.group.id, t.gameId);

    expect(game.status).toBe('cancelled');
    expect(t.store.gameCount()).toBe(1);
    expect(t.store.getReads).toContainEqual({ consistent: true });
    expect((await t.store.games.get(t.gameId, { consistent: true }))?.cancelledAt).toBeDefined();
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
    const game = await t.games.confirm(A, t.group.id, t.gameId);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(ids(game.confirmed)).toEqual([A]);
    expect(iso(game.confirmed[0]?.confirmedAt ?? '')).toBe(THURSDAY_10H.toISOString());
    expect(game.me).toEqual({ list: 'confirmed', position: 1 });
  });

  it('caso 5: confirma de novo → mesma posição e mesmo confirmedAt', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    const again = await t.games.confirm(A, t.group.id, t.gameId);
    expect(ids(again.confirmed)).toEqual([A, B]);
    expect(iso(again.confirmed[0]?.confirmedAt ?? '')).toBe(THURSDAY_10H.toISOString());
    expect(again.me).toEqual({ list: 'confirmed', position: 1 });
  });

  it('caso 5: desiste → sai da lista; desistir sem presença é ok', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    await t.games.leave(A, t.group.id, t.gameId);
    const game = await t.current(A, t.group.id);
    expect(ids(game.confirmed)).toEqual([B]);
    expect(game.me).toBeUndefined();
    await expect(t.games.leave(A, t.group.id, t.gameId)).resolves.toBeUndefined();
    await expect(t.games.leave(OWNER, t.group.id, t.gameId)).resolves.toBeUndefined();
  });

  it('caso 5: reconfirmar depois de desistir vai para o fim (D5)', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    await t.games.leave(A, t.group.id, t.gameId);
    t.tick();
    const game = await t.games.confirm(A, t.group.id, t.gameId);
    expect(ids(game.confirmed)).toEqual([B, A]);
    expect(game.me).toEqual({ list: 'confirmed', position: 2 });
  });

  it('caso 5: não-membro → GROUP_NOT_FOUND em confirmar, desistir e ver o jogo', async () => {
    const t = await setup();
    await expectAppError(t.games.confirm(OUTSIDER, t.group.id, t.gameId), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.games.leave(OUTSIDER, t.group.id, t.gameId), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.current(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.current(A, randomUUID()), 'GROUP_NOT_FOUND', 404);
    expect(t.store.gameCount()).toBe(0);
  });

  it('caso 5: não-membro com data errada → GROUP_NOT_FOUND vem antes de GAME_NOT_FOUND', async () => {
    const t = await setup();
    await expectAppError(t.games.confirm(OUTSIDER, t.group.id, t.gameAt(NEXT_DATE)), 'GROUP_NOT_FOUND', 404);
  });

  it('caso 5: o dono só entra na lista se confirmar', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A, OWNER);
    const game = await t.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, OWNER]);
    expect(game.me).toEqual({ list: 'confirmed', position: 2 });
  });
});

describe('fila (caso 6)', () => {
  it('caso 6: vagas 2, três confirmam → 3º na fila', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    const game = await t.current(C, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ids(game.waitlist)).toEqual([C]);
    expect(game.me).toEqual({ list: 'waitlist', position: 1 });
    expect(t.sent).toEqual([]);
  });

  it('caso 6: 1º desiste → 3º fica dentro e recebe waitlist_promoted', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.games.leave(A, t.group.id, t.gameId);
    const game = await t.current(C, t.group.id);
    expect(ids(game.confirmed)).toEqual([B, C]);
    expect(game.waitlist).toEqual([]);
    expect(game.me).toEqual({ list: 'confirmed', position: 2 });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ userId: C, type: 'waitlist_promoted', link: `/groups/${t.group.id}` });
  });

  it('caso 6: quem estava na fila desiste → ninguém é notificado', async () => {
    const t = await setup({ slots: 2, members: [A, B, C, D] });
    await t.confirmInOrder(A, B, C, D);
    await t.games.leave(C, t.group.id, t.gameId);
    const game = await t.current(D, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ids(game.waitlist)).toEqual([D]);
    expect(game.me).toEqual({ list: 'waitlist', position: 1 });
    expect(t.sent).toEqual([]);
  });

  it('caso 6: desistência de quem está dentro sem ninguém na fila → ninguém é notificado', async () => {
    const t = await setup({ slots: 2, members: [A, B] });
    await t.confirmInOrder(A, B);
    await t.games.leave(A, t.group.id, t.gameId);
    expect(t.sent).toEqual([]);
  });
});

describe('cancelamento (caso 7)', () => {
  it('caso 7: dono cancela → cancelled; confirmados e fila recebem game_cancelled, o dono não', async () => {
    const t = await setup({ slots: 2, members: [A, B] });
    await t.confirmInOrder(OWNER, A, B);
    const game = await t.games.cancel(OWNER, t.group.id, t.gameId);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game.status).toBe('cancelled');
    expect(ofType(t.sent, 'game_cancelled').sort()).toEqual([A, B].sort());
    expect(t.sent.every((n) => n.link === `/groups/${t.group.id}`)).toBe(true);
    expect((await t.current(A, t.group.id)).status).toBe('cancelled');
  });

  it('caso 7: confirmar ou desistir depois → GAME_CANCELLED', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A);
    await t.games.cancel(OWNER, t.group.id, t.gameId);
    await expectAppError(t.games.confirm(B, t.group.id, t.gameId), 'GAME_CANCELLED', 409);
    await expectAppError(t.games.leave(A, t.group.id, t.gameId), 'GAME_CANCELLED', 409);
  });

  it('caso 7: cancelado continua cancelled durante a janela do jogo (GAME_CANCELLED antes de GAME_CLOSED)', async () => {
    const t = await setup({ members: [A] });
    await t.games.cancel(OWNER, t.group.id, t.gameId);
    t.clock.now = FRIDAY_20H;
    expect((await t.current(A, t.group.id)).status).toBe('cancelled');
    await expectAppError(t.games.confirm(A, t.group.id, t.gameId), 'GAME_CANCELLED', 409);
  });

  it('caso 7: cancelar de novo devolve igual e não notifica outra vez', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    const first = await t.games.cancel(OWNER, t.group.id, t.gameId);
    t.tick();
    const second = await t.games.cancel(OWNER, t.group.id, t.gameId);
    expect(second).toEqual(first);
    expect(ofType(t.sent, 'game_cancelled')).toEqual([A]);
  });

  it('caso 7: cancelar o jogo virtual (sem ninguém) funciona e não notifica', async () => {
    const t = await setup({ members: [A] });
    const game = await t.games.cancel(OWNER, t.group.id, t.gameId);
    expect(game.status).toBe('cancelled');
    expect(t.sent).toEqual([]);
    expect((await t.current(A, t.group.id)).status).toBe('cancelled');
  });

  it('GRP-24: membro sem cargo cancela → GROUP_PERMISSION_DENIED (game.manage); não-membro → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    await expectDenied(t.games.cancel(A, t.group.id, t.gameId), 'game.manage');
    await expectAppError(t.games.cancel(OUTSIDER, t.group.id, t.gameId), 'GROUP_NOT_FOUND', 404);
    expect((await t.current(A, t.group.id)).status).toBe('open');
    expect(t.sent).toEqual([]);
  });
});

describe('listas e meus grupos (caso 8)', () => {
  it('caso 8: membro vê confirmed e waitlist com nomes', async () => {
    const t = await setup({ slots: 2, members: [A, C, D] });
    await t.confirmInOrder(A, C, D);
    const game = await t.current(A, t.group.id);
    expect(game.confirmed.map((x) => [sys(x.userId), x.nickname])).toEqual([
      [A, 'Ana'],
      [C, 'Caio'],
    ]);
    expect(game.waitlist.map((x) => [sys(x.userId), x.nickname])).toEqual([[D, 'Duda']]);
    expect(iso(game.waitlist[0]?.confirmedAt ?? '')).toBe(
      new Date(THURSDAY_10H.getTime() + 2 * MINUTE).toISOString(),
    );
  });

  it('USR-04: lista de membros com o dono primeiro, cada um pelo apelido', async () => {
    const t = await setup({ members: [B, A] });
    const members = await t.groups.members(A, t.group.id);
    expect(members[0]).toEqual({ userId: pub(OWNER), nickname: 'Dono', roleId: 'owner', tier: 'member' });
    expect(members.slice(1).sort((x, y) => x.userId.localeCompare(y.userId))).toEqual([
      { userId: pub(A), nickname: 'Ana', roleId: 'member', tier: 'member' },
      { userId: pub(B), nickname: 'Bia', roleId: 'member', tier: 'member' },
    ]);
  });

  it('USR-02: quem nunca trocou o apelido aparece na lista pelo código de amigo, nunca "Sem nome"', async () => {
    const t = await setup({ members: [N] });
    const members = await t.groups.members(OWNER, t.group.id);
    expect(members.find((m) => m.userId === pub(N))).toEqual({
      userId: pub(N),
      nickname: pub(N),
      tier: 'member',
      roleId: 'member',
    });
  });

  it('USR-13: as visões de pessoa do grupo (membros, lista do jogo) não trazem `name` nem email', async () => {
    const t = await setup({ slots: 2, members: [A, C, D] });
    await t.confirmInOrder(A, C, D);
    const members = await t.groups.members(A, t.group.id);
    const game = await t.current(A, t.group.id);
    for (const person of [...members, ...game.confirmed, ...game.waitlist]) {
      expect(person).not.toHaveProperty('name');
      expect(person).not.toHaveProperty('email');
      expect(typeof person.nickname).toBe('string');
    }
  });

  it('caso 8: "meus grupos" traz o jogo atual de cada grupo (confirmedCount = min(lista, vagas) e me)', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    const other = await t.groups.create(OWNER, {
      ...INPUT,
      name: 'Futebol de terça',
      sportId: 'soccer',
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
    await expect(t.groups.removeMember(OWNER, t.group.id, pub(A))).resolves.toBeUndefined();
    await expectAppError(t.groups.get(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.current(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(await t.groups.myGroups(A)).toEqual([]);
    expect(ids(await t.groups.members(OWNER, t.group.id))).not.toContain(A);
  });

  it('caso 10: C sobe e recebe waitlist_promoted; A não é notificado', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.groups.removeMember(OWNER, t.group.id, pub(A));
    const game = await t.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([B, C]);
    expect(game.waitlist).toEqual([]);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ userId: C, type: 'waitlist_promoted', link: `/groups/${t.group.id}` });
  });

  it('caso 10: remover quem estava na fila → sai da lista e ninguém é notificado', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.groups.removeMember(OWNER, t.group.id, pub(C));
    const game = await t.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(game.waitlist).toEqual([]);
    expect(t.sent).toEqual([]);
  });

  it('caso 10: remover membro sem presença (jogo virtual) funciona', async () => {
    const t = await setup({ members: [A] });
    await t.groups.removeMember(OWNER, t.group.id, pub(A));
    await expectAppError(t.groups.get(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(t.sent).toEqual([]);
  });

  it('caso 11: dono tenta se remover → GROUP_OWNER_NOT_REMOVABLE', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(
      t.groups.removeMember(OWNER, t.group.id, pub(OWNER)),
      'GROUP_OWNER_NOT_REMOVABLE',
      409,
    );
    expect(ids(await t.groups.members(OWNER, t.group.id))).toContain(OWNER);
  });

  it('GRP-25: membro sem cargo tenta remover outro → GROUP_PERMISSION_DENIED (members.manage)', async () => {
    const t = await setup({ members: [A, B] });
    await expectDenied(t.groups.removeMember(A, t.group.id, pub(B)), 'members.manage');
    expect(ids(await t.groups.members(OWNER, t.group.id))).toContain(B);
  });

  it('caso 11: remover quem não é membro → GROUP_MEMBER_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(
      t.groups.removeMember(OWNER, t.group.id, pub(OUTSIDER)),
      'GROUP_MEMBER_NOT_FOUND',
      404,
    );
    expect((await t.groups.get(OWNER, t.group.id)).inviteToken).toBe(tokenOf(t.group));
  });

  it('GRP-04: ordem dos erros → não-membro dá GROUP_NOT_FOUND; membro sem cargo removendo qualquer um dá GROUP_PERMISSION_DENIED', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(t.groups.removeMember(OUTSIDER, t.group.id, pub(A)), 'GROUP_NOT_FOUND', 404);
    await expectDenied(t.groups.removeMember(A, t.group.id, pub(OWNER)), 'members.manage');
    await expectDenied(t.groups.removeMember(A, t.group.id, pub(OUTSIDER)), 'members.manage');
  });

  it('caso 12: depois de uma remoção, o token antigo dá GROUP_INVITE_INVALID e o grupo tem um token novo', async () => {
    const t = await setup({ members: [A] });
    const old = tokenOf(t.group);
    await t.groups.removeMember(OWNER, t.group.id, pub(A));
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
    await t.groups.removeMember(OWNER, t.group.id, pub(A));
    await expectAppError(t.groups.get(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(await t.groups.myGroups(A)).toEqual([]);
    const game = await t.current(OWNER, t.group.id);
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
    await expectAppError(t.groups.removeMember(OWNER, t.group.id, pub(B)), 'GROUP_MEMBER_NOT_FOUND', 404);
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

    await expect(t.groups.removeMember(OWNER, t.group.id, pub(B))).resolves.toBeUndefined();

    expect(t.store.removeCalls).toHaveLength(2);
    expect(t.store.removeCalls[0]?.group.inviteToken).toBe(tokenOf(t.group));
    expect(t.store.removeCalls[1]?.group.inviteToken).toBe(rotated);
    expect(t.store.removeCalls[1]?.userId).toBe(B);
    expect(ids(await t.groups.members(OWNER, t.group.id))).not.toContain(B);
    const game = await t.current(OWNER, t.group.id);
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

    const err = await t.groups.removeMember(OWNER, t.group.id, pub(B)).then(
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
    expect(group.myTier).toBe('member');
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
  it('caso 3: aceitar o link de reserva → myTier reserve, em "meus grupos" e em members com tier reserve', async () => {
    const t = await setup();
    const joined = await t.groups.acceptInvite(R, reserveTokenOf(t.group));
    expect(GroupSchema.parse(joined)).toBeTruthy();
    expect(joined).toMatchObject({ id: t.group.id, myTier: 'reserve' });
    noTokens(joined);
    expect((await t.groups.get(R, t.group.id)).myTier).toBe('reserve');
    const mine = await t.groups.myGroups(R);
    expect(mine.map((g) => [g.id, g.myTier])).toEqual([[t.group.id, 'reserve']]);
    expect(await t.groups.members(OWNER, t.group.id)).toEqual([
      { userId: pub(OWNER), nickname: 'Dono', roleId: 'owner', tier: 'member' },
      { userId: pub(R), nickname: 'Rafa', roleId: 'member', tier: 'reserve' },
    ]);
  });

  it('caso 3: aceitar o link de reserva de novo → nada duplica', async () => {
    const t = await setup({ reserves: [R] });
    const again = await t.groups.acceptInvite(R, reserveTokenOf(t.group));
    expect(again.myTier).toBe('reserve');
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, R]);
    expect(await t.groups.myGroups(R)).toHaveLength(1);
  });

  it('caso 3: members traz os membros primeiro (dono no topo) e depois as reservas', async () => {
    const t = await setup();
    await t.groups.acceptInvite(R, reserveTokenOf(t.group));
    await t.groups.acceptInvite(A, tokenOf(t.group));
    await t.groups.acceptInvite(B, tokenOf(t.group));
    const list = await t.groups.members(R, t.group.id);
    expect(list.map((m) => m.tier)).toEqual(['member', 'member', 'member', 'reserve']);
    expect(list[0]?.userId).toBe(pub(OWNER));
    expect(list[3]?.userId).toBe(pub(R));
  });

  it('caso 4: reserva aceita o link de membro → vira membro (sai das reservas)', async () => {
    const t = await setup({ reserves: [R] });
    const joined = await t.groups.acceptInvite(R, tokenOf(t.group));
    expect(joined.myTier).toBe('member');
    expect(await t.store.groups.roleOf(t.group.id, R)).toBe('member');
    const list = await t.groups.members(OWNER, t.group.id);
    expect(list.filter((m) => m.userId === pub(R))).toEqual([
      { userId: pub(R), nickname: 'Rafa', roleId: 'member', tier: 'member' },
    ]);
    expect(list.some((m) => m.tier === 'reserve')).toBe(false);
  });

  it('caso 4: membro aceita o link de reserva → continua membro (o dono também)', async () => {
    const t = await setup({ members: [A] });
    expect((await t.groups.acceptInvite(A, reserveTokenOf(t.group))).myTier).toBe('member');
    expect((await t.groups.acceptInvite(OWNER, reserveTokenOf(t.group))).myTier).toBe('member');
    expect(await t.groups.members(OWNER, t.group.id)).toEqual([
      { userId: pub(OWNER), nickname: 'Dono', roleId: 'owner', tier: 'member' },
      { userId: pub(A), nickname: 'Ana', roleId: 'member', tier: 'member' },
    ]);
  });
});

describe('E2: presença por camada (casos 5–7)', () => {
  it('caso 5: às 10h de quinta o membro confirma e a reserva recebe GAME_LIST_NOT_OPEN com opensAt = quinta 19h', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const game = await t.games.confirm(A, t.group.id, t.gameId);
    expect(ids(game.confirmed)).toEqual([A]);
    const err = await expectAppError(t.games.confirm(R, t.group.id, t.gameId), 'GAME_LIST_NOT_OPEN', 409);
    expect(opensAtOf(err)).toBe(THURSDAY_19H.toISOString());
    expect(ids((await t.current(OWNER, t.group.id)).confirmed)).toEqual([A]);
  });

  it('caso 5: às 19h de quinta a reserva confirma e entra com tier reserve', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await t.confirmInOrder(A);
    t.clock.now = THURSDAY_19H;
    const game = await t.games.confirm(R, t.group.id, t.gameId);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game.confirmed.map((x) => [sys(x.userId), x.tier])).toEqual([
      [A, 'member'],
      [R, 'reserve'],
    ]);
    expect(game.me).toEqual({ list: 'confirmed', position: 2 });
  });

  it('caso 6: myOpensAt da reserva = abertura das reservas; do membro = opensAt; reservesOpensAt igual para todos', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const forMember = await t.current(A, t.group.id);
    const forReserve = await t.current(R, t.group.id);
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
    expect((await t.current(R, t.group.id)).status).toBe('open');
  });

  it('caso 6: com convidados 6 h, guestsOpensAt = sexta 13h para membro e reserva', async () => {
    const t = await setup({ members: [A], reserves: [R], guestsOpenHoursBefore: 6 });
    for (const id of [A, R]) {
      expect(iso((await t.current(id, t.group.id)).guestsOpensAt ?? '')).toBe(FRIDAY_13H.toISOString());
    }
  });

  it('caso 7: vagas 2, A e R dentro; B confirma → fila (D1); R desiste → B sobe e recebe waitlist_promoted', async () => {
    const t = await setup({ slots: 2, reservesOpenHoursBefore: 48, members: [A, B], reserves: [R] });
    await t.confirmInOrder(A, R, B);
    const full = await t.current(B, t.group.id);
    expect(full.confirmed.map((x) => [sys(x.userId), x.tier])).toEqual([
      [A, 'member'],
      [R, 'reserve'],
    ]);
    expect(ids(full.waitlist)).toEqual([B]);
    expect(full.me).toEqual({ list: 'waitlist', position: 1 });
    expect(t.sent).toEqual([]);

    await t.games.leave(R, t.group.id, t.gameId);
    const game = await t.current(B, t.group.id);
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
    await expectAppError(t.games.guestConfirm(G, token, t.gameId), 'GAME_LINK_INVALID', 404);
    await expectAppError(t.games.guestLeave(G, token, t.gameId), 'GAME_LINK_INVALID', 404);
  });

  it('caso 8: token desconhecido → GAME_LINK_INVALID', async () => {
    const t = await setup({ guestsOpenHoursBefore: 6 });
    await expectAppError(t.games.guestView(G, 'nope'), 'GAME_LINK_INVALID', 404);
    await expectAppError(t.games.guestView(G, tokenOf(t.group)), 'GAME_LINK_INVALID', 404);
  });

  it('caso 8: o dono liga convidados com 6 h → o mesmo link vale; antes de sexta 13h vê o jogo e confirmar dá GAME_LIST_NOT_OPEN', async () => {
    const t = await setup();
    const token = guestTokenOf(t.group);
    const updated = await t.groups.update(OWNER, t.group.id, {
      ...t.sv(t.group.id),
      guestsOpenHoursBefore: 6,
    });
    expect(updated.guestsOpenHoursBefore).toBe(6);
    expect(updated.guestToken).toBe(token);

    const view = await t.games.guestView(G, token);
    expect(GuestGameSchema.parse(view)).toBeTruthy();
    expect(view.myTier).toBe('guest');
    expect(view.group).toMatchObject({
      id: t.group.id,
      name: INPUT.name,
      sportId: INPUT.sportId,
      timeZone: 'America/Sao_Paulo',
    });
    expect(view.group).not.toHaveProperty('weekday');
    expect(view.group).not.toHaveProperty('time');
    expect(view.group).not.toHaveProperty('inviteToken');
    expect(view.group).not.toHaveProperty('reserveInviteToken');
    expect(view.group).not.toHaveProperty('guestToken');
    expect(view.games[0]?.date).toBe(DATE);
    expect(iso(view.games[0]?.myOpensAt ?? '')).toBe(FRIDAY_13H.toISOString());
    expect(iso(view.games[0]?.guestsOpensAt ?? '')).toBe(FRIDAY_13H.toISOString());

    const err = await expectAppError(t.games.guestConfirm(G, token, t.gameId), 'GAME_LIST_NOT_OPEN', 409);
    expect(opensAtOf(err)).toBe(FRIDAY_13H.toISOString());
  });

  it('caso 8: a partir de sexta 13h o convidado confirma e aparece na lista com tier guest', async () => {
    const t = await setup({ members: [A], guestsOpenHoursBefore: 6 });
    t.clock.now = FRIDAY_13H;
    await t.confirmInOrder(A);
    const game = await t.games.guestConfirm(G, guestTokenOf(t.group), t.gameId);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game.confirmed.map((x) => [sys(x.userId), x.nickname, x.tier])).toEqual([
      [A, 'Ana', 'member'],
      [G, 'Gabi', 'guest'],
    ]);
    expect(game.me).toEqual({ list: 'confirmed', position: 2 });
    const seen = await t.current(OWNER, t.group.id);
    expect(seen.confirmed.find((x) => x.userId === pub(G))?.tier).toBe('guest');
    expect((await t.games.guestView(G, guestTokenOf(t.group))).games[0]?.me).toEqual({
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
    await expectAppError(t.current(G, t.group.id), 'GROUP_NOT_FOUND', 404);
  });

  it('caso 9: convidado desiste pelo link → sai da lista; desistir de novo é ok', async () => {
    const t = await setup({ members: [A], reservesOpenHoursBefore: 48, guestsOpenHoursBefore: 48 });
    await t.confirmInOrder(A);
    await t.guestConfirmInOrder(G);
    const token = guestTokenOf(t.group);
    await expect(t.games.guestLeave(G, token, t.gameId)).resolves.toBeUndefined();
    expect(ids((await t.current(OWNER, t.group.id)).confirmed)).toEqual([A]);
    expect((await t.games.guestView(G, token)).games[0]?.me).toBeUndefined();
    await expect(t.games.guestLeave(G, token, t.gameId)).resolves.toBeUndefined();
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
    expect(ids((await t.current(B, t.group.id)).waitlist)).toEqual([B]);
    await t.games.guestLeave(G, guestTokenOf(t.group), t.gameId);
    const game = await t.current(B, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([B]);
    expect(t.sent).toHaveLength(1);
  });

  it('caso 10: membro abre o link do jogo → myTier member e confirma pela camada dos membros', async () => {
    const t = await setup({ members: [A], guestsOpenHoursBefore: 6 });
    const token = guestTokenOf(t.group);
    const view = await t.games.guestView(A, token);
    expect(view.myTier).toBe('member');
    expect(iso(view.games[0]?.myOpensAt ?? '')).toBe(WEDNESDAY_19H.toISOString());
    expect((await t.games.guestView(OWNER, token)).myTier).toBe('member');
    const game = await t.games.guestConfirm(A, token, t.gameId);
    expect(game.confirmed.map((x) => [sys(x.userId), x.tier])).toEqual([[A, 'member']]);
    expect((await t.current(A, t.group.id)).me).toEqual({ list: 'confirmed', position: 1 });
  });

  it('caso 10: reserva abre o link do jogo → myTier reserve e vale a camada das reservas', async () => {
    const t = await setup({ reserves: [R], guestsOpenHoursBefore: 6 });
    const token = guestTokenOf(t.group);
    const view = await t.games.guestView(R, token);
    expect(view.myTier).toBe('reserve');
    expect(iso(view.games[0]?.myOpensAt ?? '')).toBe(THURSDAY_19H.toISOString());
    const err = await expectAppError(t.games.guestConfirm(R, token, t.gameId), 'GAME_LIST_NOT_OPEN', 409);
    expect(opensAtOf(err)).toBe(THURSDAY_19H.toISOString());
    t.clock.now = THURSDAY_19H;
    const game = await t.games.guestConfirm(R, token, t.gameId);
    expect(game.confirmed.map((x) => [sys(x.userId), x.tier])).toEqual([[R, 'reserve']]);
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
    expect((await t.games.guestView(G, invite.token)).myTier).toBe('guest');
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
    expect((await t.groups.acceptInvite(R, invite.token)).myTier).toBe('reserve');
    expect((await t.groups.acceptInvite(A, tokenOf(t.group))).myTier).toBe('member');
    const own = await t.groups.get(OWNER, t.group.id);
    expect(own.reserveInviteToken).toBe(invite.token);
    expect(own.inviteToken).toBe(tokenOf(t.group));
  });

  it('GRP-07: membro ou reserva sem cargo tenta trocar qualquer link → GROUP_PERMISSION_DENIED (members.manage) e nada muda', async () => {
    const t = await setup({ members: [A], reserves: [R], guestsOpenHoursBefore: 6 });
    for (const id of [A, R]) {
      for (const kind of KINDS) {
        await expectDenied(t.groups.rotateInvite(id, t.group.id, kind), 'members.manage');
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
    await expect(t.groups.removeMember(OWNER, t.group.id, pub(R))).resolves.toBeUndefined();
    await expectAppError(t.groups.get(R, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.current(R, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(await t.groups.myGroups(R)).toEqual([]);
    expect(ids(await t.groups.members(OWNER, t.group.id))).not.toContain(R);
    const game = await t.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(game.waitlist).toEqual([]);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ userId: B, type: 'waitlist_promoted' });
    expect(t.store.removeCalls.at(-1)).toMatchObject({ userId: R, tier: 'reserve' });
  });

  it('caso 12: remover reserva troca o link de reserva e não o de membro', async () => {
    const t = await setup({ reserves: [R] });
    const oldReserve = reserveTokenOf(t.group);
    await t.groups.removeMember(OWNER, t.group.id, pub(R));
    const own = await t.groups.get(OWNER, t.group.id);
    expect(own.inviteToken).toBe(tokenOf(t.group));
    expect(own.guestToken).toBe(guestTokenOf(t.group));
    expect(own.reserveInviteToken).toBeTypeOf('string');
    expect(own.reserveInviteToken).not.toBe(oldReserve);
    await expectAppError(t.groups.acceptInvite(R, oldReserve), 'GROUP_INVITE_INVALID', 404);
    expect((await t.groups.acceptInvite(OUTSIDER, own.reserveInviteToken ?? '')).myTier).toBe('reserve');
  });

  it('caso 12: remover membro continua trocando só o link de membro', async () => {
    const t = await setup({ members: [A] });
    await t.groups.removeMember(OWNER, t.group.id, pub(A));
    const own = await t.groups.get(OWNER, t.group.id);
    expect(own.inviteToken).not.toBe(tokenOf(t.group));
    expect(own.reserveInviteToken).toBe(reserveTokenOf(t.group));
    expect(t.store.removeCalls.at(-1)).toMatchObject({ userId: A, tier: 'member' });
  });
});

describe('E2: configurar as camadas (caso 13)', () => {
  it('GRP-16: PATCH por membro ou reserva sem cargo → GROUP_PERMISSION_DENIED (settings.edit); não-membro → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await expectDenied(
      t.groups.update(A, t.group.id, { ...t.sv(t.group.id), listOpensHoursBefore: 30 }),
      'settings.edit',
    );
    await expectDenied(
      t.groups.update(R, t.group.id, { ...t.sv(t.group.id), listOpensHoursBefore: 30 }),
      'settings.edit',
    );
    await expectAppError(
      t.groups.update(OUTSIDER, t.group.id, { ...t.sv(t.group.id), listOpensHoursBefore: 30 }),
      'GROUP_NOT_FOUND',
      404,
    );
    expect((await t.groups.get(OWNER, t.group.id)).listOpensHoursBefore).toBe(48);
  });

  it('caso 13: { listOpensHoursBefore: 20 } com reservas 24 → GROUP_LAYERS_INVALID (reservesOpenHoursBefore) e nada muda', async () => {
    const t = await setup();
    const err = await expectAppError(
      t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), listOpensHoursBefore: 20 }),
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
      t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), guestsOpenHoursBefore: 30 }),
      'GROUP_LAYERS_INVALID',
      422,
    );
    expect(fieldOf(err)).toBe('guestsOpenHoursBefore');
    expect((await t.groups.get(OWNER, t.group.id)).guestsOpenHoursBefore).toBeUndefined();
  });

  it('caso 13: PATCH válido junta com o atual e devolve o grupo do dono; o jogo usa a nova abertura', async () => {
    const t = await setup({ members: [A] });
    const updated = await t.groups.update(OWNER, t.group.id, {
      ...t.sv(t.group.id),
      listOpensHoursBefore: 30,
    });
    expect(GroupSchema.parse(updated)).toEqual(updated);
    expect(updated).toMatchObject({
      listOpensHoursBefore: 30,
      reservesOpenHoursBefore: 24,
      myTier: 'member',
    });
    expect(updated.inviteToken).toBe(tokenOf(t.group));
    expect(iso((await t.current(A, t.group.id)).opensAt)).toBe('2026-11-05T16:00:00.000Z');
  });

  it('caso 13: { guestsOpenHoursBefore: null } desliga os convidados', async () => {
    const t = await setup({ members: [A], guestsOpenHoursBefore: 6 });
    const token = guestTokenOf(t.group);
    expect((await t.games.guestView(G, token)).myTier).toBe('guest');
    const updated = await t.groups.update(OWNER, t.group.id, {
      ...t.sv(t.group.id),
      guestsOpenHoursBefore: null,
    });
    expect(updated.guestsOpenHoursBefore).toBeUndefined();
    await expectAppError(t.games.guestView(G, token), 'GAME_LINK_INVALID', 404);
    expect((await t.current(A, t.group.id)).guestsOpensAt).toBeUndefined();
  });

  it('caso 13 (contrato): PATCH vazio é inválido; null em convidados é aceito; GroupLayersSchema aponta o campo', () => {
    expect(UpdateGroupInputSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(UpdateGroupInputSchema.safeParse({ version: 1, guestsOpenHoursBefore: null }).success).toBe(true);
    const layers = GroupLayersSchema.safeParse({ listOpensHoursBefore: 20, reservesOpenHoursBefore: 24 });
    expect(layers.error?.issues.map((i) => i.path)).toEqual([['reservesOpenHoursBefore']]);
  });
});

describe('E2: o que a reserva vê e faz (caso 15)', () => {
  it('caso 15: reserva vê a página do grupo, os membros e o jogo, sem os tokens', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const seen = await t.groups.get(R, t.group.id);
    expect(seen).toMatchObject({ id: t.group.id, myTier: 'reserve' });
    noTokens(seen);
    expect(ids(await t.groups.members(R, t.group.id))).toEqual([OWNER, A, R]);
    const game = await t.current(R, t.group.id);
    expect(game.groupId).toBe(t.group.id);
  });

  it('GRP-25: reserva sem cargo não remove ninguém (GROUP_PERMISSION_DENIED) e ninguém sai', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await expectDenied(t.groups.removeMember(R, t.group.id, pub(A)), 'members.manage');
    await expectDenied(t.groups.removeMember(R, t.group.id, pub(R)), 'members.manage');
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A, R]);
  });

  it('GRP-24: reserva sem cargo não cancela o jogo (GROUP_PERMISSION_DENIED)', async () => {
    const t = await setup({ reserves: [R] });
    await expectDenied(t.games.cancel(R, t.group.id, t.gameId), 'game.manage');
  });
});

// ---------------------------------------------------------------------------------------------
// Plano 013: a participação no grupo vira entidade (`Membership`). Nenhuma rota muda; o que muda é
// a data de entrada preservada, o "meus grupos" pelo `groupsOf` e a ordem por entrada dentro do papel.
// ---------------------------------------------------------------------------------------------

/** Entra pelo link do `kind`, um por vez, avançando o relógio 1 min antes de cada entrada. */
async function joinInOrder(
  t: Awaited<ReturnType<typeof setup>>,
  kind: 'member' | 'reserve',
  ...users: UserId[]
) {
  const token = kind === 'member' ? tokenOf(t.group) : reserveTokenOf(t.group);
  for (const id of users) {
    t.tick();
    await t.groups.acceptInvite(id, token);
  }
}

const roles = (list: { userId: string; tier: MemberTier | 'guest' }[]) =>
  list.map((m) => [sys(m.userId), m.tier]);

describe('plano 013: entrar e o papel (casos 1–7)', () => {
  it('GRP-01: dono cria → membro com o cargo Dono na lista, grupo nos grupos dele, papel member e entrada = criação', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, INPUT);
    expect(await s.groups.members(OWNER, group.id)).toEqual([
      { userId: pub(OWNER), nickname: 'Dono', roleId: 'owner', tier: 'member' },
    ]);
    expect((await s.groups.myGroups(OWNER)).map((g) => [g.id, g.myTier])).toEqual([[group.id, 'member']]);
    expect(await s.store.groups.roleOf(group.id, OWNER)).toBe('member');
    expect(s.store.membershipOf(group.id, OWNER)).toEqual({
      userId: OWNER,
      tier: 'member',
      roleId: 'owner',
      createdAt: THURSDAY_10H.toISOString(),
    });
  });

  it('caso 2: entra pelo link de membro → papel member e o grupo aparece nos grupos dele', async () => {
    const t = await setup();
    const joined = await t.groups.acceptInvite(A, tokenOf(t.group));
    expect(joined.myTier).toBe('member');
    expect(await t.store.groups.roleOf(t.group.id, A)).toBe('member');
    expect((await t.groups.myGroups(A)).map((g) => [g.id, g.myTier])).toEqual([[t.group.id, 'member']]);
    expect(t.store.membershipOf(t.group.id, A)?.createdAt).toBe(THURSDAY_10H.toISOString());
  });

  it('caso 3: entra pelo link de reserva → papel reserve', async () => {
    const t = await setup();
    const joined = await t.groups.acceptInvite(R, reserveTokenOf(t.group));
    expect(joined.myTier).toBe('reserve');
    expect(await t.store.groups.roleOf(t.group.id, R)).toBe('reserve');
    expect((await t.groups.myGroups(R)).map((g) => [g.id, g.myTier])).toEqual([[t.group.id, 'reserve']]);
  });

  it('caso 4: membro usa o link de membro de novo → nada muda (nem a entrada) e myTier member', async () => {
    const t = await setup({ members: [A] });
    const before = t.store.membershipOf(t.group.id, A);
    t.tick();
    const again = await t.groups.acceptInvite(A, tokenOf(t.group));
    expect(again.myTier).toBe('member');
    expect(t.store.membershipOf(t.group.id, A)).toEqual(before);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A]);
    expect(await t.groups.myGroups(A)).toHaveLength(1);
  });

  it('caso 5: membro usa o link de reserva → continua member, sem mudar nada na participação', async () => {
    const t = await setup({ members: [A] });
    const before = t.store.membershipOf(t.group.id, A);
    t.tick();
    expect((await t.groups.acceptInvite(A, reserveTokenOf(t.group))).myTier).toBe('member');
    expect(t.store.membershipOf(t.group.id, A)).toEqual(before);
  });

  it('GRP-03: reserva entra pelo link de membro → member, mantém a entrada original e não grava a data da promoção', async () => {
    const t = await setup();
    await joinInOrder(t, 'reserve', R);
    const joinedAt = t.clock.now.toISOString();
    await joinInOrder(t, 'member', A);
    t.tick();
    const joined = await t.groups.acceptInvite(R, tokenOf(t.group));
    expect(joined.myTier).toBe('member');
    expect(t.store.membershipOf(t.group.id, R)).toEqual({
      userId: R,
      tier: 'member',
      roleId: 'member',
      createdAt: joinedAt,
    });
    // A data de entrada preservada vale na ordem: R entrou antes de A.
    expect(roles(await t.groups.members(OWNER, t.group.id))).toEqual([
      [OWNER, 'member'],
      [R, 'member'],
      [A, 'member'],
    ]);
  });

  it('caso 7: duas entradas simultâneas pelo mesmo link → uma participação só e nenhuma dá erro', async () => {
    const t = await setup();
    const [first, second] = await Promise.all([
      t.groups.acceptInvite(A, tokenOf(t.group)),
      t.groups.acceptInvite(A, tokenOf(t.group)),
    ]);
    expect([first.myTier, second.myTier]).toEqual(['member', 'member']);
    const [r1, r2] = await Promise.all([
      t.groups.acceptInvite(R, reserveTokenOf(t.group)),
      t.groups.acceptInvite(R, reserveTokenOf(t.group)),
    ]);
    expect([r1.myTier, r2.myTier]).toEqual(['reserve', 'reserve']);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A, R]);
    expect(await t.groups.myGroups(A)).toHaveLength(1);
    expect(await t.groups.myGroups(R)).toHaveLength(1);
  });
});

describe('plano 013: meus grupos e lista de membros (casos 8–10)', () => {
  it('caso 8: membro em 2 grupos e reserva em 1 → vêm os 3, cada um com o myTier certo', async () => {
    const t = await setup({ members: [A] });
    const second = await t.groups.create(OWNER, {
      ...INPUT,
      name: 'Futebol de terça',
      sportId: 'soccer',
      weekday: 2,
    });
    const third = await t.groups.create(OWNER, { ...INPUT, name: 'Basquete de domingo', weekday: 0 });
    await t.groups.acceptInvite(A, tokenOf(second));
    await t.groups.acceptInvite(A, reserveTokenOf(third));

    const mine = await t.groups.myGroups(A);
    for (const g of mine) expect(MyGroupSchema.parse(g)).toBeTruthy();
    const byId = (list: [string, string | undefined][]) => list.sort(([x], [y]) => x.localeCompare(y));
    expect(byId(mine.map((g) => [g.id, g.myTier]))).toEqual(
      byId([
        [t.group.id, 'member'],
        [second.id, 'member'],
        [third.id, 'reserve'],
      ]),
    );
  });

  it('caso 8 (D7): "meus grupos" usa o groupsOf, sem get nem roleOf por grupo', async () => {
    const t = await setup({ members: [A] });
    const second = await t.groups.create(OWNER, {
      ...INPUT,
      name: 'Futebol de terça',
      sportId: 'soccer',
      weekday: 2,
    });
    await t.groups.acceptInvite(A, reserveTokenOf(second));
    const before = { ...t.store.reads };
    expect(await t.groups.myGroups(A)).toHaveLength(2);
    expect(t.store.reads.groupsOf - before.groupsOf).toBe(1);
    expect(t.store.reads.get - before.get).toBe(0);
    expect(t.store.reads.roleOf - before.roleOf).toBe(0);
  });

  it('caso 9: usuário sem grupo → lista vazia', async () => {
    const t = await setup({ members: [A] });
    expect(await t.groups.myGroups(OUTSIDER)).toEqual([]);
  });

  it('caso 10: dono, 2 membros e 2 reservas → dono, membros e reservas, cada papel por ordem de entrada', async () => {
    const t = await setup();
    // Ordem de entrada diferente da ordem dos ids (D > A e R > C): a lista não pode sair pelo userId.
    await joinInOrder(t, 'reserve', R);
    await joinInOrder(t, 'member', D);
    await joinInOrder(t, 'reserve', C);
    await joinInOrder(t, 'member', A);
    const list = await t.groups.members(A, t.group.id);
    expect(roles(list)).toEqual([
      [OWNER, 'member'],
      [D, 'member'],
      [A, 'member'],
      [R, 'reserve'],
      [C, 'reserve'],
    ]);
    expect(list[0]?.roleId).toBe('owner');
    expect(list.slice(1).every((m) => m.roleId !== 'owner')).toBe(true);
  });
});

describe('plano 013: remover (casos 11–14)', () => {
  it('caso 11: dono remove membro → sai da lista e dos grupos dele, link de membro trocado e presença apagada', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    const before = await t.groups.get(OWNER, t.group.id);
    await expect(t.groups.removeMember(OWNER, t.group.id, pub(A))).resolves.toBeUndefined();

    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, B, C]);
    expect(await t.groups.myGroups(A)).toEqual([]);
    expect(await t.store.groups.roleOf(t.group.id, A)).toBeUndefined();
    expect(t.store.membershipOf(t.group.id, A)).toBeUndefined();
    const after = await t.groups.get(OWNER, t.group.id);
    expect(after.inviteToken).not.toBe(before.inviteToken);
    expect(after.reserveInviteToken).toBe(before.reserveInviteToken);
    expect(t.store.removeCalls.at(-1)).toMatchObject({ userId: A, tier: 'member' });
    const game = await t.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([B, C]);
    expect(game.waitlist).toEqual([]);
  });

  it('caso 12: o membro já foi removido por outra requisição → GROUP_MEMBER_NOT_FOUND e nada muda', async () => {
    const t = await setup({ members: [A, B] });
    t.store.removeScript.push((args) => {
      t.store.drop(args.group.id, args.userId);
      return t.store.naturalRemove(args);
    });
    await expectAppError(t.groups.removeMember(OWNER, t.group.id, pub(B)), 'GROUP_MEMBER_NOT_FOUND', 404);
    expect(t.store.removeCalls).toHaveLength(1);
    expect((await t.groups.get(OWNER, t.group.id)).inviteToken).toBe(tokenOf(t.group));
    expect(t.sent).toEqual([]);
  });

  it('caso 13: reserva promovida no meio da remoção → relê e remove como member, trocando o link de membro', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    t.store.removeScript.push((args) => {
      t.store.promote(args.group.id, R);
      return t.store.naturalRemove(args);
    });

    await expect(t.groups.removeMember(OWNER, t.group.id, pub(R))).resolves.toBeUndefined();

    expect(t.store.removeCalls.map((c) => [c.userId, c.tier])).toEqual([
      [R, 'reserve'],
      [R, 'member'],
    ]);
    expect(t.store.membershipOf(t.group.id, R)).toBeUndefined();
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A]);
    const after = await t.groups.get(OWNER, t.group.id);
    expect(after.inviteToken).not.toBe(tokenOf(t.group));
    expect(after.reserveInviteToken).toBe(reserveTokenOf(t.group));
  });

  it('caso 14: removido tenta abrir o grupo → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await t.groups.removeMember(OWNER, t.group.id, pub(A));
    await expectAppError(t.groups.get(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.groups.members(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.current(A, t.group.id), 'GROUP_NOT_FOUND', 404);
  });
});

describe('plano 013: papel no link do jogo e na fila (casos 15 e 16)', () => {
  it('caso 15: convidado que não participa → guest; membro e reserva → o papel deles', async () => {
    const t = await setup({ members: [A], reserves: [R], guestsOpenHoursBefore: 6 });
    const token = guestTokenOf(t.group);
    expect((await t.games.guestView(G, token)).myTier).toBe('guest');
    expect((await t.games.guestView(A, token)).myTier).toBe('member');
    expect((await t.games.guestView(R, token)).myTier).toBe('reserve');
    expect((await t.games.guestView(OWNER, token)).myTier).toBe('member');
  });

  it('caso 15: depois de removido, o link do jogo trata como guest', async () => {
    const t = await setup({ members: [A], guestsOpenHoursBefore: 6 });
    await t.groups.removeMember(OWNER, t.group.id, pub(A));
    expect((await t.games.guestView(A, guestTokenOf(t.group))).myTier).toBe('guest');
  });

  it('caso 16: promoção da fila → a reserva promovida é notificada e mantém o papel reserve', async () => {
    const t = await setup({ slots: 2, reservesOpenHoursBefore: 48, members: [A, B], reserves: [R] });
    await t.confirmInOrder(A, B, R);
    await t.games.leave(A, t.group.id, t.gameId);
    const game = await t.current(OWNER, t.group.id);
    expect(roles(game.confirmed)).toEqual([
      [B, 'member'],
      [R, 'reserve'],
    ]);
    expect(game.waitlist).toEqual([]);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([R]);
  });
});

/** Pedido do painel de criar grupo (GRP-34): só nome, esporte, dia, horário e vagas, sem nenhuma camada. */
const { listOpensHoursBefore: _omitted, ...PANEL_INPUT } = INPUT;

describe('criar grupo com os padrões da api (GRP-15)', () => {
  it('GRP-15: o contrato aceita criar sem nenhuma camada', () => {
    const result = CreateGroupInputSchema.safeParse(PANEL_INPUT);
    expect(result.success).toBe(true);
    expect(result.data?.listOpensHoursBefore).toBeUndefined();
  });

  it('GRP-15: sem nenhuma camada → membros 48h, reservas 24h e convidados desligados', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, PANEL_INPUT);
    expect(GroupSchema.parse(group)).toEqual(group);
    expect(group.listOpensHoursBefore).toBe(48);
    expect(group.reservesOpenHoursBefore).toBe(24);
    expect(group.guestsOpenHoursBefore).toBeUndefined();
  });

  it('GRP-15: os padrões ficam gravados (a leitura depois devolve 48h / 24h / desligado)', async () => {
    const s = setupServices();
    const created = await s.groups.create(OWNER, PANEL_INPUT);
    const read = await s.groups.get(OWNER, created.id);
    expect(read).toMatchObject({ listOpensHoursBefore: 48, reservesOpenHoursBefore: 24 });
    expect(read.guestsOpenHoursBefore).toBeUndefined();
  });

  it('GRP-15: sem camadas, a lista dos membros abre 48h antes e a das reservas 24h antes', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, PANEL_INPUT);
    await s.groups.acceptInvite(A, tokenOf(group));
    await s.groups.acceptInvite(R, reserveTokenOf(group));
    // Quinta 10h, 33h antes de sexta 19h: o membro (48h) confirma; a reserva (24h) só a partir de quinta 19h.
    const gameId = gameIdOf((group.schedules[0] as Group['schedules'][number]).id, DATE);
    await s.games.confirm(A, group.id, gameId);
    const err = await expectAppError(s.games.confirm(R, group.id, gameId), 'GAME_LIST_NOT_OPEN', 409);
    expect(opensAtOf(err)).toBe(THURSDAY_19H.toISOString());
  });

  it('GRP-15: com os membros e sem as reservas → reservas na metade, arredondando para baixo (25 → 12)', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, { ...PANEL_INPUT, listOpensHoursBefore: 25 });
    expect(group).toMatchObject({ listOpensHoursBefore: 25, reservesOpenHoursBefore: 12 });
    expect(group.guestsOpenHoursBefore).toBeUndefined();
  });

  it('GRP-15: com os membros e sem as reservas, 72h → reservas 36h (não o padrão de 24h)', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, { ...PANEL_INPUT, listOpensHoursBefore: 72 });
    expect(group).toMatchObject({ listOpensHoursBefore: 72, reservesOpenHoursBefore: 36 });
  });

  it('GRP-15: só os convidados no pedido → membros 48h e reservas 24h, e os convidados gravados', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, { ...PANEL_INPUT, guestsOpenHoursBefore: 12 });
    expect(group).toMatchObject({
      listOpensHoursBefore: 48,
      reservesOpenHoursBefore: 24,
      guestsOpenHoursBefore: 12,
    });
  });

  it('GRP-15: sem os membros e com as reservas dentro do limite (40) → membros 48h e as reservas que vieram', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, { ...PANEL_INPUT, reservesOpenHoursBefore: 40 });
    expect(group).toMatchObject({ listOpensHoursBefore: 48, reservesOpenHoursBefore: 40 });
    expect(group.guestsOpenHoursBefore).toBeUndefined();
    const read = await s.groups.get(OWNER, group.id);
    expect(read).toMatchObject({ listOpensHoursBefore: 48, reservesOpenHoursBefore: 40 });
  });

  it('GRP-15: sem os membros, com reservas e convidados → membros 48h e as duas camadas que vieram', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, {
      ...PANEL_INPUT,
      reservesOpenHoursBefore: 30,
      guestsOpenHoursBefore: 6,
    });
    expect(group).toMatchObject({
      listOpensHoursBefore: 48,
      reservesOpenHoursBefore: 30,
      guestsOpenHoursBefore: 6,
    });
  });

  it('GRP-15: sem os membros e com reservas acima de 48h (50) → GROUP_LAYERS_INVALID (reservesOpenHoursBefore) e não cria', async () => {
    const s = setupServices();
    const err = await expectAppError(
      s.groups.create(OWNER, { ...PANEL_INPUT, reservesOpenHoursBefore: 50 }),
      'GROUP_LAYERS_INVALID',
      422,
    );
    expect(fieldOf(err)).toBe('reservesOpenHoursBefore');
    expect(await s.groups.myGroups(OWNER)).toEqual([]);
  });

  it('GRP-14: só os convidados, acima das reservas padrão (30 > 24) → GROUP_LAYERS_INVALID e não cria', async () => {
    const s = setupServices();
    const err = await expectAppError(
      s.groups.create(OWNER, { ...PANEL_INPUT, guestsOpenHoursBefore: 30 }),
      'GROUP_LAYERS_INVALID',
      422,
    );
    expect(fieldOf(err)).toBe('guestsOpenHoursBefore');
    expect(await s.groups.myGroups(OWNER)).toEqual([]);
  });
});

// Arquivar e desarquivar (.claude/work/arquivar-grupo.md): GRP-31, GRP-32, GRP-33 e a corrida da GRP-24.

const minutesAfter = (d: Date, minutes: number) => new Date(d.getTime() + minutes * MINUTE);

/** Os 3 tokens do grupo como o dono via antes de arquivar. */
const tokensOf = (g: Group) => ({
  member: tokenOf(g),
  reserve: reserveTokenOf(g),
  guest: guestTokenOf(g),
});

describe('arquivar o grupo (GRP-31)', () => {
  it('GRP-31: o dono arquiva → devolve o grupo com archivedAt do relógio e sem os 3 links', async () => {
    const t = await setup({ members: [A] });
    const archived = await t.groups.archive(OWNER, t.group.id);
    expect(GroupSchema.parse(archived)).toEqual(archived);
    expect(archived.id).toBe(t.group.id);
    expect(archived.archivedAt).toBe(THURSDAY_10H.toISOString());
    noTokens(archived);
    expect(t.store.storedGroup(t.group.id)?.archivedAt).toBe(THURSDAY_10H.toISOString());
  });

  it('GRP-31: membro ou reserva tenta arquivar → GROUP_NOT_OWNER; quem não participa → GROUP_NOT_FOUND; nada muda', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await expectAppError(t.groups.archive(A, t.group.id), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.archive(R, t.group.id), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.archive(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(t.store.storedGroup(t.group.id)?.archivedAt).toBeUndefined();
    expect(t.store.archiveCalls).toEqual([]);
    expect((await t.groups.myGroups(A)).map((g) => g.id)).toEqual([t.group.id]);
  });

  it('GRP-31: o grupo sai de "meus grupos" de todos e aparece só nos arquivados', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const other = await t.groups.create(OWNER, { ...INPUT, name: 'Futebol' });
    await t.groups.archive(OWNER, t.group.id);
    expect((await t.groups.myGroups(OWNER)).map((g) => g.id)).toEqual([other.id]);
    expect(await t.groups.myGroups(A)).toEqual([]);
    expect(await t.groups.myGroups(R)).toEqual([]);
    for (const who of [OWNER, A, R]) {
      const list = await t.groups.archivedGroups(who);
      expect(list.map((g) => g.id)).toEqual([t.group.id]);
      expect(list.every((g) => GroupSchema.parse(g) !== undefined)).toBe(true);
      expect(list[0]?.archivedAt).toBe(THURSDAY_10H.toISOString());
    }
    expect(await t.groups.archivedGroups(OUTSIDER)).toEqual([]);
  });

  it('GRP-31: a lista de arquivados vai do arquivado mais recente para o mais antigo', async () => {
    const t = await setup();
    const second = await t.groups.create(OWNER, { ...INPUT, name: 'Futebol' });
    const third = await t.groups.create(OWNER, { ...INPUT, name: 'Basquete' });
    await t.groups.archive(OWNER, second.id);
    t.clock.now = minutesAfter(THURSDAY_10H, 5);
    await t.groups.archive(OWNER, t.group.id);
    t.clock.now = minutesAfter(THURSDAY_10H, 10);
    await t.groups.archive(OWNER, third.id);
    expect((await t.groups.archivedGroups(OWNER)).map((g) => g.id)).toEqual([
      third.id,
      t.group.id,
      second.id,
    ]);
    expect(await t.groups.myGroups(OWNER)).toEqual([]);
  });

  it('GRP-31: os três links param de funcionar na hora', async () => {
    const t = await setup({ guestsOpenHoursBefore: 6 });
    const old = tokensOf(t.group);
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(t.groups.acceptInvite(A, old.member), 'GROUP_INVITE_INVALID', 404);
    await expectAppError(t.groups.acceptInvite(R, old.reserve), 'GROUP_INVITE_INVALID', 404);
    await expectAppError(t.games.guestView(G, old.guest), 'GAME_LINK_INVALID', 404);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER]);
  });

  it('GRP-31: jogo open com lista e fila → cancelado, e todos da lista (menos o dono) recebem game_cancelled', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(OWNER, A, B, C);
    await t.groups.archive(OWNER, t.group.id);
    expect((await t.store.games.get(t.gameId, { consistent: true }))?.cancelledAt).toBeDefined();
    expect(ofType(t.sent, 'game_cancelled').sort()).toEqual([A, B, C].sort());
  });

  it('GRP-31: jogo scheduled com lista → cancelado com o aviso', async () => {
    const t = await setup({ members: [A], listOpensHoursBefore: 48 });
    await t.confirmInOrder(A);
    await t.groups.update(OWNER, t.group.id, {
      ...t.sv(t.group.id),
      listOpensHoursBefore: 24,
      reservesOpenHoursBefore: 24,
    });
    expect((await t.current(A, t.group.id)).status).toBe('scheduled');
    await t.groups.archive(OWNER, t.group.id);
    expect((await t.store.games.get(t.gameId, { consistent: true }))?.cancelledAt).toBeDefined();
    expect(ofType(t.sent, 'game_cancelled')).toEqual([A]);
  });

  it('GRP-31: jogo sem ninguém na lista → arquiva sem avisar ninguém', async () => {
    const t = await setup({ members: [A] });
    await t.groups.archive(OWNER, t.group.id);
    expect(t.sent).toEqual([]);
    expect(t.store.storedGroup(t.group.id)?.archivedAt).toBeDefined();
  });

  it('GRP-31: jogo in_progress → fica como está, sem cancelamento nem aviso', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    t.clock.now = FRIDAY_20H;
    const archived = await t.groups.archive(OWNER, t.group.id);
    expect(archived.archivedAt).toBe(FRIDAY_20H.toISOString());
    expect((await t.store.games.get(t.gameId, { consistent: true }))?.cancelledAt).toBeUndefined();
    expect(ofType(t.sent, 'game_cancelled')).toEqual([]);
  });

  it('GRP-31: membros e reservas continuam no grupo, com os mesmos papéis e datas', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const before = [OWNER, A, R].map((id) => t.store.membershipOf(t.group.id, id));
    const membersBefore = await t.groups.members(OWNER, t.group.id);
    t.tick();
    await t.groups.archive(OWNER, t.group.id);
    expect([OWNER, A, R].map((id) => t.store.membershipOf(t.group.id, id))).toEqual(before);
    expect(await t.groups.members(OWNER, t.group.id)).toEqual(membersBefore);
  });

  it('GRP-31: arquivar de novo não muda a data de arquivamento nem avisa outra vez', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    const first = await t.groups.archive(OWNER, t.group.id);
    t.tick();
    const second = await t.groups.archive(OWNER, t.group.id);
    expect(second.archivedAt).toBe(first.archivedAt);
    expect(t.store.storedGroup(t.group.id)?.archivedAt).toBe(first.archivedAt);
    expect(t.store.archiveCalls).toHaveLength(1);
    expect(ofType(t.sent, 'game_cancelled')).toEqual([A]);
  });

  it('GRP-31: arquivar de novo cancela o jogo que ficou sem cancelar (com o aviso), sem regravar o grupo', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    const archivedAt = THURSDAY_10H.toISOString();
    t.store.forceArchive(t.group.id, archivedAt);
    t.tick();
    const again = await t.groups.archive(OWNER, t.group.id);
    expect(again.archivedAt).toBe(archivedAt);
    expect(t.store.archiveCalls).toEqual([]);
    expect((await t.store.games.get(t.gameId, { consistent: true }))?.cancelledAt).toBeDefined();
    expect(ofType(t.sent, 'game_cancelled')).toEqual([A]);
  });

  it('GRP-31: link trocado no meio (stale e depois archived) → relê e arquiva com os tokens novos', async () => {
    const t = await setup({ members: [A] });
    t.store.archiveScript.push((group) => {
      t.store.swapToken(group.id, 'member', 'rotated-in-between');
      return 'stale';
    });
    const archived = await t.groups.archive(OWNER, t.group.id);
    expect(archived.archivedAt).toBeDefined();
    expect(t.store.archiveCalls).toHaveLength(2);
    expect(t.store.archiveCalls[1]?.group.inviteToken).toBe('rotated-in-between');
    await expectAppError(t.groups.acceptInvite(B, 'rotated-in-between'), 'GROUP_INVITE_INVALID', 404);
  });

  it('GRP-31: stale 3 vezes → erro comum (500), não appError, e nada muda', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    for (const _ of [1, 2, 3, 4]) t.store.archiveScript.push(() => 'stale');
    const err = await t.groups.archive(OWNER, t.group.id).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AppError);
    expect(t.store.archiveCalls).toHaveLength(3);
    expect(t.store.storedGroup(t.group.id)?.archivedAt).toBeUndefined();
    expect((await t.groups.myGroups(A)).map((g) => g.id)).toEqual([t.group.id]);
  });
});

describe('grupo arquivado é só leitura (GRP-32)', () => {
  it('GRP-32: membro e reserva leem o grupo (com archivedAt) e a lista de membros', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await t.groups.archive(OWNER, t.group.id);
    for (const who of [OWNER, A, R]) {
      const seen = await t.groups.get(who, t.group.id);
      expect(seen.archivedAt).toBe(THURSDAY_10H.toISOString());
      noTokens(seen);
      expect(ids(await t.groups.members(who, t.group.id))).toEqual([OWNER, A, R]);
    }
  });

  it('GRP-32: quem não participa continua recebendo GROUP_NOT_FOUND (GRP-04 vem antes)', async () => {
    const t = await setup({ members: [A] });
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(t.groups.get(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.current(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.games.confirm(OUTSIDER, t.group.id, t.gameId), 'GROUP_NOT_FOUND', 404);
  });

  it('GRP-32: pedir o jogo atual, confirmar e desistir → GROUP_ARCHIVED (409)', async () => {
    const t = await setup({ members: [A, B], reserves: [R] });
    await t.confirmInOrder(A);
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(t.current(A, t.group.id), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.current(R, t.group.id), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.games.confirm(B, t.group.id, t.gameId), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.games.leave(A, t.group.id, t.gameId), 'GROUP_ARCHIVED', 409);
    expect(
      (await t.store.games.listPlayers((await t.store.games.get(t.gameId))?.id ?? '')).map((a) => a.userId),
    ).toEqual([A]);
  });

  it('GRP-32: jogo em andamento num grupo arquivado → o jogo atual também dá GROUP_ARCHIVED', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    t.clock.now = FRIDAY_20H;
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(t.current(A, t.group.id), 'GROUP_ARCHIVED', 409);
  });

  it('GRP-32: o dono muda as camadas, troca um link, remove alguém ou cancela o jogo → GROUP_ARCHIVED e nada muda', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await t.groups.archive(OWNER, t.group.id);
    const before = t.store.storedGroup(t.group.id);
    await expectAppError(
      t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), guestsOpenHoursBefore: 6 }),
      'GROUP_ARCHIVED',
      409,
    );
    for (const kind of KINDS)
      await expectAppError(t.groups.rotateInvite(OWNER, t.group.id, kind), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.groups.removeMember(OWNER, t.group.id, pub(A)), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.games.cancel(OWNER, t.group.id, t.gameId), 'GROUP_ARCHIVED', 409);
    expect(t.store.storedGroup(t.group.id)).toEqual(before);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A, R]);
    expect(t.store.removeCalls).toEqual([]);
  });

  it('GRP-32: ação com permissão por quem não a tem num grupo arquivado → GROUP_PERMISSION_DENIED (GRP-04 vem antes)', async () => {
    const t = await setup({ members: [A] });
    await t.groups.archive(OWNER, t.group.id);
    await expectDenied(
      t.groups.update(A, t.group.id, { ...t.sv(t.group.id), guestsOpenHoursBefore: 6 }),
      'settings.edit',
    );
    await expectDenied(t.games.cancel(A, t.group.id, t.gameId), 'game.manage');
  });

  it('GRP-32: confirmar no mesmo instante do arquivamento → GROUP_ARCHIVED e a presença não é gravada', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A);
    t.store.hooks.beforeAddAttendance.push((_a, groupId) =>
      t.store.forceArchive(groupId, t.clock.now.toISOString()),
    );
    await expectAppError(t.games.confirm(B, t.group.id, t.gameId), 'GROUP_ARCHIVED', 409);
    const game = await t.store.games.get(t.gameId, { consistent: true });
    expect((await t.store.games.listPlayers(game?.id ?? '')).map((a) => a.userId)).toEqual([A]);
    expect(await t.store.games.getPlayer(game?.id ?? '', B)).toBeUndefined();
  });

  it('GRP-32: confirmar no jogo virtual no mesmo instante do arquivamento → GROUP_ARCHIVED e ninguém gravado', async () => {
    const t = await setup({ members: [A] });
    t.store.hooks.beforeAddAttendance.push((_a, groupId) =>
      t.store.forceArchive(groupId, t.clock.now.toISOString()),
    );
    await expectAppError(t.games.confirm(A, t.group.id, t.gameId), 'GROUP_ARCHIVED', 409);
    const game = await t.store.games.get(t.gameId, { consistent: true });
    expect(await t.store.games.listPlayers(game?.id ?? '')).toEqual([]);
  });

  it('GRP-32: convidado confirma pelo link no mesmo instante do arquivamento → GROUP_ARCHIVED e não é gravado', async () => {
    const t = await setup({ members: [A], guestsOpenHoursBefore: 6, now: FRIDAY_13H });
    await t.confirmInOrder(A);
    t.store.hooks.beforeAddAttendance.push((_a, groupId) =>
      t.store.forceArchive(groupId, t.clock.now.toISOString()),
    );
    await expectAppError(t.games.guestConfirm(G, guestTokenOf(t.group), t.gameId), 'GROUP_ARCHIVED', 409);
    const game = await t.store.games.get(t.gameId, { consistent: true });
    expect((await t.store.games.listPlayers(game?.id ?? '')).map((a) => a.userId)).toEqual([A]);
  });

  it('GRP-32: arquivado e cancelado no mesmo instante da confirmação → GROUP_ARCHIVED', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A);
    t.store.hooks.beforeAddAttendance.push((a, groupId) => {
      t.store.forceCancel(a.gameId, t.clock.now.toISOString());
      t.store.forceArchive(groupId, t.clock.now.toISOString());
    });
    await expectAppError(t.games.confirm(B, t.group.id, t.gameId), 'GROUP_ARCHIVED', 409);
    const game = await t.store.games.get(t.gameId, { consistent: true });
    expect((await t.store.games.listPlayers(game?.id ?? '')).map((a) => a.userId)).toEqual([A]);
  });

  it('GRP-32: remover no mesmo instante do arquivamento (stale) → GROUP_ARCHIVED, o membro fica e nenhum link é gravado', async () => {
    const t = await setup({ members: [A] });
    t.store.removeScript.push((args) => {
      t.store.forceArchive(args.group.id, t.clock.now.toISOString());
      return 'stale';
    });
    await expectAppError(t.groups.removeMember(OWNER, t.group.id, pub(A)), 'GROUP_ARCHIVED', 409);
    expect(t.store.membershipOf(t.group.id, A)).toBeDefined();
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A]);
    const stored = t.store.storedGroup(t.group.id);
    expect(stored?.archivedAt).toBeDefined();
    expect(stored?.inviteToken).toBeUndefined();
    expect(t.store.removeCalls).toHaveLength(1);
  });
});

describe('confirmar no mesmo instante do cancelamento (GRP-24)', () => {
  it('GRP-24: o cancelamento é gravado entre a leitura e a confirmação → GAME_CANCELLED e a presença não é gravada', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A);
    t.store.hooks.beforeAddAttendance.push((a) => t.store.forceCancel(a.gameId, t.clock.now.toISOString()));
    await expectAppError(t.games.confirm(B, t.group.id, t.gameId), 'GAME_CANCELLED', 409);
    const game = await t.store.games.get(t.gameId, { consistent: true });
    expect((await t.store.games.listPlayers(game?.id ?? '')).map((a) => a.userId)).toEqual([A]);
    expect(await t.store.games.getPlayer(game?.id ?? '', B)).toBeUndefined();
  });

  it('GRP-24: convidado pelo link no mesmo instante do cancelamento → GAME_CANCELLED e não é gravado', async () => {
    const t = await setup({ members: [A], guestsOpenHoursBefore: 6, now: FRIDAY_13H });
    await t.confirmInOrder(A);
    t.store.hooks.beforeAddAttendance.push((a) => t.store.forceCancel(a.gameId, t.clock.now.toISOString()));
    await expectAppError(t.games.guestConfirm(G, guestTokenOf(t.group), t.gameId), 'GAME_CANCELLED', 409);
    const game = await t.store.games.get(t.gameId, { consistent: true });
    expect((await t.store.games.listPlayers(game?.id ?? '')).map((a) => a.userId)).toEqual([A]);
  });

  it('GRP-24: quem confirmou antes do cancelamento está na lista e recebe o aviso', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    await t.games.cancel(OWNER, t.group.id, t.gameId);
    expect(ofType(t.sent, 'game_cancelled').sort()).toEqual([A, B].sort());
  });

  it('GRP-24: confirmar de novo quem já está na lista continua mantendo a posição (exists)', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    const game = await t.games.confirm(A, t.group.id, t.gameId);
    expect(ids(game.confirmed)).toEqual([A, B]);
  });
});

describe('desarquivar o grupo (GRP-33)', () => {
  it('GRP-33: o dono desarquiva → sem archivedAt e com três links novos, diferentes dos antigos', async () => {
    const t = await setup({ members: [A] });
    const old = tokensOf(t.group);
    await t.groups.archive(OWNER, t.group.id);
    const back = await t.groups.unarchive(OWNER, t.group.id);
    expect(GroupSchema.parse(back)).toEqual(back);
    expect(back.archivedAt).toBeUndefined();
    const fresh = tokensOf(back);
    expect(fresh.member).not.toBe(old.member);
    expect(fresh.reserve).not.toBe(old.reserve);
    expect(fresh.guest).not.toBe(old.guest);
    expect(new Set(Object.values(fresh)).size).toBe(3);
    expect(t.store.storedGroup(t.group.id)?.archivedAt).toBeUndefined();
  });

  it('GRP-33: os links antigos não voltam a valer e os novos funcionam', async () => {
    const t = await setup({ guestsOpenHoursBefore: 6 });
    const old = tokensOf(t.group);
    await t.groups.archive(OWNER, t.group.id);
    const fresh = tokensOf(await t.groups.unarchive(OWNER, t.group.id));
    await expectAppError(t.groups.acceptInvite(A, old.member), 'GROUP_INVITE_INVALID', 404);
    await expectAppError(t.groups.acceptInvite(R, old.reserve), 'GROUP_INVITE_INVALID', 404);
    await expectAppError(t.games.guestView(G, old.guest), 'GAME_LINK_INVALID', 404);
    expect((await t.groups.acceptInvite(A, fresh.member)).id).toBe(t.group.id);
    expect((await t.groups.acceptInvite(R, fresh.reserve)).id).toBe(t.group.id);
    expect((await t.games.guestView(G, fresh.guest)).group.id).toBe(t.group.id);
  });

  it('GRP-33: o grupo volta para "meus grupos" de todos e sai dos arquivados', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await t.groups.archive(OWNER, t.group.id);
    await t.groups.unarchive(OWNER, t.group.id);
    for (const who of [OWNER, A, R]) {
      expect((await t.groups.myGroups(who)).map((g) => g.id)).toEqual([t.group.id]);
      expect(await t.groups.archivedGroups(who)).toEqual([]);
    }
  });

  it('GRP-33: depois de desarquivar, o grupo volta a aceitar escrita (jogo atual e confirmar)', async () => {
    const t = await setup({ members: [A] });
    await t.groups.archive(OWNER, t.group.id);
    await t.groups.unarchive(OWNER, t.group.id);
    expect((await t.current(A, t.group.id)).date).toBe(DATE);
    const game = await t.games.confirm(A, t.group.id, t.gameId);
    expect(ids(game.confirmed)).toEqual([A]);
  });

  it('GRP-33: membro ou reserva tenta desarquivar → GROUP_NOT_OWNER; quem não participa → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(t.groups.unarchive(A, t.group.id), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.unarchive(R, t.group.id), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.unarchive(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(t.store.unarchiveCalls).toEqual([]);
    expect(t.store.storedGroup(t.group.id)?.archivedAt).toBeDefined();
  });

  it('GRP-33: desarquivar um grupo ativo não muda nada (mesmos links, sem chamar o repositório)', async () => {
    const t = await setup({ members: [A] });
    const before = tokensOf(t.group);
    const same = await t.groups.unarchive(OWNER, t.group.id);
    expect(same.archivedAt).toBeUndefined();
    expect(tokensOf(same)).toEqual(before);
    expect(t.store.unarchiveCalls).toEqual([]);
    expect((await t.groups.acceptInvite(B, before.member)).id).toBe(t.group.id);
  });

  it('GRP-33: outra requisição desarquivou antes (not_archived) → relê e devolve o grupo atual', async () => {
    const t = await setup({ members: [A] });
    await t.groups.archive(OWNER, t.group.id);
    const winner = {
      inviteToken: 'winner-member',
      reserveInviteToken: 'winner-reserve',
      guestToken: 'winner-guest',
    };
    t.store.unarchiveScript.push(({ group }) => {
      t.store.naturalUnarchive({ group, tokens: winner });
      return 'not_archived';
    });
    const back = await t.groups.unarchive(OWNER, t.group.id);
    expect(back.archivedAt).toBeUndefined();
    expect(back).toMatchObject(winner);
    expect(t.store.unarchiveCalls).toHaveLength(1);
  });
});

describe('grupos: logo e capa visíveis (GRP-36)', () => {
  const LOGO_ID = 'aaaaaaaa-0000-4000-8000-00000000000a';
  const COVER_ID = 'cccccccc-0000-4000-8000-00000000000c';
  /** MID-12: a URL é montada na resposta a partir do id (o item do grupo não guarda URL). */
  const LOGO_URL = `https://uploads.test/public/group.logo/${LOGO_ID}`;
  const COVER_URL = `https://uploads.test/public/group.cover/${COVER_ID}`;

  /** Grupo com logo e capa já ligados: só os ids, como a transação da mídia grava (MID-08, MID-12). */
  async function withImages() {
    const t = await setup({ members: [A], reserves: [R], guestsOpenHoursBefore: 6 });
    await t.store.groups.update(
      t.group.id,
      { logoMediaId: LOGO_ID, coverMediaId: COVER_ID } as unknown as GroupPatch,
      t.sv(t.group.id).version,
    );
    return t;
  }

  it('GRP-36: membro e reserva veem `logoUrl` e `coverUrl` no grupo, sem os ids das mídias', async () => {
    const t = await withImages();
    for (const who of [OWNER, A, R]) {
      const seen = await t.groups.get(who, t.group.id);
      expect(seen).toMatchObject({ logoUrl: LOGO_URL, coverUrl: COVER_URL });
      expect(seen).not.toHaveProperty('logoMediaId');
      expect(seen).not.toHaveProperty('coverMediaId');
    }
  });

  it('GRP-36: o card de "meus grupos" traz o logo e a capa', async () => {
    const t = await withImages();
    const [mine] = await t.groups.myGroups(A);
    expect(MyGroupSchema.parse(mine)).toMatchObject({ logoUrl: LOGO_URL, coverUrl: COVER_URL });
    expect(mine).not.toHaveProperty('logoMediaId');
    expect(mine).not.toHaveProperty('coverMediaId');
  });

  it('GRP-36: o convidado pelo link do jogo vê o logo e a capa', async () => {
    const t = await withImages();
    const view = await t.games.guestView(G, guestTokenOf(t.group));
    expect(GuestGameSchema.parse(view).group).toMatchObject({ logoUrl: LOGO_URL, coverUrl: COVER_URL });
    expect(view.group).not.toHaveProperty('logoMediaId');
    expect(view.group).not.toHaveProperty('coverMediaId');
  });
});

describe('reabrir o jogo cancelado (GRP-44)', () => {
  /** Vagas 2: A e B dentro, C na fila; o dono também confirmou. Depois, o dono cancela. */
  async function cancelledWithList() {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.games.cancel(OWNER, t.group.id, t.gameId);
    t.sent.splice(0);
    return t;
  }

  it('GRP-44: o dono reabre → o jogo volta a open com a mesma lista, dentro e fila na mesma ordem', async () => {
    const t = await cancelledWithList();
    const game = await t.games.reopen(OWNER, t.group.id, t.gameId);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game.status).toBe('open');
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ids(game.waitlist)).toEqual([C]);
    const seen = await t.current(A, t.group.id);
    expect(seen.status).toBe('open');
    expect(ids(seen.confirmed)).toEqual([A, B]);
    expect(ids(seen.waitlist)).toEqual([C]);
  });

  it('GRP-44: todos da lista (dentro e fila) recebem game_reopened com o link do grupo; o dono não', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(OWNER, A, B, C);
    await t.games.cancel(OWNER, t.group.id, t.gameId);
    t.sent.splice(0);
    await t.games.reopen(OWNER, t.group.id, t.gameId);
    expect(ofType(t.sent, 'game_reopened').sort()).toEqual([A, B, C].sort());
    expect(t.sent).toHaveLength(3);
    for (const n of t.sent) {
      expect(n).toMatchObject({
        type: 'game_reopened',
        title: 'Jogo reaberto',
        link: `/groups/${t.group.id}`,
      });
      expect(n.body).toContain('voltou a valer');
    }
  });

  it('GRP-44: depois de reabrir, confirmar e desistir voltam a valer (quem confirma vai para o fim)', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B);
    await t.games.cancel(OWNER, t.group.id, t.gameId);
    t.tick();
    await t.games.reopen(OWNER, t.group.id, t.gameId);
    t.tick();
    const game = await t.games.confirm(C, t.group.id, t.gameId);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ids(game.waitlist)).toEqual([C]);
    await t.games.leave(A, t.group.id, t.gameId);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([C]);
  });

  it('GRP-44: reabrir um jogo que não está cancelado → devolve o jogo como está e ninguém é avisado', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    const before = await t.current(OWNER, t.group.id);
    const game = await t.games.reopen(OWNER, t.group.id, t.gameId);
    expect(game).toEqual(before);
    expect(t.sent).toEqual([]);
  });

  it('GRP-44: reabrir o jogo virtual (ninguém confirmou) → devolve o jogo open, sem criar item nem avisar', async () => {
    const t = await setup({ members: [A] });
    const game = await t.games.reopen(OWNER, t.group.id, t.gameId);
    expect(game.status).toBe('open');
    expect(game.confirmed).toEqual([]);
    expect(t.store.gameCount()).toBe(0);
    expect(t.sent).toEqual([]);
  });

  it('GRP-44: reabrir duas vezes → a segunda devolve o jogo e não avisa outra vez', async () => {
    const t = await cancelledWithList();
    const first = await t.games.reopen(OWNER, t.group.id, t.gameId);
    const second = await t.games.reopen(OWNER, t.group.id, t.gameId);
    expect(second).toEqual(first);
    expect(ofType(t.sent, 'game_reopened').sort()).toEqual([A, B, C].sort());
  });

  it('GRP-44: outra reabertura gravada no mesmo instante (not_cancelled) → devolve o jogo open sem avisar', async () => {
    const t = await cancelledWithList();
    t.store.hooks.beforeReopen.push((gameId) => t.store.forceReopen(gameId));
    const game = await t.games.reopen(OWNER, t.group.id, t.gameId);
    expect(game.status).toBe('open');
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ids(game.waitlist)).toEqual([C]);
    expect(t.sent).toEqual([]);
  });

  it('GRP-44: com o jogo já no horário de início → GAME_CLOSED, continua cancelado e ninguém é avisado', async () => {
    const t = await cancelledWithList();
    t.clock.now = FRIDAY_20H;
    await expectAppError(t.games.reopen(OWNER, t.group.id, t.gameId), 'GAME_CLOSED', 409);
    expect((await t.current(A, t.group.id)).status).toBe('cancelled');
    expect(t.store.reopenCalls).toEqual([]);
    expect(t.sent).toEqual([]);
  });

  it('GRP-44: membro ou reserva sem cargo tenta reabrir → GROUP_PERMISSION_DENIED (game.manage); quem não participa → GROUP_NOT_FOUND; nada muda', async () => {
    const t = await setup({ members: [A], reserves: [R], now: THURSDAY_19H });
    await t.confirmInOrder(A, R);
    await t.games.cancel(OWNER, t.group.id, t.gameId);
    t.sent.splice(0);
    await expectDenied(t.games.reopen(A, t.group.id, t.gameId), 'game.manage');
    await expectDenied(t.games.reopen(R, t.group.id, t.gameId), 'game.manage');
    await expectAppError(t.games.reopen(OUTSIDER, t.group.id, t.gameId), 'GROUP_NOT_FOUND', 404);
    expect((await t.current(A, t.group.id)).status).toBe('cancelled');
    expect(t.sent).toEqual([]);
  });

  it('GRP-44: data diferente do jogo atual → GAME_NOT_FOUND', async () => {
    const t = await cancelledWithList();
    await expectAppError(t.games.reopen(OWNER, t.group.id, t.gameAt(NEXT_DATE)), 'GAME_NOT_FOUND', 404);
    expect((await t.current(A, t.group.id)).status).toBe('cancelled');
  });

  it('GRP-44: grupo arquivado → GROUP_ARCHIVED (409), o jogo continua cancelado e ninguém é avisado', async () => {
    const t = await setup({ slots: 2, members: [A, B] });
    await t.confirmInOrder(A, B);
    await t.groups.archive(OWNER, t.group.id);
    t.sent.splice(0);
    await expectAppError(t.games.reopen(OWNER, t.group.id, t.gameId), 'GROUP_ARCHIVED', 409);
    expect(t.sent).toEqual([]);
    await t.groups.unarchive(OWNER, t.group.id);
    expect((await t.current(A, t.group.id)).status).toBe('cancelled');
  });

  it('GRP-44: depois de desarquivar, o dono reabre o jogo cancelado pelo arquivamento e a lista volta', async () => {
    const t = await setup({ slots: 2, members: [A, B] });
    await t.confirmInOrder(A, B);
    await t.groups.archive(OWNER, t.group.id);
    await t.groups.unarchive(OWNER, t.group.id);
    t.sent.splice(0);
    const game = await t.games.reopen(OWNER, t.group.id, t.gameId);
    expect(game.status).toBe('open');
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ofType(t.sent, 'game_reopened').sort()).toEqual([A, B].sort());
  });

  it('GRP-44: arquivamento no mesmo instante da reabertura → GROUP_ARCHIVED, nada é gravado e ninguém é avisado', async () => {
    const t = await cancelledWithList();
    t.store.hooks.beforeReopen.push((_gameId, groupId) =>
      t.store.forceArchive(groupId, t.clock.now.toISOString()),
    );
    await expectAppError(t.games.reopen(OWNER, t.group.id, t.gameId), 'GROUP_ARCHIVED', 409);
    expect(t.store.reopenCalls).toHaveLength(1);
    expect((await t.store.games.get(t.gameId))?.cancelledAt).toBeDefined();
    expect(t.sent).toEqual([]);
  });

  it('GRP-44: a reabertura vem antes do arquivamento → o arquivamento cancela de novo, com o aviso (GRP-31)', async () => {
    const t = await cancelledWithList();
    await t.games.reopen(OWNER, t.group.id, t.gameId);
    t.sent.splice(0);
    await t.groups.archive(OWNER, t.group.id);
    expect(ofType(t.sent, 'game_cancelled').sort()).toEqual([A, B, C].sort());
  });

  it('GRP-44: cancelar de novo depois de reabrir avisa outra vez, com a data do novo cancelamento (GRP-24)', async () => {
    const t = await cancelledWithList();
    const firstAt = (await t.store.games.get(t.gameId))?.cancelledAt;
    t.tick();
    await t.games.reopen(OWNER, t.group.id, t.gameId);
    t.tick();
    t.sent.splice(0);
    const game = await t.games.cancel(OWNER, t.group.id, t.gameId);
    expect(game.status).toBe('cancelled');
    expect(ofType(t.sent, 'game_cancelled').sort()).toEqual([A, B, C].sort());
    const secondAt = (await t.store.games.get(t.gameId))?.cancelledAt;
    expect(secondAt).toBe(t.clock.now.toISOString());
    expect(secondAt).not.toBe(firstAt);
  });
});

describe('remover com o jogo cancelado (GRP-25)', () => {
  it('GRP-25: jogo cancelado, o dono remove quem estava dentro → a presença sai e ninguém é avisado de promoção', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.games.cancel(OWNER, t.group.id, t.gameId);
    t.sent.splice(0);
    await t.groups.removeMember(OWNER, t.group.id, pub(A));
    expect(t.store.removeCalls[0]?.players).toMatchObject([{ userId: A }]);
    expect(await t.store.games.getPlayer((await t.store.games.get(t.gameId))?.id ?? '', A)).toBe(undefined);
    const game = await t.current(OWNER, t.group.id);
    expect(game.status).toBe('cancelled');
    expect(ids(game.confirmed)).toEqual([B, C]);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([]);
    expect(t.sent).toEqual([]);
  });

  it('GRP-25: removido durante o cancelamento não volta para a lista ao reabrir (e não recebe game_reopened)', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.games.cancel(OWNER, t.group.id, t.gameId);
    await t.groups.removeMember(OWNER, t.group.id, pub(A));
    t.sent.splice(0);
    const game = await t.games.reopen(OWNER, t.group.id, t.gameId);
    expect(ids(game.confirmed)).toEqual([B, C]);
    expect(game.waitlist).toEqual([]);
    expect(ofType(t.sent, 'game_reopened').sort()).toEqual([B, C].sort());
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([]);
  });

  it('GRP-25: jogo cancelado, remover uma reserva que estava na lista → a presença sai, sem aviso', async () => {
    const t = await setup({ slots: 2, members: [A], reserves: [R], now: THURSDAY_19H });
    await t.confirmInOrder(A, R);
    await t.games.cancel(OWNER, t.group.id, t.gameId);
    t.sent.splice(0);
    await t.groups.removeMember(OWNER, t.group.id, pub(R));
    expect(ids((await t.current(OWNER, t.group.id)).confirmed)).toEqual([A]);
    expect(t.sent).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Limites de membros e reservas, convite para membro e sair do grupo (GRP-38–42). Relógio: quinta 10h.
const roleOfIn = (list: { userId: string; tier: MemberTier }[], id: UserId) =>
  list.find((m) => m.userId === pub(id))?.tier;
const inviteOfIn = (list: { userId: string; memberInviteExpiresAt?: string | undefined }[], id: UserId) =>
  list.find((m) => m.userId === pub(id))?.memberInviteExpiresAt;
const IN_7_DAYS = iso(new Date(THURSDAY_10H.getTime() + 7 * DAY));

describe('limites do grupo (GRP-38, GRP-16)', () => {
  it('GRP-38: grupo novo nasce com 30 membros e 30 reservas, decididos pela api', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, INPUT);
    expect(group).toMatchObject({ maxMembers: 30, maxReserves: 30 });
    expect(await s.groups.get(OWNER, group.id)).toMatchObject({ maxMembers: 30, maxReserves: 30 });
  });

  it('GRP-38: membros de 2 a 30 e reservas de 0 a 30 no PATCH; fora disso o contrato recusa', () => {
    for (const ok of [{ maxMembers: 2 }, { maxMembers: 30 }, { maxReserves: 0 }, { maxReserves: 30 }])
      expect(UpdateGroupInputSchema.safeParse({ version: 1, ...ok }).success).toBe(true);
    for (const bad of [{ maxMembers: 1 }, { maxMembers: 31 }, { maxReserves: -1 }, { maxReserves: 31 }])
      expect(UpdateGroupInputSchema.safeParse({ version: 1, ...bad }).success).toBe(false);
  });

  it('GRP-16: o PATCH aceita os limites, as vagas e o mínimo; nome e horário continuam fora', () => {
    expect(
      UpdateGroupInputSchema.parse({
        version: 1,
        maxMembers: 14,
        maxReserves: 5,
        name: 'Outro',
        time: '20:00',
        slots: 20,
        minPlayers: 10,
      }),
    ).toEqual({ version: 1, maxMembers: 14, maxReserves: 5, slots: 20, minPlayers: 10 });
    expect(UpdateGroupInputSchema.parse({ version: 1, minPlayers: null })).toEqual({
      version: 1,
      minPlayers: null,
    });
  });

  it('GRP-16: o dono muda os limites → o grupo devolve os novos para todos', async () => {
    const t = await setup({ members: [A] });
    const updated = await t.groups.update(OWNER, t.group.id, {
      ...t.sv(t.group.id),
      maxMembers: 14,
      maxReserves: 0,
    });
    expect(updated).toMatchObject({ maxMembers: 14, maxReserves: 0 });
    expect(await t.groups.get(A, t.group.id)).toMatchObject({ maxMembers: 14, maxReserves: 0 });
  });

  it('GRP-16: quem não tem settings.edit muda os limites → GROUP_PERMISSION_DENIED e nada muda', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    for (const who of [A, R])
      await expectDenied(
        t.groups.update(who, t.group.id, { ...t.sv(t.group.id), maxMembers: 5 }),
        'settings.edit',
      );
    expect(t.store.storedGroup(t.group.id)?.maxMembers).toBe(30);
  });

  it('GRP-38: abaixar o limite para menos do que o grupo tem não tira ninguém, só barra novas entradas', async () => {
    const t = await setup({ members: [A, B, C], reserves: [R] });
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), maxMembers: 2, maxReserves: 0 });
    const list = await t.groups.members(OWNER, t.group.id);
    expect(ids(list).sort()).toEqual([OWNER, A, B, C, R].sort());
    expect(roleOfIn(list, R)).toBe('reserve');
    await expectAppError(t.groups.acceptInvite(D, tokenOf(t.group)), 'GROUP_MEMBERS_FULL', 409);
    await expectAppError(t.groups.acceptInvite(D, reserveTokenOf(t.group)), 'GROUP_RESERVES_FULL', 409);
    await t.groups.removeMember(OWNER, t.group.id, pub(A));
    // 3 membros (dono, B, C) ainda passam do limite de 2.
    const fresh = await t.groups.get(OWNER, t.group.id);
    await expectAppError(t.groups.acceptInvite(D, tokenOf(fresh)), 'GROUP_MEMBERS_FULL', 409);
  });

  it('GRP-38: com 0 reservas o grupo não aceita reservas', async () => {
    const t = await setup({ maxReserves: 0 });
    await expectAppError(t.groups.acceptInvite(R, reserveTokenOf(t.group)), 'GROUP_RESERVES_FULL', 409);
    await expectAppError(t.groups.get(R, t.group.id), 'GROUP_NOT_FOUND', 404);
  });
});

describe('entrar pelo link com limite (GRP-02, GRP-39)', () => {
  it('GRP-02: membros no limite (o dono conta) → o link de membro dá GROUP_MEMBERS_FULL e a pessoa não entra', async () => {
    const t = await setup({ maxMembers: 3, members: [A, B] });
    await expectAppError(t.groups.acceptInvite(C, tokenOf(t.group)), 'GROUP_MEMBERS_FULL', 409);
    await expectAppError(t.groups.get(C, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(t.store.countOf(t.group.id, 'member')).toBe(3);
  });

  it('GRP-02: membros no limite → a reserva que abre o link de membro continua reserva', async () => {
    const t = await setup({ maxMembers: 2, members: [A], reserves: [R] });
    await expectAppError(t.groups.acceptInvite(R, tokenOf(t.group)), 'GROUP_MEMBERS_FULL', 409);
    expect(roleOfIn(await t.groups.members(OWNER, t.group.id), R)).toBe('reserve');
    expect(t.store.membershipOf(t.group.id, R)?.tier).toBe('reserve');
  });

  it('GRP-02: reservas no limite → o link de reserva dá GROUP_RESERVES_FULL', async () => {
    const t = await setup({ maxReserves: 1, reserves: [R] });
    await expectAppError(t.groups.acceptInvite(D, reserveTokenOf(t.group)), 'GROUP_RESERVES_FULL', 409);
    await expectAppError(t.groups.get(D, t.group.id), 'GROUP_NOT_FOUND', 404);
  });

  it('GRP-02: com os limites cheios, membro abrindo o link de reserva e quem entra de novo não mudam nada nem dão erro', async () => {
    const t = await setup({ maxMembers: 2, maxReserves: 1, members: [A], reserves: [R] });
    expect((await t.groups.acceptInvite(A, reserveTokenOf(t.group))).myTier).toBe('member');
    expect((await t.groups.acceptInvite(A, tokenOf(t.group))).myTier).toBe('member');
    expect((await t.groups.acceptInvite(R, reserveTokenOf(t.group))).myTier).toBe('reserve');
    expect(t.store.countOf(t.group.id, 'member')).toBe(2);
    expect(t.store.countOf(t.group.id, 'reserve')).toBe(1);
  });

  it('GRP-39: a reserva que vira membro pelo link ocupa um lugar de membro e libera um de reserva', async () => {
    const t = await setup({ maxMembers: 3, maxReserves: 1, members: [A], reserves: [R] });
    expect((await t.groups.acceptInvite(R, tokenOf(t.group))).myTier).toBe('member');
    expect(t.store.countOf(t.group.id, 'member')).toBe(3);
    expect(t.store.countOf(t.group.id, 'reserve')).toBe(0);
    expect((await t.groups.acceptInvite(D, reserveTokenOf(t.group))).myTier).toBe('reserve');
    await expectAppError(t.groups.acceptInvite(C, tokenOf(t.group)), 'GROUP_MEMBERS_FULL', 409);
  });

  it('GRP-39: duas entradas ao mesmo tempo no último lugar → só uma passa, a outra recebe GROUP_MEMBERS_FULL', async () => {
    const t = await setup({ maxMembers: 2 });
    const results = await Promise.allSettled([
      t.groups.acceptInvite(A, tokenOf(t.group)),
      t.groups.acceptInvite(B, tokenOf(t.group)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toBeInstanceOf(AppError);
    expect(rejected[0]).toMatchObject({ code: 'GROUP_MEMBERS_FULL', status: 409 });
    expect(t.store.countOf(t.group.id, 'member')).toBe(2);
  });

  it('GRP-39: o limite é conferido na gravação: outra entrada gravada depois da leitura → GROUP_MEMBERS_FULL', async () => {
    const t = await setup({ maxMembers: 3, members: [A] });
    t.store.hooks.beforeAddMember.push((groupId) => {
      t.store.insert(groupId, B, 'member');
    });
    await expectAppError(t.groups.acceptInvite(C, tokenOf(t.group)), 'GROUP_MEMBERS_FULL', 409);
    expect(ids(await t.groups.members(OWNER, t.group.id)).sort()).toEqual([OWNER, A, B].sort());
  });

  it('GRP-39: reservas também: outra reserva gravada depois da leitura → GROUP_RESERVES_FULL', async () => {
    const t = await setup({ maxReserves: 1 });
    t.store.hooks.beforeAddMember.push((groupId) => {
      t.store.insert(groupId, R, 'reserve');
    });
    await expectAppError(t.groups.acceptInvite(D, reserveTokenOf(t.group)), 'GROUP_RESERVES_FULL', 409);
    expect(t.store.countOf(t.group.id, 'reserve')).toBe(1);
  });

  it('GRP-39: o dono abaixa o limite no meio (stale) → relê o grupo, tenta de novo e responde GROUP_MEMBERS_FULL', async () => {
    const t = await setup({ maxMembers: 3, members: [A] });
    t.store.hooks.beforeAddMember.push((groupId) => t.store.forceLimit(groupId, 'member', 2));
    await expectAppError(t.groups.acceptInvite(C, tokenOf(t.group)), 'GROUP_MEMBERS_FULL', 409);
    await expectAppError(t.groups.get(C, t.group.id), 'GROUP_NOT_FOUND', 404);
  });

  it('GRP-39: o dono sobe o limite no meio (stale) → relê e entra com o limite novo', async () => {
    const t = await setup({ maxMembers: 3, members: [A] });
    t.store.hooks.beforeAddMember.push((groupId) => t.store.forceLimit(groupId, 'member', 10));
    expect((await t.groups.acceptInvite(C, tokenOf(t.group))).myTier).toBe('member');
    expect(t.store.addCalls.filter((c) => c.userId === C)).toHaveLength(2);
  });

  it('GRP-39: grupo arquivado no meio da entrada (stale) → o link deixou de valer (GRP-31) e ninguém entra', async () => {
    const t = await setup({ members: [A] });
    t.store.hooks.beforeAddMember.push((groupId) =>
      t.store.forceArchive(groupId, THURSDAY_10H.toISOString()),
    );
    await expectAppError(t.groups.acceptInvite(C, tokenOf(t.group)), 'GROUP_INVITE_INVALID', 404);
    expect(t.store.membershipOf(t.group.id, C)).toBeUndefined();
  });
});

describe('remover libera o lugar e apaga o convite (GRP-25)', () => {
  it('GRP-25: remover um membro libera o lugar no limite → outra pessoa entra pelo link novo', async () => {
    const t = await setup({ maxMembers: 2, members: [A] });
    await t.groups.removeMember(OWNER, t.group.id, pub(A));
    expect(t.store.countOf(t.group.id, 'member')).toBe(1);
    const fresh = await t.groups.get(OWNER, t.group.id);
    expect((await t.groups.acceptInvite(B, tokenOf(fresh))).myTier).toBe('member');
  });

  it('GRP-25: remover uma reserva libera o lugar de reserva', async () => {
    const t = await setup({ maxReserves: 1, reserves: [R] });
    await t.groups.removeMember(OWNER, t.group.id, pub(R));
    const fresh = await t.groups.get(OWNER, t.group.id);
    expect((await t.groups.acceptInvite(D, reserveTokenOf(fresh))).myTier).toBe('reserve');
  });

  it('GRP-25: a reserva removida perde o convite para membro pendente', async () => {
    const t = await setup({ reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    await t.groups.removeMember(OWNER, t.group.id, pub(R));
    expect(t.store.removeCalls[0]?.newToken).toBeTypeOf('string');
    const fresh = await t.groups.get(OWNER, t.group.id);
    await t.groups.acceptInvite(R, reserveTokenOf(fresh));
    expect((await t.groups.get(R, t.group.id)).myMemberInvite).toBeUndefined();
    expect(inviteOfIn(await t.groups.members(OWNER, t.group.id), R)).toBeUndefined();
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
  });
});

describe('convite para membro (GRP-40)', () => {
  it('GRP-40: o dono convida a reserva → convite de 7 dias e aviso member_invite com o link do grupo', async () => {
    const t = await setup({ reserves: [R] });
    const invite = await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    expect(MemberInviteSchema.parse(invite)).toEqual(invite);
    expect(invite).toEqual({ userId: pub(R), expiresAt: IN_7_DAYS });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({
      userId: R,
      type: 'member_invite',
      title: 'Convite para ser membro',
      link: `/groups/${t.group.id}`,
    });
    expect(t.sent[0]?.body).toContain(t.group.name);
  });

  it('GRP-40: a reserva vê o convite no grupo, e só o dono vê o prazo na lista de membros', async () => {
    const t = await setup({ members: [A], reserves: [R, D] });
    await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    expect((await t.groups.get(R, t.group.id)).myMemberInvite).toEqual({ expiresAt: IN_7_DAYS });
    expect((await t.groups.get(D, t.group.id)).myMemberInvite).toBeUndefined();
    expect((await t.groups.get(A, t.group.id)).myMemberInvite).toBeUndefined();
    expect((await t.groups.get(OWNER, t.group.id)).myMemberInvite).toBeUndefined();
    expect(inviteOfIn(await t.groups.members(OWNER, t.group.id), R)).toBe(IN_7_DAYS);
    expect(inviteOfIn(await t.groups.members(OWNER, t.group.id), D)).toBeUndefined();
    for (const who of [A, R, D])
      for (const m of await t.groups.members(who, t.group.id))
        expect(m.memberInviteExpiresAt).toBeUndefined();
  });

  it('GRP-40: convidar de novo com o convite pendente devolve o mesmo, sem avisar outra vez', async () => {
    const t = await setup({ reserves: [R] });
    const first = await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    t.clock.now = new Date(THURSDAY_10H.getTime() + 2 * DAY);
    const again = await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    expect(again).toEqual(first);
    expect(ofType(t.sent, 'member_invite')).toEqual([R]);
  });

  it('GRP-40: convite vencido conta como inexistente, e o dono pode convidar de novo (novo prazo e novo aviso)', async () => {
    const t = await setup({ reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    const later = new Date(THURSDAY_10H.getTime() + 7 * DAY + MINUTE);
    t.clock.now = later;
    expect((await t.groups.get(R, t.group.id)).myMemberInvite).toBeUndefined();
    expect(inviteOfIn(await t.groups.members(OWNER, t.group.id), R)).toBeUndefined();
    const again = await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    expect(again.expiresAt).toBe(iso(new Date(later.getTime() + 7 * DAY)));
    expect(ofType(t.sent, 'member_invite')).toEqual([R, R]);
  });

  it('GRP-40: com os membros no limite, convidar responde GROUP_MEMBERS_FULL e ninguém é avisado', async () => {
    const t = await setup({ maxMembers: 2, members: [A], reserves: [R] });
    await expectAppError(t.groups.inviteToMember(OWNER, t.group.id, pub(R)), 'GROUP_MEMBERS_FULL', 409);
    expect(t.store.membershipOf(t.group.id, R)?.memberInviteExpiresAt).toBeUndefined();
    expect(t.sent).toEqual([]);
  });

  it('GRP-40: convidar quem não é reserva (membro, dono ou quem não participa) → GROUP_MEMBER_NOT_FOUND', async () => {
    const t = await withAdmin({ members: [A] });
    await expectAppError(t.groups.inviteToMember(A, t.group.id, pub(OWNER)), 'GROUP_MEMBER_NOT_FOUND', 404);
    for (const who of [A, OUTSIDER])
      await expectAppError(
        t.groups.inviteToMember(OWNER, t.group.id, pub(who)),
        'GROUP_MEMBER_NOT_FOUND',
        404,
      );
    expect(t.sent).toEqual([]);
  });

  it('GRP-40: a reserva vira membro entre a leitura e a gravação (not_reserve) → GROUP_MEMBER_NOT_FOUND, sem aviso', async () => {
    const t = await setup({ reserves: [R] });
    const original = t.store.groups.setMemberInvite;
    t.store.groups.setMemberInvite = async (groupId, userId, expiresAt) => {
      t.store.promote(groupId, userId);
      return original(groupId, userId, expiresAt);
    };
    await expectAppError(t.groups.inviteToMember(OWNER, t.group.id, pub(R)), 'GROUP_MEMBER_NOT_FOUND', 404);
    expect(t.sent).toEqual([]);
  });

  it('GRP-40: sem members.manage, convidar e cancelar → GROUP_PERMISSION_DENIED; quem não participa recebe GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A], reserves: [R, D] });
    await expectDenied(t.groups.inviteToMember(A, t.group.id, pub(R)), 'members.manage');
    await expectDenied(t.groups.inviteToMember(D, t.group.id, pub(R)), 'members.manage');
    await expectDenied(t.groups.cancelMemberInvite(A, t.group.id, pub(R)), 'members.manage');
    await expectAppError(t.groups.inviteToMember(OUTSIDER, t.group.id, pub(R)), 'GROUP_NOT_FOUND', 404);
    expect(t.sent).toEqual([]);
  });

  it('GRP-40: o dono cancela o convite pendente → some da lista e da página da reserva', async () => {
    const t = await setup({ reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    await expect(t.groups.cancelMemberInvite(OWNER, t.group.id, pub(R))).resolves.toBeUndefined();
    expect(inviteOfIn(await t.groups.members(OWNER, t.group.id), R)).toBeUndefined();
    expect((await t.groups.get(R, t.group.id)).myMemberInvite).toBeUndefined();
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
  });

  it('GRP-40: cancelar um convite que não existe não faz nada', async () => {
    const t = await setup({ reserves: [R] });
    await expect(t.groups.cancelMemberInvite(OWNER, t.group.id, pub(R))).resolves.toBeUndefined();
    expect(roleOfIn(await t.groups.members(OWNER, t.group.id), R)).toBe('reserve');
    expect(t.sent).toEqual([]);
  });

  it('GRP-40: o convite não segura o lugar: quem entra antes pelo link de membro fica com ele', async () => {
    const t = await setup({ maxMembers: 3, members: [A], reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    expect((await t.groups.acceptInvite(B, tokenOf(t.group))).myTier).toBe('member');
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBERS_FULL', 409);
  });
});

describe('aceitar ou recusar o convite (GRP-41)', () => {
  it('GRP-41: aceitar faz da reserva membro, com a mesma data de entrada (GRP-03) e o mesmo cargo', async () => {
    const t = await setup({ reserves: [R] });
    const joinedAt = t.store.membershipOf(t.group.id, R)?.createdAt;
    await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    t.clock.now = new Date(THURSDAY_10H.getTime() + DAY);
    const group = await t.groups.acceptMemberInvite(R, t.group.id);
    expect(GroupSchema.parse(group)).toEqual(group);
    expect(group.myTier).toBe('member');
    expect(group.myMemberInvite).toBeUndefined();
    expect(t.store.membershipOf(t.group.id, R)).toEqual({
      userId: R,
      tier: 'member',
      roleId: 'member',
      createdAt: joinedAt,
    });
    expect(t.store.membershipOf(t.group.id, R)?.memberInviteExpiresAt).toBeUndefined();
    expect(roleOfIn(await t.groups.members(OWNER, t.group.id), R)).toBe('member');
    expect(t.store.countOf(t.group.id, 'member')).toBe(2);
    expect(t.store.countOf(t.group.id, 'reserve')).toBe(0);
  });

  it('GRP-41: aceitar sem lugar → GROUP_MEMBERS_FULL, continua reserva e o convite continua valendo', async () => {
    const t = await setup({ maxMembers: 3, members: [A], reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    await t.groups.acceptInvite(B, tokenOf(t.group));
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBERS_FULL', 409);
    expect(roleOfIn(await t.groups.members(OWNER, t.group.id), R)).toBe('reserve');
    expect((await t.groups.get(R, t.group.id)).myMemberInvite).toEqual({ expiresAt: IN_7_DAYS });
    await t.groups.removeMember(OWNER, t.group.id, pub(B));
    expect((await t.groups.acceptMemberInvite(R, t.group.id)).myTier).toBe('member');
  });

  it('GRP-41: o limite é conferido na gravação do aceite: outra entrada no meio → GROUP_MEMBERS_FULL', async () => {
    const t = await setup({ maxMembers: 3, members: [A], reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    t.store.hooks.beforeAddMember.push((groupId) => t.store.insert(groupId, B, 'member'));
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBERS_FULL', 409);
    expect(roleOfIn(await t.groups.members(OWNER, t.group.id), R)).toBe('reserve');
  });

  it('GRP-41: recusar apaga o convite e o dono não é avisado', async () => {
    const t = await setup({ reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    await expect(t.groups.declineMemberInvite(R, t.group.id)).resolves.toBeUndefined();
    expect(inviteOfIn(await t.groups.members(OWNER, t.group.id), R)).toBeUndefined();
    expect((await t.groups.get(R, t.group.id)).myMemberInvite).toBeUndefined();
    expect(roleOfIn(await t.groups.members(OWNER, t.group.id), R)).toBe('reserve');
    expect(t.sent.map((n) => n.type)).toEqual(['member_invite']);
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
  });

  it('GRP-41: aceitar ou recusar sem convite pendente → GROUP_MEMBER_INVITE_INVALID', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    for (const who of [R, A]) {
      await expectAppError(t.groups.acceptMemberInvite(who, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
      await expectAppError(t.groups.declineMemberInvite(who, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
    }
  });

  it('GRP-41: convite vencido (no prazo exato ou depois) → GROUP_MEMBER_INVITE_INVALID e continua reserva', async () => {
    const t = await setup({ reserves: [R, D] });
    await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    await t.groups.inviteToMember(OWNER, t.group.id, pub(D));
    t.clock.now = new Date(IN_7_DAYS);
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
    t.clock.now = new Date(new Date(IN_7_DAYS).getTime() + MINUTE);
    await expectAppError(t.groups.declineMemberInvite(D, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
    expect(roleOfIn(await t.groups.members(OWNER, t.group.id), R)).toBe('reserve');
  });

  it('GRP-41: convite já usado → aceitar de novo dá GROUP_MEMBER_INVITE_INVALID', async () => {
    const t = await setup({ reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    await t.groups.acceptMemberInvite(R, t.group.id);
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
  });

  it('GRP-41: a reserva que vira membro pelo link de membro perde o convite pendente', async () => {
    const t = await setup({ reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    expect((await t.groups.acceptInvite(R, tokenOf(t.group))).myTier).toBe('member');
    expect(inviteOfIn(await t.groups.members(OWNER, t.group.id), R)).toBeUndefined();
    expect(t.store.membershipOf(t.group.id, R)?.memberInviteExpiresAt).toBeUndefined();
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
  });

  it('GRP-41: quem não participa aceita ou recusa → GROUP_NOT_FOUND (GRP-04)', async () => {
    const t = await setup();
    await expectAppError(t.groups.acceptMemberInvite(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.groups.declineMemberInvite(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
  });
});

describe('sair do grupo (GRP-42)', () => {
  it('GRP-42: o membro sai → perde o acesso, o grupo some de "meus grupos" e o link de membro não muda', async () => {
    const t = await setup({ members: [A] });
    const before = t.store.storedGroup(t.group.id);
    await expect(t.groups.leave(A, t.group.id)).resolves.toBeUndefined();
    await expectAppError(t.groups.get(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(await t.groups.myGroups(A)).toEqual([]);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER]);
    const after = t.store.storedGroup(t.group.id);
    for (const kind of KINDS) expect(after?.[TOKEN_FIELD[kind]]).toBe(before?.[TOKEN_FIELD[kind]]);
    expect(t.store.removeCalls.at(-1)?.newToken).toBeUndefined();
    expect(t.sent).toEqual([]);
  });

  it('GRP-42: o dono não pode sair → GROUP_OWNER_NOT_REMOVABLE', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(t.groups.leave(OWNER, t.group.id), 'GROUP_OWNER_NOT_REMOVABLE', 409);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toContain(OWNER);
    expect(t.store.removeCalls).toEqual([]);
  });

  it('GRP-42: quem estava dentro do jogo aberto sai → perde a vaga, o 1º da fila sobe e é avisado (GRP-22)', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.groups.leave(A, t.group.id);
    const game = await t.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([B, C]);
    expect(game.waitlist).toEqual([]);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([C]);
    expect(t.sent).toHaveLength(1);
  });

  it('GRP-42: jogo cancelado → a vaga sai e ninguém é avisado de promoção', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.games.cancel(OWNER, t.group.id, t.gameId);
    t.sent.splice(0);
    await t.groups.leave(A, t.group.id);
    expect(ids((await t.current(OWNER, t.group.id)).confirmed)).toEqual([B, C]);
    expect(t.sent).toEqual([]);
  });

  it('GRP-42: jogo em andamento → a vaga fica', async () => {
    const t = await setup({ slots: 2, members: [A, B] });
    await t.confirmInOrder(A, B);
    t.clock.now = FRIDAY_20H;
    await t.groups.leave(A, t.group.id);
    const game = await t.current(OWNER, t.group.id);
    expect(game.status).toBe('in_progress');
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(t.sent).toEqual([]);
  });

  it('GRP-42: sair libera o lugar no limite do papel, e quem saiu pode voltar pelo mesmo link', async () => {
    const t = await setup({ maxMembers: 2, maxReserves: 1, members: [A], reserves: [R] });
    await t.groups.leave(A, t.group.id);
    await t.groups.leave(R, t.group.id);
    expect(t.store.countOf(t.group.id, 'member')).toBe(1);
    expect(t.store.countOf(t.group.id, 'reserve')).toBe(0);
    expect((await t.groups.acceptInvite(D, reserveTokenOf(t.group))).myTier).toBe('reserve');
    expect((await t.groups.acceptInvite(A, tokenOf(t.group))).myTier).toBe('member');
  });

  it('GRP-42: a reserva que sai perde o convite pendente', async () => {
    const t = await setup({ reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    await t.groups.leave(R, t.group.id);
    await t.groups.acceptInvite(R, reserveTokenOf(t.group));
    expect((await t.groups.get(R, t.group.id)).myMemberInvite).toBeUndefined();
    expect(inviteOfIn(await t.groups.members(OWNER, t.group.id), R)).toBeUndefined();
  });

  it('GRP-42: removida no meio da saída (not_member) → GROUP_MEMBER_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    t.store.removeScript.push(() => 'not_member');
    await expectAppError(t.groups.leave(A, t.group.id), 'GROUP_MEMBER_NOT_FOUND', 404);
    expect(t.sent).toEqual([]);
  });

  it('GRP-42: o papel mudou no meio (stale) → relê e sai com o papel novo', async () => {
    const t = await setup({ reserves: [R] });
    t.store.removeScript.push((args) => {
      t.store.promote(args.group.id, args.userId);
      return 'stale';
    });
    await t.groups.leave(R, t.group.id);
    expect(t.store.removeCalls).toHaveLength(2);
    expect(t.store.removeCalls[0]?.tier).toBe('reserve');
    expect(t.store.removeCalls[1]?.tier).toBe('member');
    expect(t.store.membershipOf(t.group.id, R)).toBeUndefined();
  });

  it('GRP-42: quem não participa tenta sair → GROUP_NOT_FOUND (GRP-04)', async () => {
    const t = await setup();
    await expectAppError(t.groups.leave(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
  });
});

describe('grupo arquivado barra limites, convite e saída (GRP-32)', () => {
  it('GRP-32: mudar os limites, convidar, cancelar o convite, aceitar, recusar e sair → GROUP_ARCHIVED e nada muda', async () => {
    const t = await setup({ members: [A], reserves: [R, D] });
    await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    await t.groups.inviteToMember(OWNER, t.group.id, pub(D));
    await t.groups.archive(OWNER, t.group.id);
    t.sent.splice(0);
    const before = t.store.storedGroup(t.group.id);
    await expectAppError(
      t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), maxMembers: 5 }),
      'GROUP_ARCHIVED',
      409,
    );
    await expectAppError(t.groups.inviteToMember(OWNER, t.group.id, pub(R)), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.groups.cancelMemberInvite(OWNER, t.group.id, pub(R)), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.groups.declineMemberInvite(D, t.group.id), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.groups.leave(A, t.group.id), 'GROUP_ARCHIVED', 409);
    expect(t.store.storedGroup(t.group.id)).toEqual(before);
    const list = await t.groups.members(OWNER, t.group.id);
    expect(ids(list).sort()).toEqual([OWNER, A, R, D].sort());
    expect(roleOfIn(list, R)).toBe('reserve');
    expect(inviteOfIn(list, R)).toBe(IN_7_DAYS);
    expect(inviteOfIn(list, D)).toBe(IN_7_DAYS);
    expect(t.store.removeCalls).toEqual([]);
    expect(t.sent).toEqual([]);
  });
});

const CONFIRMED_TITLE = 'Jogo confirmado';
const CONFIRMED_BODY = `O jogo de ${INPUT.name} de 06/11 vai acontecer: a lista chegou ao mínimo.`;

describe('vagas padrão e por jogo (GRP-45, GRP-16)', () => {
  it('GRP-45 (contrato): vagas do jogo de 2 a 50 ou null; mínimo de 2 a 50 ou null; pedido vazio é recusado', () => {
    for (const ok of [{ slots: 2 }, { slots: 50 }, { slots: null }, { minPlayers: 2 }, { minPlayers: null }])
      expect(UpdateGameInputSchema.safeParse({ version: 0, ...ok }).success).toBe(true);
    for (const bad of [{}, { slots: 1 }, { slots: 51 }, { minPlayers: 1 }, { minPlayers: 51 }])
      expect(UpdateGameInputSchema.safeParse({ version: 0, ...bad }).success).toBe(false);
    expect(UpdateGameInputSchema.safeParse({ slots: 14 }).success).toBe(false);
  });

  it('GRP-45: o dono muda as vagas só do jogo → o jogo marca slotsCustom e o padrão do grupo não muda', async () => {
    const t = await setup({ members: [A] });
    const game = await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 14 });
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game).toMatchObject({ date: DATE, slots: 14, slotsCustom: true });
    expect((await t.current(A, t.group.id)).slots).toBe(14);
    expect((await t.groups.get(OWNER, t.group.id)).slots).toBe(12);
    expect(t.store.storedGroup(t.group.id)?.slots).toBe(12);
  });

  it('GRP-45: mudar as vagas do jogo virtual (sem ninguém) grava o jogo e devolve as vagas novas', async () => {
    const t = await setup({ members: [A] });
    expect(t.store.gameCount()).toBe(0);
    const game = await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 14 });
    expect(game.slots).toBe(14);
    expect(t.store.gameCount()).toBe(1);
    expect(t.store.storedGame(t.group.id, DATE)?.slots).toBe(14);
  });

  it('GRP-45: sem valor próprio, o jogo segue o padrão do grupo, inclusive quando ele muda depois', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    const updated = await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), slots: 14 });
    expect(updated.slots).toBe(14);
    const game = await t.current(A, t.group.id);
    expect(game.slots).toBe(14);
    expect(game.slotsCustom).not.toBe(true);
  });

  it('GRP-45: com valor próprio, o padrão do grupo muda sem mexer no jogo; "Usar o padrão" volta ao do grupo', async () => {
    const t = await setup({ members: [A] });
    await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 16 });
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), slots: 14 });
    expect((await t.current(A, t.group.id)).slots).toBe(16);
    const back = await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 1, slots: null });
    expect(back.slots).toBe(14);
    expect(back.slotsCustom).not.toBe(true);
    expect(t.store.storedGame(t.group.id, DATE)?.slots).toBeUndefined();
  });

  it('GRP-22: aumentar as vagas do jogo → quem estava na fila sobe na ordem e recebe waitlist_promoted', async () => {
    const t = await setup({ slots: 2, members: [A, B, C, D] });
    await t.confirmInOrder(A, B, C, D);
    const game = await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 3 });
    expect(ids(game.confirmed)).toEqual([A, B, C]);
    expect(ids(game.waitlist)).toEqual([D]);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([C]);
    expect(t.sent[0]).toMatchObject({ userId: C, type: 'waitlist_promoted', link: `/groups/${t.group.id}` });
  });

  it('GRP-22: aumentar duas vagas → os dois primeiros da fila sobem e são avisados', async () => {
    const t = await setup({ slots: 2, members: [A, B, C, D] });
    await t.confirmInOrder(A, B, C, D);
    const game = await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 4 });
    expect(ids(game.confirmed)).toEqual([A, B, C, D]);
    expect(game.waitlist).toEqual([]);
    expect(ofType(t.sent, 'waitlist_promoted').sort()).toEqual([C, D].sort());
  });

  it('GRP-22: o convidado que sobe com mais vagas recebe o link do jogo', async () => {
    const t = await setup({
      slots: 2,
      members: [A, B],
      reservesOpenHoursBefore: 48,
      guestsOpenHoursBefore: 48,
    });
    await t.confirmInOrder(A, B);
    await t.guestConfirmInOrder(G);
    await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 3 });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({
      userId: G,
      type: 'waitlist_promoted',
      link: `/play/${guestTokenOf(t.group)}`,
    });
  });

  it('GRP-22: aumentar o padrão do grupo (jogo sem valor próprio) → a fila sobe com aviso', async () => {
    const t = await setup({ slots: 2, members: [A, B, C, D] });
    await t.confirmInOrder(A, B, C, D);
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), slots: 3 });
    const game = await t.current(A, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B, C]);
    expect(ids(game.waitlist)).toEqual([D]);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([C]);
  });

  it('GRP-45: diminuir as vagas do jogo abaixo de quem está dentro → GAME_SLOTS_BELOW_CONFIRMED com confirmed e nada muda', async () => {
    const t = await setup({ members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    const err = await expectAppError(
      t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 2 }),
      'GAME_SLOTS_BELOW_CONFIRMED',
      409,
    );
    expect(err.details).toEqual({ confirmed: 3 });
    const game = await t.current(A, t.group.id);
    expect(game.slots).toBe(12);
    expect(ids(game.confirmed)).toEqual([A, B, C]);
  });

  it('GRP-45: confirmed conta só quem está dentro (a fila não entra)', async () => {
    const t = await setup({ slots: 3, members: [A, B, C, D] });
    await t.confirmInOrder(A, B, C, D);
    const err = await expectAppError(
      t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 2 }),
      'GAME_SLOTS_BELOW_CONFIRMED',
      409,
    );
    expect(err.details).toEqual({ confirmed: 3 });
  });

  it('GRP-45: diminuir até o número de quem está dentro é aceito', async () => {
    const t = await setup({ members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    const game = await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 3 });
    expect(game.slots).toBe(3);
    expect(ids(game.confirmed)).toEqual([A, B, C]);
  });

  it('GRP-45: "Usar o padrão" com menos vagas do que quem está dentro → GAME_SLOTS_BELOW_CONFIRMED', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 4 });
    await t.confirmInOrder(A, B, C);
    const err = await expectAppError(
      t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 1, slots: null }),
      'GAME_SLOTS_BELOW_CONFIRMED',
      409,
    );
    expect(err.details).toEqual({ confirmed: 3 });
    expect((await t.current(A, t.group.id)).slots).toBe(4);
  });

  it('GRP-45: diminuir o padrão do grupo abaixo de quem está dentro (jogo sem valor próprio) → erro e nada gravado', async () => {
    const t = await setup({ members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    const err = await expectAppError(
      t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), slots: 2 }),
      'GAME_SLOTS_BELOW_CONFIRMED',
      409,
    );
    expect(err.details).toEqual({ confirmed: 3 });
    expect(t.store.storedGroup(t.group.id)?.slots).toBe(12);
  });

  it('GRP-45: com vagas próprias no jogo, diminuir o padrão do grupo não confere o jogo nem promove', async () => {
    const t = await setup({ slots: 2, members: [A, B, C, D] });
    await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 3 });
    await t.confirmInOrder(A, B, C, D);
    const updated = await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), slots: 2 });
    expect(updated.slots).toBe(2);
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), slots: 10 });
    const game = await t.current(A, t.group.id);
    expect(game.slots).toBe(3);
    expect(ids(game.waitlist)).toEqual([D]);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([]);
  });

  it('GRP-45: com o jogo cancelado, mudar o padrão do grupo não confere o jogo', async () => {
    const t = await setup({ members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.games.cancel(OWNER, t.group.id, t.gameId);
    const updated = await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), slots: 2 });
    expect(updated.slots).toBe(2);
  });

  it('GRP-45: as vagas do jogo valem em toda conta (jogo, link do jogo, meus grupos, posição e promoção ao desistir)', async () => {
    const t = await setup({
      slots: 2,
      members: [A, B, C, D],
      reservesOpenHoursBefore: 48,
      guestsOpenHoursBefore: 48,
    });
    await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 3 });
    await t.confirmInOrder(A, B, C, D);
    const seen = await t.current(C, t.group.id);
    expect(seen.slots).toBe(3);
    expect(seen.me).toEqual({ list: 'confirmed', position: 3 });
    expect((await t.current(D, t.group.id)).me).toEqual({ list: 'waitlist', position: 1 });
    const mine = (await t.groups.myGroups(A)).find((g) => g.id === t.group.id);
    expect(mine?.game).toMatchObject({ slots: 3, confirmedCount: 3 });
    const view = await t.games.guestView(G, guestTokenOf(t.group));
    expect(view.games[0]?.slots).toBe(3);
    expect(ids(view.games[0]?.confirmed ?? [])).toEqual([A, B, C]);
    await t.games.leave(A, t.group.id, t.gameId);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([D]);
  });

  it('GRP-45: remover alguém de dentro usa as vagas do jogo para promover', async () => {
    const t = await setup({ slots: 2, members: [A, B, C, D] });
    await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 3 });
    await t.confirmInOrder(A, B, C, D);
    await t.groups.removeMember(OWNER, t.group.id, pub(B));
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([D]);
  });

  it('GRP-45: mudar o jogo em andamento → GAME_CLOSED', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    t.clock.now = FRIDAY_20H;
    await expectAppError(
      t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 14 }),
      'GAME_CLOSED',
      409,
    );
  });

  it('GRP-45: mudar o jogo cancelado → GAME_CANCELLED', async () => {
    const t = await setup({ members: [A] });
    await t.games.cancel(OWNER, t.group.id, t.gameId);
    await expectAppError(
      t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 14 }),
      'GAME_CANCELLED',
      409,
    );
  });

  it('GRP-45: outra data que não a do jogo atual → GAME_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(
      t.games.updateGame(OWNER, t.group.id, t.gameAt(NEXT_DATE), { version: 0, slots: 14 }),
      'GAME_NOT_FOUND',
      404,
    );
  });

  it('GRP-45: membro ou reserva sem cargo muda o jogo → GROUP_PERMISSION_DENIED (game.manage); quem não participa → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    for (const who of [A, R])
      await expectDenied(
        t.games.updateGame(who, t.group.id, t.gameId, { version: 0, slots: 14 }),
        'game.manage',
      );
    await expectAppError(
      t.games.updateGame(OUTSIDER, t.group.id, t.gameId, { version: 0, slots: 14 }),
      'GROUP_NOT_FOUND',
      404,
    );
    expect((await t.current(A, t.group.id)).slots).toBe(12);
  });

  it('GRP-45: grupo arquivado → GROUP_ARCHIVED', async () => {
    const t = await setup({ members: [A] });
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(
      t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 14 }),
      'GROUP_ARCHIVED',
      409,
    );
  });

  it('GRP-16: quem não tem settings.edit muda as vagas ou o mínimo do grupo → GROUP_PERMISSION_DENIED e nada muda', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    for (const who of [A, R]) {
      await expectDenied(
        t.groups.update(who, t.group.id, { ...t.sv(t.group.id), slots: 14 }),
        'settings.edit',
      );
      await expectDenied(
        t.groups.update(who, t.group.id, { ...t.sv(t.group.id), minPlayers: 4 }),
        'settings.edit',
      );
    }
    expect(t.store.storedGroup(t.group.id)?.slots).toBe(12);
    expect(t.store.storedGroup(t.group.id)?.minPlayers).toBeUndefined();
  });
});

describe('mínimo para o jogo acontecer (GRP-46)', () => {
  it('GRP-46: grupo novo nasce sem mínimo, e o jogo também', async () => {
    const t = await setup({ members: [A] });
    expect(t.group.minPlayers).toBeUndefined();
    expect((await t.current(A, t.group.id)).minPlayers).toBeUndefined();
  });

  it('GRP-46: o dono liga o mínimo do grupo → o grupo, o jogo e "meus grupos" mostram o mínimo', async () => {
    const t = await setup({ members: [A] });
    const updated = await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 10 });
    expect(updated.minPlayers).toBe(10);
    expect(GroupSchema.parse(updated)).toBeTruthy();
    const game = await t.current(A, t.group.id);
    expect(game.minPlayers).toBe(10);
    expect(game.minPlayersCustom).not.toBe(true);
    const mine = (await t.groups.myGroups(A)).find((g) => g.id === t.group.id);
    expect(mine?.game.minPlayers).toBe(10);
    expect(MyGroupSchema.parse(mine)).toBeTruthy();
  });

  it('GRP-46: mínimo null desliga o mínimo do grupo', async () => {
    const t = await setup({ members: [A] });
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 10 });
    const updated = await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: null });
    expect(updated.minPlayers).toBeUndefined();
    expect(t.store.storedGroup(t.group.id)?.minPlayers).toBeUndefined();
    expect((await t.current(A, t.group.id)).minPlayers).toBeUndefined();
  });

  it('GRP-46: mínimo do grupo acima das vagas → GROUP_MIN_PLAYERS_INVALID com max = vagas e nada gravado', async () => {
    const t = await setup();
    const err = await expectAppError(
      t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 13 }),
      'GROUP_MIN_PLAYERS_INVALID',
      422,
    );
    expect(err.details).toEqual({ max: 12 });
    expect(t.store.storedGroup(t.group.id)?.minPlayers).toBeUndefined();
  });

  it('GRP-46: vagas e mínimo no mesmo pedido → confere contra as vagas novas', async () => {
    const t = await setup();
    const err = await expectAppError(
      t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), slots: 8, minPlayers: 10 }),
      'GROUP_MIN_PLAYERS_INVALID',
      422,
    );
    expect(err.details).toEqual({ max: 8 });
    expect(t.store.storedGroup(t.group.id)?.slots).toBe(12);
    const ok = await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), slots: 14, minPlayers: 14 });
    expect(ok).toMatchObject({ slots: 14, minPlayers: 14 });
  });

  it('GRP-46: baixar as vagas do grupo abaixo do mínimo gravado → GROUP_MIN_PLAYERS_INVALID', async () => {
    const t = await setup();
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 10 });
    const err = await expectAppError(
      t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), slots: 8 }),
      'GROUP_MIN_PLAYERS_INVALID',
      422,
    );
    expect(err.details).toEqual({ max: 8 });
    expect(t.store.storedGroup(t.group.id)?.slots).toBe(12);
  });

  it('GRP-46: o dono muda o mínimo só do jogo → minPlayersCustom e o grupo não muda', async () => {
    const t = await setup({ members: [A] });
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 10 });
    const game = await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, minPlayers: 8 });
    expect(game).toMatchObject({ minPlayers: 8, minPlayersCustom: true });
    expect(t.store.storedGroup(t.group.id)?.minPlayers).toBe(10);
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 6 });
    expect((await t.current(A, t.group.id)).minPlayers).toBe(8);
  });

  it('GRP-46: mínimo do jogo null volta ao mínimo do grupo', async () => {
    const t = await setup({ members: [A] });
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 10 });
    await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, minPlayers: 8 });
    const back = await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 1, minPlayers: null });
    expect(back.minPlayers).toBe(10);
    expect(back.minPlayersCustom).not.toBe(true);
    expect(t.store.storedGame(t.group.id, DATE)?.minPlayers).toBeUndefined();
  });

  it('GRP-46: mínimo do jogo acima das vagas do jogo → GROUP_MIN_PLAYERS_INVALID com max = vagas', async () => {
    const t = await setup({ members: [A] });
    const err = await expectAppError(
      t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, minPlayers: 13 }),
      'GROUP_MIN_PLAYERS_INVALID',
      422,
    );
    expect(err.details).toEqual({ max: 12 });
    await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 6 });
    const err2 = await expectAppError(
      t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 1, minPlayers: 8 }),
      'GROUP_MIN_PLAYERS_INVALID',
      422,
    );
    expect(err2.details).toEqual({ max: 6 });
    expect((await t.current(A, t.group.id)).minPlayers).toBeUndefined();
  });

  it('GRP-46: vagas e mínimo do jogo no mesmo pedido → confere contra as vagas novas do jogo', async () => {
    const t = await setup({ members: [A] });
    const err = await expectAppError(
      t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 6, minPlayers: 8 }),
      'GROUP_MIN_PLAYERS_INVALID',
      422,
    );
    expect(err.details).toEqual({ max: 6 });
    expect((await t.current(A, t.group.id)).slots).toBe(12);
  });

  it('GRP-46: baixar as vagas do jogo abaixo do mínimo que vale → GROUP_MIN_PLAYERS_INVALID', async () => {
    const t = await setup({ members: [A] });
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 10 });
    const err = await expectAppError(
      t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 8 }),
      'GROUP_MIN_PLAYERS_INVALID',
      422,
    );
    expect(err.details).toEqual({ max: 8 });
  });

  it('GRP-46: o jogo não é cancelado sozinho por não chegar ao mínimo', async () => {
    const t = await setup({ members: [A, B] });
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 10 });
    await t.confirmInOrder(A, B);
    t.clock.now = FRIDAY_20H;
    const game = await t.current(A, t.group.id);
    expect(game.status).toBe('in_progress');
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ofType(t.sent, 'game_cancelled')).toEqual([]);
  });
});

describe('aviso de jogo confirmado (GRP-47)', () => {
  it('GRP-47: a confirmação que chega ao mínimo avisa todos da lista com game_confirmed, menos quem confirmou (o dono também recebe)', async () => {
    const t = await setup({ members: [A, B] });
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 3 });
    await t.confirmInOrder(OWNER, A);
    expect(ofType(t.sent, 'game_confirmed')).toEqual([]);
    await t.confirmInOrder(B);
    expect(ofType(t.sent, 'game_confirmed').sort()).toEqual([OWNER, A].sort());
    for (const n of t.sent.filter((x) => x.type === 'game_confirmed'))
      expect(n).toMatchObject({
        title: CONFIRMED_TITLE,
        body: CONFIRMED_BODY,
        link: `/groups/${t.group.id}`,
      });
  });

  it('GRP-47: só na primeira vez: cair e voltar ao mínimo não avisa de novo', async () => {
    const t = await setup({ members: [A, B, C] });
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 2 });
    await t.confirmInOrder(A, B);
    expect(ofType(t.sent, 'game_confirmed')).toEqual([A]);
    await t.games.leave(B, t.group.id, t.gameId);
    t.tick();
    await t.confirmInOrder(B, C);
    expect(ofType(t.sent, 'game_confirmed')).toEqual([A]);
  });

  it('GRP-47: quem confirma depois de o jogo já ter chegado ao mínimo não recebe o aviso', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 2 });
    await t.confirmInOrder(A, B, C);
    expect(ofType(t.sent, 'game_confirmed')).toEqual([A]);
  });

  it('GRP-47: ligar um mínimo que a lista já atinge avisa todos, dentro e fila', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    expect(ofType(t.sent, 'game_confirmed')).toEqual([]);
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 2 });
    expect(ofType(t.sent, 'game_confirmed').sort()).toEqual([A, B, C].sort());
  });

  it('GRP-47: baixar o mínimo do jogo até a lista avisa', async () => {
    const t = await setup({ members: [A, B, C] });
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 4 });
    await t.confirmInOrder(A, B, C);
    expect(ofType(t.sent, 'game_confirmed')).toEqual([]);
    await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, minPlayers: 3 });
    expect(ofType(t.sent, 'game_confirmed').sort()).toEqual([A, B, C].sort());
  });

  it('GRP-47: mais vagas que fazem chegar ao mínimo avisam (e quem subiu também recebe a promoção)', async () => {
    const t = await setup({ slots: 2, members: [A, B, C, D] });
    await t.confirmInOrder(A, B, C, D);
    await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, slots: 4, minPlayers: 4 });
    expect(ofType(t.sent, 'game_confirmed').sort()).toEqual([A, B, C, D].sort());
    expect(ofType(t.sent, 'waitlist_promoted').sort()).toEqual([C, D].sort());
  });

  it('GRP-47: o convidado recebe o link do jogo', async () => {
    const t = await setup({ members: [A, B], reservesOpenHoursBefore: 48, guestsOpenHoursBefore: 48 });
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 3 });
    await t.confirmInOrder(A);
    await t.guestConfirmInOrder(G);
    await t.confirmInOrder(B);

    const toGuest = t.sent.find((n) => n.type === 'game_confirmed' && n.userId === G);
    expect(toGuest).toMatchObject({ link: `/play/${guestTokenOf(t.group)}` });
    const toMember = t.sent.find((n) => n.type === 'game_confirmed' && n.userId === A);
    expect(toMember).toMatchObject({ link: `/groups/${t.group.id}` });
  });

  it('GRP-47: sem mínimo, a lista cheia não avisa', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    expect(ofType(t.sent, 'game_confirmed')).toEqual([]);
  });

  it('GRP-47: jogo sem ninguém (virtual) não tem a quem avisar', async () => {
    const t = await setup({ members: [A] });
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 2 });
    expect(t.sent).toEqual([]);
  });

  it('GRP-47: mudar o mínimo do grupo com mínimo próprio no jogo não avisa', async () => {
    const t = await setup({ members: [A, B, C] });
    await t.games.updateGame(OWNER, t.group.id, t.gameId, { version: 0, minPlayers: 4 });
    await t.confirmInOrder(A, B, C);
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 2 });
    expect(ofType(t.sent, 'game_confirmed')).toEqual([]);
    expect((await t.current(A, t.group.id)).minPlayers).toBe(4);
  });

  it('GRP-47: se outra escrita já marcou o jogo como confirmado, esta não avisa', async () => {
    const t = await setup({ members: [A, B] });
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 2 });
    await t.confirmInOrder(A);
    t.store.hooks.beforeMarkMinReached.push((gameId) => t.store.forceMinReached(gameId, iso(t.clock.now)));
    await t.confirmInOrder(B);
    expect(t.store.markMinReachedCalls).toHaveLength(1);
    expect(ofType(t.sent, 'game_confirmed')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Id público (USR-15–17, docs/modules/usuarios.md): toda saída identifica pessoas pelo id público; a entrada sobre
// outra pessoa recebe o público e traduz na borda; o id do sistema só existe por dentro.

/** Todos os ids do sistema do teste: nenhum pode aparecer numa resposta. */
const SYSTEM_IDS = USERS.map((u) => u.id);
const leaksSystemId = (value: unknown) => SYSTEM_IDS.some((id) => JSON.stringify(value).includes(id));
const UNKNOWN = PublicUserIdSchema.parse('ZZZZZZZZ');

describe('id público nas respostas dos grupos (USR-16)', () => {
  it('GRP-55: o grupo não diz mais quem é o dono (sem `ownerId` nem `ownerPublicId`), nem vaza o id do sistema (USR-16)', async () => {
    const s = setupServices();
    const created = await s.groups.create(OWNER, INPUT);
    const read = await s.groups.get(OWNER, created.id);
    const [mine] = await s.groups.myGroups(OWNER);
    for (const g of [created, read, mine]) {
      expect(g).not.toHaveProperty('ownerId');
      expect(g).not.toHaveProperty('ownerPublicId');
      expect(g).toMatchObject({ myTier: 'member', myRoleId: 'owner' });
      expect(leaksSystemId(g)).toBe(false);
    }
    // ADR 0015: o dono fica só no cargo da participação dele, não copiado no grupo.
    expect(s.store.storedGroup(created.id)).not.toHaveProperty('ownerId');
    expect(s.store.storedGroup(created.id)).not.toHaveProperty('ownerPublicId');
    expect(s.store.roleIdIn(created.id, OWNER)).toBe('owner');
  });

  it('USR-16: membros, lista do jogo e página do convidado só com ids públicos', async () => {
    const t = await setup({
      slots: 2,
      members: [A, B],
      reserves: [R],
      reservesOpenHoursBefore: 48,
      guestsOpenHoursBefore: 48,
    });
    await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    await t.confirmInOrder(A, B);
    await t.guestConfirmInOrder(G);
    const members = await t.groups.members(OWNER, t.group.id);
    expect(members.map((m) => m.userId)).toEqual([pub(OWNER), pub(A), pub(B), pub(R)]);
    const game = await t.current(OWNER, t.group.id);
    expect(game.confirmed.map((x) => x.userId)).toEqual([pub(A), pub(B)]);
    expect(game.waitlist.map((x) => x.userId)).toEqual([pub(G)]);
    const guest = await t.games.guestView(G, guestTokenOf(t.group));
    expect(guest.games[0]?.waitlist.map((x) => x.userId)).toEqual([pub(G)]);
    for (const out of [members, game, guest]) expect(leaksSystemId(out)).toBe(false);
  });

  it('USR-16: o convite para membro devolve o id público da reserva', async () => {
    const t = await setup({ reserves: [R] });
    const invite = await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    expect(invite.userId).toBe(pub(R));
    expect(leaksSystemId(invite)).toBe(false);
  });

  it('USR-16: o roster interno (para os times) leva os dois ids; a resposta pública é a mesma lista, com o público', async () => {
    const t = await setup({ members: [A], reserves: [R], reservesOpenHoursBefore: 48 });
    await t.confirmInOrder(A, R);
    const records = await t.groups.memberRecords(OWNER, t.group.id);
    expect(records.map((m) => [m.userId, m.publicId])).toEqual([
      [OWNER, pub(OWNER)],
      [A, pub(A)],
      [R, pub(R)],
    ]);
    const roster = await t.games.gameRoster(OWNER, t.group.id, t.gameId);
    expect((await t.games.upcomingRoster(OWNER, t.group.id))[0]?.confirmed).toEqual(roster.confirmed);
    expect(roster.confirmed.map((x) => [x.userId, x.publicId])).toEqual([
      [A, pub(A)],
      [R, pub(R)],
    ]);
    const game = await t.current(OWNER, t.group.id);
    expect(game.confirmed.map((x) => x.userId)).toEqual(roster.confirmed.map((x) => x.publicId));
  });
});

describe('ação sobre outra pessoa pelo id público (USR-17)', () => {
  it('USR-17: remover pelo id público traduz para o id do sistema na entrada', async () => {
    const t = await setup({ members: [A, B] });
    await t.groups.removeMember(OWNER, t.group.id, pub(A));
    expect(t.store.removeCalls.at(-1)).toMatchObject({ userId: A });
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, B]);
  });

  it('USR-17: id público que não existe → GROUP_MEMBER_NOT_FOUND ao remover, convidar e cancelar o convite', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await expectAppError(t.groups.removeMember(OWNER, t.group.id, UNKNOWN), 'GROUP_MEMBER_NOT_FOUND', 404);
    await expectAppError(t.groups.inviteToMember(OWNER, t.group.id, UNKNOWN), 'GROUP_MEMBER_NOT_FOUND', 404);
    await expectAppError(
      t.groups.cancelMemberInvite(OWNER, t.group.id, UNKNOWN),
      'GROUP_MEMBER_NOT_FOUND',
      404,
    );
    expect(t.store.removeCalls).toEqual([]);
    expect(t.sent).toEqual([]);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A, R]);
  });

  it('USR-17: o código desconhecido responde igual a uma pessoa que existe mas não está no grupo', async () => {
    const t = await setup({ members: [A] });
    const unknown = await expectAppError(
      t.groups.removeMember(OWNER, t.group.id, UNKNOWN),
      'GROUP_MEMBER_NOT_FOUND',
      404,
    );
    const outsider = await expectAppError(
      t.groups.removeMember(OWNER, t.group.id, pub(OUTSIDER)),
      'GROUP_MEMBER_NOT_FOUND',
      404,
    );
    expect({ message: unknown.message, details: unknown.details }).toEqual({
      message: outsider.message,
      details: outsider.details,
    });
  });

  it('USR-17: o id do sistema no lugar do público não acha ninguém (GROUP_MEMBER_NOT_FOUND)', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const raw = (id: UserId) => id as unknown as PublicUserId;
    await expectAppError(t.groups.removeMember(OWNER, t.group.id, raw(A)), 'GROUP_MEMBER_NOT_FOUND', 404);
    await expectAppError(t.groups.inviteToMember(OWNER, t.group.id, raw(R)), 'GROUP_MEMBER_NOT_FOUND', 404);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A, R]);
  });

  it('USR-17: a permissão vem de quem pede, não do id recebido (membro não remove nem convida)', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await expectDenied(t.groups.removeMember(A, t.group.id, pub(OWNER)), 'members.manage');
    await expectDenied(t.groups.inviteToMember(A, t.group.id, pub(R)), 'members.manage');
    expect(t.store.removeCalls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Cargos e permissões (GRP-48–55), a parte que não depende de alguém ter cargo.

const EVERY_PERMISSION: Permission[] = [
  'game.manage',
  'members.manage',
  'results.record',
  'seasons.manage',
  'settings.edit',
  'teams.manage',
];
const sorted = (list: readonly string[]) => [...list].sort();

describe('permissões sem cargo (GRP-49, 55)', () => {
  it('GRP-55: o dono recebe todas as permissões no `myPermissions` (ler e criar o grupo)', async () => {
    const s = setupServices();
    const created = await s.groups.create(OWNER, INPUT);
    expect(sorted(created.myPermissions)).toEqual(EVERY_PERMISSION);
    const read = await s.groups.get(OWNER, created.id);
    expect(GroupSchema.parse(read)).toEqual(read);
    expect(sorted(read.myPermissions)).toEqual(EVERY_PERMISSION);
  });

  it('GRP-49: membro e reserva sem cargo não têm nenhuma permissão', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    for (const who of [A, R]) {
      const read = await t.groups.get(who, t.group.id);
      expect(GroupSchema.parse(read)).toEqual(read);
      expect(read.myPermissions).toEqual([]);
    }
  });

  it('GRP-05: sem members.manage, membro e reserva não recebem nenhum dos três links', async () => {
    const t = await setup({ members: [A], reserves: [R], guestsOpenHoursBefore: 6 });
    for (const who of [A, R]) {
      const read = await t.groups.get(who, t.group.id);
      expect(read.inviteToken).toBeUndefined();
      expect(read.reserveInviteToken).toBeUndefined();
      expect(read.guestToken).toBeUndefined();
    }
  });

  it('GRP-48: todo mundo tem exatamente um cargo: o dono, Dono; quem entra (membro ou reserva), Membro', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    for (const viewer of [OWNER, A, R]) {
      const list = await t.groups.members(viewer, t.group.id);
      expect(list.map((m) => [sys(m.userId), m.tier, m.roleId])).toEqual([
        [OWNER, 'member', 'owner'],
        [A, 'member', 'member'],
        [R, 'reserve', 'member'],
      ]);
    }
    for (const [who, roleId] of [
      [OWNER, 'owner'],
      [A, 'member'],
      [R, 'member'],
    ] as const) {
      expect((await t.groups.get(who, t.group.id)).myRoleId).toBe(roleId);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Cargos com alguém Admin (GRP-48–55). `withAdmin` grava o `roleId` direto na participação, como o `setStaffRole`
// do repositório; dar e tirar pelo service tem os próprios testes (GRP-51).

const ADMIN_ROLE = 'admin';

/** Grupo do OWNER com A (Admin), B e C membros e R reserva. */
async function withAdmin(opts: SetupOpts = {}) {
  const t = await setup({ members: [A, B, C], reserves: [R], ...opts });
  t.store.forceStaffRole(t.group.id, A, 'admin');
  return t;
}

const staffOf = async (t: Awaited<ReturnType<typeof setup>>, viewer: UserId, who: UserId) =>
  (await t.groups.members(viewer, t.group.id)).find((m) => sys(m.userId) === who)?.roleId;

describe('dar e tirar o cargo (GRP-51)', () => {
  it('GRP-51: o dono torna um membro Admin → a lista mostra o cargo e a pessoa recebe staff_role_granted', async () => {
    const t = await setup({ members: [A, B] });
    await expect(t.groups.setStaffRole(OWNER, t.group.id, pub(A), 'admin')).resolves.toBeUndefined();
    expect(await staffOf(t, OWNER, A)).toEqual(ADMIN_ROLE);
    expect(await staffOf(t, OWNER, B)).toBe('member');
    expect(t.store.membershipOf(t.group.id, A)?.roleId).toBe('admin');
    expect(ofType(t.sent, 'staff_role_granted')).toEqual([A]);
    expect(t.sent.find((n) => n.type === 'staff_role_granted')).toMatchObject({
      link: `/groups/${t.group.id}`,
    });
  });

  it('GRP-51: dar o cargo que a pessoa já tem não muda nada e não avisa de novo', async () => {
    const t = await setup({ members: [A] });
    await t.groups.setStaffRole(OWNER, t.group.id, pub(A), 'admin');
    await t.groups.setStaffRole(OWNER, t.group.id, pub(A), 'admin');
    expect(ofType(t.sent, 'staff_role_granted')).toEqual([A]);
    expect(await staffOf(t, OWNER, A)).toEqual(ADMIN_ROLE);
  });

  it('GRP-51: o dono tira o Admin → a pessoa volta ao cargo Membro, sem aviso; tirar de quem não tem não muda nada', async () => {
    const t = await withAdmin();
    await expect(t.groups.clearStaffRole(OWNER, t.group.id, pub(A))).resolves.toBeUndefined();
    expect(await staffOf(t, OWNER, A)).toBe('member');
    expect(t.store.membershipOf(t.group.id, A)?.roleId).toBe('member');
    expect((await t.groups.get(A, t.group.id)).myRoleId).toBe('member');
    await expect(t.groups.clearStaffRole(OWNER, t.group.id, pub(B))).resolves.toBeUndefined();
    expect(await staffOf(t, OWNER, B)).toBe('member');
    expect(t.sent).toEqual([]);
  });

  it('GRP-51: só o dono dá e tira: Admin e membro sem cargo recebem GROUP_NOT_OWNER; quem não participa, GROUP_NOT_FOUND', async () => {
    const t = await withAdmin();
    for (const who of [A, B, R]) {
      await expectAppError(t.groups.setStaffRole(who, t.group.id, pub(C), 'admin'), 'GROUP_NOT_OWNER', 403);
      await expectAppError(t.groups.clearStaffRole(who, t.group.id, pub(A)), 'GROUP_NOT_OWNER', 403);
    }
    await expectAppError(t.groups.setStaffRole(A, t.group.id, pub(A), 'admin'), 'GROUP_NOT_OWNER', 403);
    await expectAppError(
      t.groups.setStaffRole(OUTSIDER, t.group.id, pub(C), 'admin'),
      'GROUP_NOT_FOUND',
      404,
    );
    expect(await staffOf(t, OWNER, C)).toBe('member');
    expect(await staffOf(t, OWNER, A)).toEqual(ADMIN_ROLE);
    expect(t.sent).toEqual([]);
  });

  it('GRP-51: alvo que não participa → GROUP_MEMBER_NOT_FOUND; o próprio dono → VALIDATION_ERROR', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(
      t.groups.setStaffRole(OWNER, t.group.id, pub(OUTSIDER), 'admin'),
      'GROUP_MEMBER_NOT_FOUND',
      404,
    );
    await expectAppError(
      t.groups.clearStaffRole(OWNER, t.group.id, pub(OUTSIDER)),
      'GROUP_MEMBER_NOT_FOUND',
      404,
    );
    await expectAppError(
      t.groups.setStaffRole(OWNER, t.group.id, pub(OWNER), 'admin'),
      'VALIDATION_ERROR',
      422,
    );
    await expectAppError(t.groups.clearStaffRole(OWNER, t.group.id, pub(OWNER)), 'VALIDATION_ERROR', 422);
    expect(t.store.membershipOf(t.group.id, OWNER)?.roleId).toBe('owner');
    expect(t.sent).toEqual([]);
  });

  it('GRP-51: grupo arquivado → GROUP_ARCHIVED para dar e tirar', async () => {
    const t = await withAdmin();
    await t.groups.archive(OWNER, t.group.id);
    t.sent.splice(0);
    await expectAppError(t.groups.setStaffRole(OWNER, t.group.id, pub(B), 'admin'), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.groups.clearStaffRole(OWNER, t.group.id, pub(A)), 'GROUP_ARCHIVED', 409);
    expect(await staffOf(t, OWNER, A)).toEqual(ADMIN_ROLE);
    expect(await staffOf(t, OWNER, B)).toBe('member');
    expect(t.sent).toEqual([]);
  });

  it('GRP-51: a participação some no meio (not_member) → GROUP_MEMBER_NOT_FOUND, sem aviso', async () => {
    const t = await setup({ members: [A] });
    const original = t.store.groups.setStaffRole.bind(t.store.groups);
    t.store.groups.setStaffRole = async (groupId: string, userId: UserId, roleId: RoleId) => {
      t.store.drop(groupId, userId);
      return original(groupId, userId, roleId);
    };
    await expectAppError(
      t.groups.setStaffRole(OWNER, t.group.id, pub(A), 'admin'),
      'GROUP_MEMBER_NOT_FOUND',
      404,
    );
    expect(t.sent).toEqual([]);
  });
});

describe('papel e cargo (GRP-48)', () => {
  it('GRP-48: a reserva pode ter cargo: continua reserva, com todas as permissões do Admin', async () => {
    const t = await setup({ reserves: [R] });
    await t.groups.setStaffRole(OWNER, t.group.id, pub(R), 'admin');
    const read = await t.groups.get(R, t.group.id);
    expect(read.myTier).toBe('reserve');
    expect(read.myRoleId).toBe('admin');
    expect(sorted(read.myPermissions)).toEqual(EVERY_PERMISSION);
    expect(await staffOf(t, OWNER, R)).toEqual(ADMIN_ROLE);
    expect(await t.groups.members(OWNER, t.group.id)).toContainEqual(
      expect.objectContaining({ userId: pub(R), tier: 'reserve' }),
    );
  });

  it('GRP-48: a reserva com cargo que vira membro pelo link mantém o cargo', async () => {
    const t = await setup({ reserves: [R] });
    t.store.forceStaffRole(t.group.id, R, 'admin');
    await t.groups.acceptInvite(R, tokenOf(t.group));
    expect((await t.groups.get(R, t.group.id)).myTier).toBe('member');
    expect(await staffOf(t, OWNER, R)).toEqual(ADMIN_ROLE);
  });

  it('GRP-48: a reserva com cargo que aceita o convite para membro mantém o cargo', async () => {
    const t = await setup({ reserves: [R] });
    t.store.forceStaffRole(t.group.id, R, 'admin');
    await t.groups.inviteToMember(OWNER, t.group.id, pub(R));
    await t.groups.acceptMemberInvite(R, t.group.id);
    expect((await t.groups.get(R, t.group.id)).myTier).toBe('member');
    expect(await staffOf(t, OWNER, R)).toEqual(ADMIN_ROLE);
  });
});

describe('o que o Admin vê (GRP-05, 55)', () => {
  it('GRP-55: o Admin recebe todas as permissões do catálogo no `myPermissions` (GRP-50), inclusive seasons.manage', async () => {
    const t = await withAdmin();
    const read = await t.groups.get(A, t.group.id);
    expect(GroupSchema.parse(read)).toEqual(read);
    expect(sorted(read.myPermissions)).toEqual(EVERY_PERMISSION);
    expect((await t.groups.get(B, t.group.id)).myPermissions).toEqual([]);
  });

  it('GRP-55: todos veem o papel (`tier`) e o cargo (`roleId`) de cada pessoa na lista de membros, sem `isOwner` nem `staffRole`', async () => {
    const t = await withAdmin();
    for (const viewer of [OWNER, A, B, R]) {
      const list = await t.groups.members(viewer, t.group.id);
      const byPerson = new Map(list.map((m) => [sys(m.userId), m.roleId]));
      expect(byPerson.get(A)).toEqual(ADMIN_ROLE);
      expect([OWNER, B, C, R].map((id) => byPerson.get(id))).toEqual(['owner', 'member', 'member', 'member']);
      expect(list.find((m) => sys(m.userId) === R)?.tier).toBe('reserve');
      for (const m of list) {
        expect(m).not.toHaveProperty('isOwner');
        expect(m).not.toHaveProperty('staffRole');
      }
    }
  });

  it('GRP-55: o grupo traz o cargo de quem pede no `myRoleId`, sem o `myRole` antigo', async () => {
    const t = await withAdmin();
    const roleIds = await Promise.all(
      [OWNER, A, B, R].map(async (who) => (await t.groups.get(who, t.group.id)).myRoleId),
    );
    expect(roleIds).toEqual(['owner', 'admin', 'member', 'member']);
    const [mine] = await t.groups.myGroups(A);
    expect(mine).toMatchObject({ myTier: 'member', myRoleId: 'admin' });
    expect(mine).not.toHaveProperty('myRole');
  });

  it('GRP-05: o Admin (members.manage) recebe os três links', async () => {
    const t = await withAdmin({ guestsOpenHoursBefore: 6 });
    const read = await t.groups.get(A, t.group.id);
    expect(read.inviteToken).toBe(tokenOf(t.group));
    expect(read.reserveInviteToken).toBe(reserveTokenOf(t.group));
    expect(read.guestToken).toBe(guestTokenOf(t.group));
  });

  it('GRP-52: um cargo que não existe conta como o cargo Membro: sem permissões, sem links e Membro na lista', async () => {
    const t = await setup({ members: [A] });
    t.store.forceStaffRole(t.group.id, A, 'organizer' as never);
    const read = await t.groups.get(A, t.group.id);
    expect(GroupSchema.parse(read)).toEqual(read);
    expect(read.myRoleId).toBe('member');
    expect(read.myPermissions).toEqual([]);
    expect(read.inviteToken).toBeUndefined();
    expect(await staffOf(t, OWNER, A)).toBe('member');
    await expectDenied(t.games.cancel(A, t.group.id, t.gameId), 'game.manage');
  });
});

describe('o Admin age com as permissões do cargo (GRP-49)', () => {
  it('GRP-16: o Admin (settings.edit) muda as camadas, os limites, as vagas e o mínimo padrão', async () => {
    const t = await withAdmin();
    const updated = await t.groups.update(A, t.group.id, {
      ...t.sv(t.group.id),
      listOpensHoursBefore: 30,
      maxMembers: 14,
      slots: 14,
      minPlayers: 10,
    });
    expect(updated).toMatchObject({ listOpensHoursBefore: 30, maxMembers: 14, slots: 14, minPlayers: 10 });
    expect(t.store.storedGroup(t.group.id)).toMatchObject({
      listOpensHoursBefore: 30,
      slots: 14,
      minPlayers: 10,
    });
  });

  it('GRP-07: o Admin (members.manage) gera outro link, e o antigo deixa de valer', async () => {
    const t = await withAdmin();
    const invite = await t.groups.rotateInvite(A, t.group.id, 'member');
    expect(invite.token).not.toBe(tokenOf(t.group));
    await expectAppError(t.groups.acceptInvite(D, tokenOf(t.group)), 'GROUP_INVITE_INVALID', 404);
  });

  it('GRP-45: o Admin (game.manage) muda as vagas só do jogo atual', async () => {
    const t = await withAdmin();
    const game = await t.games.updateGame(A, t.group.id, t.gameId, { version: 0, slots: 14 });
    expect(game.slots).toBe(14);
    expect(t.store.storedGroup(t.group.id)?.slots).toBe(12);
  });

  it('GRP-24: o Admin cancela → game_cancelled para todos da lista menos ele, o dono incluído', async () => {
    const t = await withAdmin({ slots: 2 });
    await t.confirmInOrder(OWNER, A, B);
    const game = await t.games.cancel(A, t.group.id, t.gameId);
    expect(game.status).toBe('cancelled');
    expect(ofType(t.sent, 'game_cancelled').sort()).toEqual([OWNER, B].sort());
  });

  it('GRP-24: o dono cancela com o Admin na lista → o Admin é avisado, e o dono não', async () => {
    const t = await withAdmin();
    await t.confirmInOrder(OWNER, A);
    await t.games.cancel(OWNER, t.group.id, t.gameId);
    expect(ofType(t.sent, 'game_cancelled')).toEqual([A]);
  });

  it('GRP-44: o Admin reabre → game_reopened para todos da lista menos ele, o dono incluído', async () => {
    const t = await withAdmin({ now: THURSDAY_19H });
    await t.confirmInOrder(OWNER, A, B);
    await t.games.cancel(OWNER, t.group.id, t.gameId);
    t.sent.splice(0);
    const game = await t.games.reopen(A, t.group.id, t.gameId);
    expect(game.status).toBe('open');
    expect(ofType(t.sent, 'game_reopened').sort()).toEqual([OWNER, B].sort());
  });

  it('GRP-47: o Admin baixa o mínimo do jogo até a lista → avisa todos da lista menos ele, o dono incluído', async () => {
    const t = await withAdmin();
    await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), minPlayers: 4 });
    await t.confirmInOrder(OWNER, A, B);
    expect(ofType(t.sent, 'game_confirmed')).toEqual([]);
    await t.games.updateGame(A, t.group.id, t.gameId, { version: 0, minPlayers: 3 });
    expect(ofType(t.sent, 'game_confirmed').sort()).toEqual([OWNER, B].sort());
  });

  it('GRP-40: o Admin convida a reserva para membro, e cancela o convite que o dono mandou', async () => {
    const t = await withAdmin({ reserves: [R, D] });
    await t.groups.inviteToMember(A, t.group.id, pub(R));
    expect(ofType(t.sent, 'member_invite')).toEqual([R]);
    await t.groups.inviteToMember(OWNER, t.group.id, pub(D));
    await t.groups.cancelMemberInvite(A, t.group.id, pub(D));
    await expectAppError(t.groups.acceptMemberInvite(D, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
    expect((await t.groups.acceptMemberInvite(R, t.group.id)).myTier).toBe('member');
  });

  it('GRP-49: arquivar e desarquivar continuam só do dono: o Admin recebe GROUP_NOT_OWNER', async () => {
    const t = await withAdmin();
    await expectAppError(t.groups.archive(A, t.group.id), 'GROUP_NOT_OWNER', 403);
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(t.groups.unarchive(A, t.group.id), 'GROUP_NOT_OWNER', 403);
    expect(t.store.storedGroup(t.group.id)?.archivedAt).toBeDefined();
  });

  it('GRP-52: o cargo tirado barra na hora a próxima ação (GROUP_PERMISSION_DENIED)', async () => {
    const t = await withAdmin();
    await t.confirmInOrder(A);
    await t.groups.clearStaffRole(OWNER, t.group.id, pub(A));
    await expectDenied(t.games.cancel(A, t.group.id, t.gameId), 'game.manage');
    expect((await t.current(A, t.group.id)).status).toBe('open');
  });

  it('GRP-52: ordem dos erros → quem não participa dá 404, depois a permissão, depois GROUP_ARCHIVED', async () => {
    const t = await withAdmin();
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(t.games.cancel(OUTSIDER, t.group.id, t.gameId), 'GROUP_NOT_FOUND', 404);
    await expectDenied(t.games.cancel(B, t.group.id, t.gameId), 'game.manage');
    await expectAppError(t.games.cancel(A, t.group.id, t.gameId), 'GROUP_ARCHIVED', 409);
    await expectAppError(
      t.groups.update(A, t.group.id, { ...t.sv(t.group.id), slots: 14 }),
      'GROUP_ARCHIVED',
      409,
    );
    await expectAppError(t.groups.removeMember(A, t.group.id, pub(B)), 'GROUP_ARCHIVED', 409);
  });
});

describe('remover com cargo (GRP-25, 53)', () => {
  it('GRP-25: o Admin (members.manage) remove um membro e uma reserva sem cargo', async () => {
    const t = await withAdmin();
    await t.groups.removeMember(A, t.group.id, pub(B));
    await t.groups.removeMember(A, t.group.id, pub(R));
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A, C]);
  });

  it('GRP-25: o Admin remove a si mesmo → VALIDATION_ERROR (para isso existe sair); o dono, GROUP_OWNER_NOT_REMOVABLE', async () => {
    const t = await withAdmin();
    await expectAppError(t.groups.removeMember(A, t.group.id, pub(A)), 'VALIDATION_ERROR', 422);
    await expectAppError(
      t.groups.removeMember(OWNER, t.group.id, pub(OWNER)),
      'GROUP_OWNER_NOT_REMOVABLE',
      409,
    );
    expect(ids(await t.groups.members(OWNER, t.group.id))).toContain(A);
    expect(t.store.removeCalls).toEqual([]);
  });

  it('GRP-25: o Admin tenta remover o dono → GROUP_OWNER_NOT_REMOVABLE', async () => {
    const t = await withAdmin();
    await expectAppError(t.groups.removeMember(A, t.group.id, pub(OWNER)), 'GROUP_OWNER_NOT_REMOVABLE', 409);
    expect(t.store.removeCalls).toEqual([]);
  });

  it('GRP-53: o Admin tenta remover outro Admin → GROUP_NOT_OWNER, e ninguém sai', async () => {
    const t = await withAdmin();
    t.store.forceStaffRole(t.group.id, C, 'admin');
    t.store.forceStaffRole(t.group.id, R, 'admin');
    await expectAppError(t.groups.removeMember(A, t.group.id, pub(C)), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.removeMember(A, t.group.id, pub(R)), 'GROUP_NOT_OWNER', 403);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A, B, C, R]);
    expect(t.store.removeCalls).toEqual([]);
  });

  it('GRP-25: o dono remove quem tem cargo (GRP-53) → a pessoa sai com o cargo, e volta pelo link novo com o cargo Membro', async () => {
    const t = await withAdmin();
    await t.groups.removeMember(OWNER, t.group.id, pub(A));
    expect(t.store.membershipOf(t.group.id, A)).toBeUndefined();
    const fresh = (await t.groups.get(OWNER, t.group.id)).inviteToken ?? '';
    await t.groups.acceptInvite(A, fresh);
    expect(await staffOf(t, OWNER, A)).toBe('member');
    expect(t.store.membershipOf(t.group.id, A)?.roleId).toBe('member');
    expect((await t.groups.get(A, t.group.id)).myPermissions).toEqual([]);
  });

  it('GRP-53: o Admin convida para membro uma reserva com cargo, pelas regras normais', async () => {
    const t = await withAdmin();
    t.store.forceStaffRole(t.group.id, R, 'admin');
    await t.groups.inviteToMember(A, t.group.id, pub(R));
    expect(ofType(t.sent, 'member_invite')).toEqual([R]);
  });
});

describe('ninguém convida a si mesmo (GRP-40)', () => {
  it('GRP-40: a reserva Admin convida a si mesma → VALIDATION_ERROR, sem aviso e sem convite gravado', async () => {
    const t = await withAdmin();
    t.store.forceStaffRole(t.group.id, R, 'admin');
    await expectAppError(t.groups.inviteToMember(R, t.group.id, pub(R)), 'VALIDATION_ERROR', 422);
    expect(t.store.membershipOf(t.group.id, R)?.memberInviteExpiresAt).toBeUndefined();
    expect(inviteOfIn(await t.groups.members(OWNER, t.group.id), R)).toBeUndefined();
    expect((await t.groups.get(R, t.group.id)).myMemberInvite).toBeUndefined();
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
    expect(roleOfIn(await t.groups.members(OWNER, t.group.id), R)).toBe('reserve');
    expect(t.sent).toEqual([]);
  });

  it('GRP-40: a reserva Admin continua convidando as outras reservas', async () => {
    const t = await withAdmin({ reserves: [R, D] });
    t.store.forceStaffRole(t.group.id, R, 'admin');
    await t.groups.inviteToMember(R, t.group.id, pub(D));
    expect(ofType(t.sent, 'member_invite')).toEqual([D]);
  });

  it('GRP-40: o membro Admin e o dono convidam a si mesmos → VALIDATION_ERROR (antes de "não é reserva")', async () => {
    const t = await withAdmin();
    await expectAppError(t.groups.inviteToMember(A, t.group.id, pub(A)), 'VALIDATION_ERROR', 422);
    await expectAppError(t.groups.inviteToMember(OWNER, t.group.id, pub(OWNER)), 'VALIDATION_ERROR', 422);
    expect(t.sent).toEqual([]);
  });

  it('GRP-40: a si mesmo com o grupo arquivado → GROUP_ARCHIVED (o arquivado vem antes)', async () => {
    const t = await withAdmin();
    t.store.forceStaffRole(t.group.id, R, 'admin');
    await t.groups.archive(OWNER, t.group.id);
    t.sent.splice(0);
    await expectAppError(t.groups.inviteToMember(R, t.group.id, pub(R)), 'GROUP_ARCHIVED', 409);
    expect(t.store.membershipOf(t.group.id, R)?.memberInviteExpiresAt).toBeUndefined();
    expect(t.sent).toEqual([]);
  });

  it('GRP-40: a reserva sem cargo convida a si mesma → GROUP_PERMISSION_DENIED (a permissão vem antes)', async () => {
    const t = await withAdmin();
    await expectDenied(t.groups.inviteToMember(R, t.group.id, pub(R)), 'members.manage');
    expect(t.sent).toEqual([]);
  });
});

describe('sair com cargo (GRP-42)', () => {
  it('GRP-42: o Admin sai → perde o cargo; volta pelo mesmo link de membro com o cargo Membro e sem permissões', async () => {
    const t = await withAdmin();
    await t.groups.leave(A, t.group.id);
    expect(t.store.membershipOf(t.group.id, A)).toBeUndefined();
    await t.groups.acceptInvite(A, tokenOf(t.group));
    expect(await staffOf(t, OWNER, A)).toBe('member');
    const read = await t.groups.get(A, t.group.id);
    expect(read.myRoleId).toBe('member');
    expect(read.myPermissions).toEqual([]);
    await expectDenied(t.games.cancel(A, t.group.id, t.gameId), 'game.manage');
  });
});

describe('passar o grupo (GRP-54)', () => {
  it('GRP-54: o dono passa o grupo para um membro → a pessoa vira dona e o dono antigo vira Admin', async () => {
    const t = await setup({ members: [A, B], reserves: [R], guestsOpenHoursBefore: 6 });
    const result = await t.groups.transfer(OWNER, t.group.id, pub(B));
    expect(GroupSchema.parse(result)).toEqual(result);
    expect(result).not.toHaveProperty('ownerId');
    expect(result.myTier).toBe('member');
    expect(result.myRoleId).toBe('admin');
    expect(sorted(result.myPermissions)).toEqual(EVERY_PERMISSION);

    const asNewOwner = await t.groups.get(B, t.group.id);
    expect(asNewOwner.myRoleId).toBe('owner');
    expect(sorted(asNewOwner.myPermissions)).toEqual(EVERY_PERMISSION);

    const list = await t.groups.members(B, t.group.id);
    expect(ids(list)).toEqual([B, OWNER, A, R]);
    expect(list.find((m) => sys(m.userId) === B)).toMatchObject({ tier: 'member', roleId: 'owner' });
    expect(list.find((m) => sys(m.userId) === OWNER)).toMatchObject({ tier: 'member', roleId: ADMIN_ROLE });
    expect(list.filter((m) => m.roleId === 'owner')).toHaveLength(1);
  });

  it('GRP-54: os links não mudam, e o novo dono recebe group_transferred com o link do grupo', async () => {
    const t = await setup({ members: [A, B], guestsOpenHoursBefore: 6 });
    await t.groups.transfer(OWNER, t.group.id, pub(B));
    const read = await t.groups.get(B, t.group.id);
    expect([read.inviteToken, read.reserveInviteToken, read.guestToken]).toEqual([
      tokenOf(t.group),
      reserveTokenOf(t.group),
      guestTokenOf(t.group),
    ]);
    expect(ofType(t.sent, 'group_transferred')).toEqual([B]);
    expect(t.sent.find((n) => n.type === 'group_transferred')).toMatchObject({
      link: `/groups/${t.group.id}`,
    });
  });

  it('GRP-54: o jogo e a lista não mudam com a transferência', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(OWNER, A);
    const before = await t.current(A, t.group.id);
    await t.groups.transfer(OWNER, t.group.id, pub(B));
    expect(await t.current(A, t.group.id)).toEqual(before);
  });

  it('GRP-54: quem recebe o grupo recebe o cargo Dono no lugar do que tinha', async () => {
    const t = await withAdmin();
    await t.groups.transfer(OWNER, t.group.id, pub(A));
    expect(await staffOf(t, A, A)).toBe('owner');
    expect(t.store.membershipOf(t.group.id, A)?.roleId).toBe('owner');
    expect(await staffOf(t, A, OWNER)).toEqual(ADMIN_ROLE);
  });

  it('GRP-54: depois de passar o grupo, o dono antigo pode sair, e o novo dono não', async () => {
    const t = await setup({ members: [A, B] });
    await t.groups.transfer(OWNER, t.group.id, pub(B));
    await expectAppError(t.groups.leave(B, t.group.id), 'GROUP_OWNER_NOT_REMOVABLE', 409);
    await expect(t.groups.leave(OWNER, t.group.id)).resolves.toBeUndefined();
    expect(ids(await t.groups.members(B, t.group.id))).toEqual([B, A]);
  });

  it('GRP-54: o novo dono pode tirar o cargo do dono antigo', async () => {
    const t = await setup({ members: [A, B] });
    await t.groups.transfer(OWNER, t.group.id, pub(B));
    await t.groups.clearStaffRole(B, t.group.id, pub(OWNER));
    const read = await t.groups.get(OWNER, t.group.id);
    expect(read.myRoleId).toBe('member');
    expect(read.myPermissions).toEqual([]);
  });

  it('GRP-54: para uma reserva ou quem não participa → GROUP_MEMBER_NOT_FOUND; para o próprio dono → VALIDATION_ERROR', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await expectAppError(t.groups.transfer(OWNER, t.group.id, pub(R)), 'GROUP_MEMBER_NOT_FOUND', 404);
    await expectAppError(t.groups.transfer(OWNER, t.group.id, pub(OUTSIDER)), 'GROUP_MEMBER_NOT_FOUND', 404);
    await expectAppError(t.groups.transfer(OWNER, t.group.id, pub(OWNER)), 'VALIDATION_ERROR', 422);
    expect(t.store.roleIdIn(t.group.id, OWNER)).toBe('owner');
    expect(ofType(t.sent, 'group_transferred')).toEqual([]);
  });

  it('GRP-54: só o dono passa o grupo: o Admin recebe GROUP_NOT_OWNER; quem não participa, GROUP_NOT_FOUND', async () => {
    const t = await withAdmin();
    await expectAppError(t.groups.transfer(A, t.group.id, pub(B)), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.transfer(B, t.group.id, pub(B)), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.transfer(OUTSIDER, t.group.id, pub(B)), 'GROUP_NOT_FOUND', 404);
    expect(t.store.roleIdIn(t.group.id, OWNER)).toBe('owner');
    expect(t.store.transferCalls).toEqual([]);
  });

  it('GRP-54: grupo arquivado → GROUP_ARCHIVED', async () => {
    const t = await setup({ members: [A, B] });
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(t.groups.transfer(OWNER, t.group.id, pub(B)), 'GROUP_ARCHIVED', 409);
    expect(t.store.roleIdIn(t.group.id, OWNER)).toBe('owner');
  });

  it('GRP-54: quem recebe saiu no meio (not_member) → GROUP_MEMBER_NOT_FOUND, sem aviso', async () => {
    const t = await setup({ members: [A, B] });
    t.store.transferScript.push(() => 'not_member');
    await expectAppError(t.groups.transfer(OWNER, t.group.id, pub(B)), 'GROUP_MEMBER_NOT_FOUND', 404);
    expect(t.sent).toEqual([]);
  });

  it('GRP-54: o grupo foi arquivado no meio (stale) → relê e responde GROUP_ARCHIVED', async () => {
    const t = await setup({ members: [A, B] });
    t.store.transferScript.push((args) => {
      t.store.forceArchive(args.group.id, t.clock.now.toISOString());
      return 'stale';
    });
    await expectAppError(t.groups.transfer(OWNER, t.group.id, pub(B)), 'GROUP_ARCHIVED', 409);
    expect(t.sent).toEqual([]);
  });

  it('GRP-54: duas transferências ao mesmo tempo → a segunda (stale, o dono antigo já não é owner) recebe GROUP_NOT_OWNER, com um dono só', async () => {
    const t = await setup({ members: [A, B] });
    t.store.transferScript.push((args) => {
      t.store.naturalTransfer({ ...args, to: A });
      return 'stale';
    });
    await expectAppError(t.groups.transfer(OWNER, t.group.id, pub(B)), 'GROUP_NOT_OWNER', 403);
    expect(t.store.roleIdIn(t.group.id, A)).toBe('owner');
    expect(t.store.roleIdIn(t.group.id, B)).toBe('member');
    expect(t.store.roleIdIn(t.group.id, OWNER)).toBe('admin');
    const owners = (await t.groups.members(A, t.group.id)).filter((m) => m.roleId === 'owner');
    expect(ids(owners)).toEqual([A]);
    expect(ofType(t.sent, 'group_transferred')).toEqual([]);
  });
});

// Esportes (`.claude/work/esportes.md`): o grupo joga um esporte do catálogo, escolhido ao criar (GRP-58).
describe('esporte do grupo (GRP-58)', () => {
  it('GRP-58: criar com um esporte do catálogo → o grupo guarda e devolve o sportId, para todos', async () => {
    const t = await setup({ members: [A] });
    expect(t.group.sportId).toBe('volleyball');
    expect(t.store.storedGroup(t.group.id)?.sportId).toBe('volleyball');
    expect(t.sportReads).toContain('volleyball');
    const soccer = await t.groups.create(OWNER, { ...INPUT, sportId: 'soccer' });
    expect(GroupSchema.parse(soccer).sportId).toBe('soccer');
    expect((await t.groups.get(A, t.group.id)).sportId).toBe('volleyball');
  });

  it('GRP-58: esporte fora do catálogo → SPORT_NOT_FOUND (422) com details.sportId, sem gravar nada', async () => {
    const s = setupServices();
    const err = await expectAppError(
      s.groups.create(OWNER, { ...INPUT, sportId: 'curling' }),
      'SPORT_NOT_FOUND',
      422,
    );
    expect(err.details).toEqual({ sportId: 'curling' });
    expect(await s.groups.myGroups(OWNER)).toEqual([]);
  });

  it('GRP-58 / ESP-05: esporte desativado no catálogo → SPORT_NOT_FOUND (422) com details.sportId, sem gravar nada', async () => {
    const s = setupServices();
    const err = await expectAppError(
      s.groups.create(OWNER, { ...INPUT, sportId: 'cricket' }),
      'SPORT_NOT_FOUND',
      422,
    );
    expect(err.details).toEqual({ sportId: 'cricket' });
    expect(await s.groups.myGroups(OWNER)).toEqual([]);
  });

  it('GRP-58: o contrato pede o sportId ao criar (sem ele, ou fora do formato, não passa)', () => {
    const { sportId: _s, ...noSport } = INPUT;
    expect(CreateGroupInputSchema.safeParse(noSport).success).toBe(false);
    expect(CreateGroupInputSchema.safeParse({ ...INPUT, sportId: 'Vôlei' }).success).toBe(false);
  });

  it('GRP-58: o esporte não muda depois de criado (o PATCH não aceita sportId)', async () => {
    expect(UpdateGroupInputSchema.parse({ version: 1, slots: 10, sportId: 'soccer' })).toEqual({
      version: 1,
      slots: 10,
    });
    const t = await setup();
    const patch = { ...t.sv(t.group.id), slots: 10, sportId: 'soccer' } as unknown as Parameters<
      typeof t.groups.update
    >[2];
    const updated = await t.groups.update(OWNER, t.group.id, patch);
    expect(updated.sportId).toBe('volleyball');
    expect(t.store.storedGroup(t.group.id)?.sportId).toBe('volleyball');
  });

  it('GRP-58 / ESP-05: um grupo de esporte desativado depois continua valendo (lê, edita e confirma)', async () => {
    const t = await setup({ members: [A], now: WEDNESDAY_19H });
    const stored = t.store.storedGroup(t.group.id);
    expect(stored).toBeDefined();
    t.store.seedGroup({ ...(stored as Stored), sportId: 'cricket' });
    expect((await t.groups.get(A, t.group.id)).sportId).toBe('cricket');
    expect((await t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), slots: 10 })).sportId).toBe(
      'cricket',
    );
    await t.games.confirm(A, t.group.id, t.gameId);
  });

  it('GRP-58: o jogo do link de convidado traz o sportId do grupo', async () => {
    const t = await setup({ guestsOpenHoursBefore: 6 });
    const view = await t.games.guestView(G, guestTokenOf(t.group));
    expect(view.group.sportId).toBe('volleyball');
  });
});

describe('Ajustes com a versão que a tela mostrou (GRP-59)', () => {
  it('GRP-59: o grupo sai com version (a identidade) e settingsVersion (os Ajustes), as duas começando em 1', async () => {
    const t = await setup({ members: [A] });
    expect(t.group).toMatchObject({ version: 1, settingsVersion: 1 });
    for (const who of [OWNER, A])
      expect(await t.groups.get(who, t.group.id)).toMatchObject({ version: 1, settingsVersion: 1 });
  });

  it('GRP-59: o PATCH com a settingsVersion atual grava, soma 1 nela e não mexe na version', async () => {
    const t = await setup();
    const updated = await t.groups.update(OWNER, t.group.id, { version: 1, slots: 14 });
    expect(updated).toMatchObject({ slots: 14, version: 1, settingsVersion: 2 });
    expect(await t.groups.get(OWNER, t.group.id)).toMatchObject({
      slots: 14,
      version: 1,
      settingsVersion: 2,
    });
  });

  it('GRP-59: os Ajustes mudaram antes → VERSION_CONFLICT (409, currentVersion) e nada é gravado', async () => {
    const t = await setup();
    await t.groups.update(OWNER, t.group.id, { version: 1, slots: 14 });
    const err = await expectAppError(
      t.groups.update(OWNER, t.group.id, { version: 1, slots: 8 }),
      'VERSION_CONFLICT',
      409,
    );
    expect(err.details).toEqual({ currentVersion: 2 });
    expect(t.store.storedGroup(t.group.id)).toMatchObject({ slots: 14, settingsVersion: 2 });
  });

  it('GRP-59: o PATCH confere a settingsVersion, não a version da identidade', async () => {
    const t = await setup();
    await t.groups.update(OWNER, t.group.id, { version: 1, slots: 14 });
    const stored = t.store.storedGroup(t.group.id) as Stored;
    // A identidade mudou (nome, logo, capa): a `version` do META sobe; os Ajustes continuam na 2.
    t.store.seedGroup({ ...stored, version: 5 });
    const updated = await t.groups.update(OWNER, t.group.id, { version: 2, slots: 10 });
    expect(updated).toMatchObject({ slots: 10, version: 5, settingsVersion: 3 });
    await expectAppError(
      t.groups.update(OWNER, t.group.id, { version: 5, slots: 12 }),
      'VERSION_CONFLICT',
      409,
    );
  });

  it('GRP-59: o contrato exige a version (inteiro ≥ 0) no PATCH, e ela sozinha não é mudança', () => {
    expect(UpdateGroupInputSchema.safeParse({ slots: 14 }).success).toBe(false);
    expect(UpdateGroupInputSchema.safeParse({ version: -1, slots: 14 }).success).toBe(false);
    expect(UpdateGroupInputSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(UpdateGroupInputSchema.safeParse({ version: 1, slots: 14 }).success).toBe(true);
  });
});

// Lugares do grupo (.claude/work/lugares.md, ADR 0015): GRP-60–63 e as mudanças na GRP-09, 16 e 32.

const PLACE_INPUT: PlaceInput = {
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
const placeNamed = (name: string): PlaceInput => ({ ...PLACE_INPUT, name });

/** Os lugares gravados do grupo, como o banco tem. */
const storedPlaces = (t: Awaited<ReturnType<typeof setup>>) => t.store.placesOf(t.group.id);

/** Cadastra um lugar pelo service (o dono) e devolve o gravado. */
async function addPlace(t: Awaited<ReturnType<typeof setup>>, input: PlaceInput = PLACE_INPUT) {
  const before = storedPlaces(t).length;
  await t.places.create(OWNER, t.group.id, input);
  const created = storedPlaces(t)[before];
  expect(created).toBeDefined();
  return created as StoredPlace;
}

/** Põe o lugar como padrão do grupo pelo PATCH (GRP-62). */
async function setDefault(t: Awaited<ReturnType<typeof setup>>, placeId: string | null) {
  return t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), defaultPlaceId: placeId });
}

describe('lugares do grupo: cadastrar e editar (GRP-60)', () => {
  it('GRP-60: o dono cadastra um lugar → ele aparece na lista com nome, endereço, ponto e version 1', async () => {
    const t = await setup();
    await t.places.create(OWNER, t.group.id, PLACE_INPUT);
    const list = await t.places.list(OWNER, t.group.id);
    expect(list).toHaveLength(1);
    expect(PlaceSchema.parse(list[0])).toMatchObject({ ...PLACE_INPUT, version: 1 });
    expect(list[0]?.archivedAt).toBeUndefined();
    expect(storedPlaces(t)[0]).toMatchObject({ groupId: t.group.id, name: PLACE_INPUT.name });
  });

  it('GRP-60: a lista vem na ordem de criação', async () => {
    const t = await setup();
    for (const name of ['Quadra A', 'Quadra B', 'Quadra C']) {
      await t.places.create(OWNER, t.group.id, placeNamed(name));
      t.tick();
    }
    expect((await t.places.list(OWNER, t.group.id)).map((p) => p.name)).toEqual([
      'Quadra A',
      'Quadra B',
      'Quadra C',
    ]);
  });

  it('GRP-60: o Admin (settings.edit) cadastra e edita', async () => {
    const t = await withAdmin();
    await t.places.create(A, t.group.id, PLACE_INPUT);
    const place = storedPlaces(t)[0] as StoredPlace;
    const updated = await t.places.update(A, t.group.id, place.id, {
      ...placeNamed('Ginásio'),
      version: place.version,
    });
    expect(updated).toMatchObject({ id: place.id, name: 'Ginásio', version: place.version + 1 });
  });

  it('GRP-60: quem não tem settings.edit (membro e reserva) não cadastra nem edita → GROUP_PERMISSION_DENIED', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const place = await addPlace(t);
    for (const who of [A, R]) {
      await expectDenied(t.places.create(who, t.group.id, PLACE_INPUT), 'settings.edit');
      await expectDenied(
        t.places.update(who, t.group.id, place.id, { ...PLACE_INPUT, version: place.version }),
        'settings.edit',
      );
    }
    expect(storedPlaces(t)).toHaveLength(1);
  });

  it('GRP-60: quem não participa → GROUP_NOT_FOUND, antes da permissão', async () => {
    const t = await setup();
    const place = await addPlace(t);
    await expectAppError(t.places.create(OUTSIDER, t.group.id, PLACE_INPUT), 'GROUP_NOT_FOUND', 404);
    await expectAppError(
      t.places.update(OUTSIDER, t.group.id, place.id, { ...PLACE_INPUT, version: 1 }),
      'GROUP_NOT_FOUND',
      404,
    );
    await expectAppError(t.places.list(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
  });

  it('GRP-60: editar com a versão atual grava o lugar inteiro e soma 1 na versão', async () => {
    const t = await setup();
    const place = await addPlace(t);
    const input = { ...PLACE_INPUT, name: 'Arena', lat: -22.9, lng: -43.2 };
    const updated = await t.places.update(OWNER, t.group.id, place.id, { ...input, version: 1 });
    expect(PlaceSchema.parse(updated)).toMatchObject({ ...input, id: place.id, version: 2 });
    expect((await t.places.list(OWNER, t.group.id))[0]).toMatchObject({ name: 'Arena', version: 2 });
  });

  it('GRP-60: editar com a versão velha → VERSION_CONFLICT (409, currentVersion) e nada muda', async () => {
    const t = await setup();
    const place = await addPlace(t);
    await t.places.update(OWNER, t.group.id, place.id, { ...placeNamed('Arena'), version: 1 });
    const err = await expectAppError(
      t.places.update(OWNER, t.group.id, place.id, { ...placeNamed('Outra'), version: 1 }),
      'VERSION_CONFLICT',
      409,
    );
    expect(err.details).toEqual({ currentVersion: 2 });
    expect(storedPlaces(t)[0]).toMatchObject({ name: 'Arena', version: 2 });
  });

  it('GRP-60: lugar que não é do grupo → PLACE_NOT_FOUND (404)', async () => {
    const t = await setup();
    const other = await t.groups.create(OWNER, INPUT);
    await t.places.create(OWNER, other.id, PLACE_INPUT);
    const foreign = t.store.placesOf(other.id)[0] as StoredPlace;
    await expectAppError(
      t.places.update(OWNER, t.group.id, foreign.id, { ...PLACE_INPUT, version: 1 }),
      'PLACE_NOT_FOUND',
      404,
    );
    await expectAppError(
      t.places.update(OWNER, t.group.id, randomUUID(), { ...PLACE_INPUT, version: 1 }),
      'PLACE_NOT_FOUND',
      404,
    );
  });

  it('GRP-60: com 10 lugares ativos, o 11º → PLACE_LIMIT_REACHED (409, details.max 10)', async () => {
    const t = await setup();
    for (const n of Array.from({ length: 10 }, (_, i) => i + 1)) await addPlace(t, placeNamed(`Quadra ${n}`));
    const err = await expectAppError(
      t.places.create(OWNER, t.group.id, placeNamed('Quadra 11')),
      'PLACE_LIMIT_REACHED',
      409,
    );
    expect(err.details).toEqual({ max: 10 });
    expect(storedPlaces(t)).toHaveLength(10);
  });

  it('GRP-60: com 9 ativos, dois cadastrados ao mesmo tempo → só um grava, o outro recebe PLACE_LIMIT_REACHED', async () => {
    const t = await setup();
    for (const n of Array.from({ length: 9 }, (_, i) => i + 1)) await addPlace(t, placeNamed(`Quadra ${n}`));
    const results = await Promise.allSettled([
      t.places.create(OWNER, t.group.id, placeNamed('X')),
      t.places.create(OWNER, t.group.id, placeNamed('Y')),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toMatchObject({
      code: 'PLACE_LIMIT_REACHED',
      status: 409,
    });
    expect(storedPlaces(t)).toHaveLength(10);
  });

  it('GRP-60: o contrato pede nome de 1 a 60, o ponto (lat −90..90, lng −180..180) e o endereço com rua, cidade e estado', () => {
    expect(PlaceInputSchema.safeParse(PLACE_INPUT).success).toBe(true);
    expect(PlaceInputSchema.safeParse({ ...PLACE_INPUT, name: '' }).success).toBe(false);
    expect(PlaceInputSchema.safeParse({ ...PLACE_INPUT, name: 'x'.repeat(61) }).success).toBe(false);
    expect(PlaceInputSchema.safeParse({ ...PLACE_INPUT, name: 'x'.repeat(60) }).success).toBe(true);
    expect(PlaceInputSchema.safeParse({ ...PLACE_INPUT, lat: 90.1 }).success).toBe(false);
    expect(PlaceInputSchema.safeParse({ ...PLACE_INPUT, lat: -90.1 }).success).toBe(false);
    expect(PlaceInputSchema.safeParse({ ...PLACE_INPUT, lng: 180.1 }).success).toBe(false);
    expect(PlaceInputSchema.safeParse({ ...PLACE_INPUT, lng: -180.1 }).success).toBe(false);
    const { lat: _lat, ...noLat } = PLACE_INPUT;
    expect(PlaceInputSchema.safeParse(noLat).success).toBe(false);
    for (const field of ['street', 'city', 'state'] as const) {
      const { [field]: _gone, ...address } = PLACE_INPUT.address;
      expect(PlaceInputSchema.safeParse({ ...PLACE_INPUT, address }).success).toBe(false);
    }
  });

  it('GRP-60: número, bairro e CEP são opcionais, e o país é o código de 2 letras, com BR por padrão', () => {
    const minimal = PlaceInputSchema.parse({
      ...PLACE_INPUT,
      address: { street: 'Rua A', city: 'Recife', state: 'PE' },
    });
    expect(minimal.address.country).toBe('BR');
    expect(
      PlaceInputSchema.parse({ ...PLACE_INPUT, address: { ...PLACE_INPUT.address, country: 'pt' } }).address
        .country,
    ).toBe('PT');
    expect(
      PlaceInputSchema.safeParse({ ...PLACE_INPUT, address: { ...PLACE_INPUT.address, country: 'BRA' } })
        .success,
    ).toBe(false);
    expect(
      PlaceInputSchema.safeParse({
        ...PLACE_INPUT,
        address: { ...PLACE_INPUT.address, street: 'x'.repeat(121) },
      }).success,
    ).toBe(false);
    expect(
      PlaceInputSchema.safeParse({
        ...PLACE_INPUT,
        address: { ...PLACE_INPUT.address, postalCode: 'x'.repeat(13) },
      }).success,
    ).toBe(false);
  });
});

describe('lugares do grupo: arquivar e desarquivar (GRP-61)', () => {
  it('GRP-61: arquivar marca o archivedAt, soma 1 na versão e o lugar continua na lista (marcado)', async () => {
    const t = await setup();
    const place = await addPlace(t);
    const archived = await t.places.archive(OWNER, t.group.id, place.id, { version: 1 });
    expect(archived).toMatchObject({ id: place.id, archivedAt: THURSDAY_10H.toISOString(), version: 2 });
    const list = await t.places.list(OWNER, t.group.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: place.id, archivedAt: THURSDAY_10H.toISOString() });
  });

  it('GRP-61: o arquivado não conta no limite: com 10 ativos, arquivar um libera o 11º cadastro', async () => {
    const t = await setup();
    for (const n of Array.from({ length: 10 }, (_, i) => i + 1)) await addPlace(t, placeNamed(`Quadra ${n}`));
    const first = storedPlaces(t)[0] as StoredPlace;
    await t.places.archive(OWNER, t.group.id, first.id, { version: first.version });
    await t.places.create(OWNER, t.group.id, placeNamed('Quadra 11'));
    expect(storedPlaces(t)).toHaveLength(11);
  });

  it('GRP-61: o lugar padrão não pode ser arquivado → PLACE_IS_DEFAULT (409); tirado o padrão, arquiva', async () => {
    const t = await setup();
    const place = await addPlace(t);
    await setDefault(t, place.id);
    await expectAppError(
      t.places.archive(OWNER, t.group.id, place.id, { version: place.version }),
      'PLACE_IS_DEFAULT',
      409,
    );
    expect(storedPlaces(t)[0]?.archivedAt).toBeUndefined();
    await setDefault(t, null);
    const archived = await t.places.archive(OWNER, t.group.id, place.id, { version: place.version });
    expect(archived.archivedAt).toBe(THURSDAY_10H.toISOString());
  });

  it('GRP-61: arquivar com a versão velha → VERSION_CONFLICT e o lugar continua ativo', async () => {
    const t = await setup();
    const place = await addPlace(t);
    await t.places.update(OWNER, t.group.id, place.id, { ...placeNamed('Arena'), version: 1 });
    const err = await expectAppError(
      t.places.archive(OWNER, t.group.id, place.id, { version: 1 }),
      'VERSION_CONFLICT',
      409,
    );
    expect(err.details).toEqual({ currentVersion: 2 });
    expect(storedPlaces(t)[0]?.archivedAt).toBeUndefined();
  });

  it('GRP-61: desarquivar volta o lugar para a escolha (sem archivedAt) e ele pode virar o padrão', async () => {
    const t = await setup();
    const place = await addPlace(t);
    const archived = await t.places.archive(OWNER, t.group.id, place.id, { version: 1 });
    await expectAppError(setDefault(t, place.id), 'PLACE_NOT_FOUND', 404);
    const back = await t.places.unarchive(OWNER, t.group.id, place.id, { version: archived.version });
    expect(back.archivedAt).toBeUndefined();
    expect(back.version).toBe(archived.version + 1);
    expect((await setDefault(t, place.id)).defaultPlaceId).toBe(place.id);
  });

  it('GRP-61: desarquivar sem espaço no limite → PLACE_LIMIT_REACHED (details.max 10) e continua arquivado', async () => {
    const t = await setup();
    const old = await addPlace(t, placeNamed('Antiga'));
    const archived = await t.places.archive(OWNER, t.group.id, old.id, { version: 1 });
    for (const n of Array.from({ length: 10 }, (_, i) => i + 1)) await addPlace(t, placeNamed(`Quadra ${n}`));
    const err = await expectAppError(
      t.places.unarchive(OWNER, t.group.id, old.id, { version: archived.version }),
      'PLACE_LIMIT_REACHED',
      409,
    );
    expect(err.details).toEqual({ max: 10 });
    expect(storedPlaces(t)[0]?.archivedAt).toBe(THURSDAY_10H.toISOString());
  });

  it('GRP-61: arquivar e desarquivar são de quem tem settings.edit; quem não participa → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    const place = await addPlace(t);
    await expectDenied(t.places.archive(A, t.group.id, place.id, { version: 1 }), 'settings.edit');
    await expectDenied(t.places.unarchive(A, t.group.id, place.id, { version: 1 }), 'settings.edit');
    await expectAppError(
      t.places.archive(OUTSIDER, t.group.id, place.id, { version: 1 }),
      'GROUP_NOT_FOUND',
      404,
    );
  });

  it('GRP-61: arquivar lugar de outro grupo → PLACE_NOT_FOUND', async () => {
    const t = await setup();
    const other = await t.groups.create(OWNER, INPUT);
    await t.places.create(OWNER, other.id, PLACE_INPUT);
    const foreign = t.store.placesOf(other.id)[0] as StoredPlace;
    await expectAppError(
      t.places.archive(OWNER, t.group.id, foreign.id, { version: 1 }),
      'PLACE_NOT_FOUND',
      404,
    );
    expect(t.store.placesOf(other.id)[0]?.archivedAt).toBeUndefined();
  });
});

describe('lugar padrão do grupo (GRP-62, GRP-16)', () => {
  it('GRP-62: o grupo nasce sem lugar padrão, e o jogo, sem local', async () => {
    const t = await setup();
    expect(t.group.defaultPlaceId).toBeUndefined();
    expect((await t.current(OWNER, t.group.id)).place).toBeUndefined();
  });

  it('GRP-16: o PATCH aceita o defaultPlaceId → o grupo sai com ele e a settingsVersion soma 1', async () => {
    const t = await setup();
    const place = await addPlace(t);
    const updated = await setDefault(t, place.id);
    expect(updated).toMatchObject({ defaultPlaceId: place.id, settingsVersion: 2 });
    expect((await t.groups.get(OWNER, t.group.id)).defaultPlaceId).toBe(place.id);
  });

  it('GRP-16: o contrato do PATCH aceita o defaultPlaceId como uuid ou null', () => {
    expect(UpdateGroupInputSchema.safeParse({ version: 1, defaultPlaceId: randomUUID() }).success).toBe(true);
    expect(UpdateGroupInputSchema.safeParse({ version: 1, defaultPlaceId: null }).success).toBe(true);
    expect(UpdateGroupInputSchema.safeParse({ version: 1, defaultPlaceId: 'quadra' }).success).toBe(false);
  });

  it('GRP-62: o padrão é o local do jogo atual: o Game sai com o lugar (nome, endereço e ponto)', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const place = await addPlace(t);
    await setDefault(t, place.id);
    for (const who of [OWNER, A, R]) {
      const game = await t.current(who, t.group.id);
      expect(GameSchema.parse(game).place).toMatchObject({
        ...PLACE_INPUT,
        id: place.id,
        version: place.version,
      });
    }
  });

  it('GRP-62: trocar o padrão troca o local do jogo; null tira o padrão e o jogo fica sem local', async () => {
    const t = await setup();
    const first = await addPlace(t, placeNamed('Quadra A'));
    const second = await addPlace(t, placeNamed('Quadra B'));
    await setDefault(t, first.id);
    await setDefault(t, second.id);
    expect((await t.current(OWNER, t.group.id)).place?.name).toBe('Quadra B');
    const cleared = await setDefault(t, null);
    expect(cleared.defaultPlaceId).toBeUndefined();
    expect((await t.current(OWNER, t.group.id)).place).toBeUndefined();
  });

  it('GRP-62: editar o lugar padrão muda o local do jogo', async () => {
    const t = await setup();
    const place = await addPlace(t);
    await setDefault(t, place.id);
    await t.places.update(OWNER, t.group.id, place.id, { ...placeNamed('Arena nova'), version: 1 });
    expect((await t.current(OWNER, t.group.id)).place).toMatchObject({
      name: 'Arena nova',
      version: 2,
    });
  });

  it('GRP-62: lugar arquivado, de outro grupo ou inexistente não vira padrão → PLACE_NOT_FOUND e nada é gravado', async () => {
    const t = await setup();
    const archived = await addPlace(t);
    await t.places.archive(OWNER, t.group.id, archived.id, { version: 1 });
    const other = await t.groups.create(OWNER, INPUT);
    await t.places.create(OWNER, other.id, PLACE_INPUT);
    const foreign = t.store.placesOf(other.id)[0] as StoredPlace;
    for (const id of [archived.id, foreign.id, randomUUID()])
      await expectAppError(setDefault(t, id), 'PLACE_NOT_FOUND', 404);
    expect(t.store.storedGroup(t.group.id)).toMatchObject({ settingsVersion: 1 });
    expect(t.store.storedGroup(t.group.id)?.defaultPlaceId).toBeUndefined();
  });

  it('GRP-62: o lugar arquivado entre a leitura e a gravação do PATCH → PLACE_NOT_FOUND (conferido na gravação)', async () => {
    const t = await setup();
    const place = await addPlace(t);
    t.store.hooks.beforeGroupUpdate.push((groupId) =>
      t.store.forceArchivePlace(groupId, place.id, THURSDAY_10H.toISOString()),
    );
    await expectAppError(setDefault(t, place.id), 'PLACE_NOT_FOUND', 404);
    expect(t.store.storedGroup(t.group.id)?.defaultPlaceId).toBeUndefined();
  });

  it('GRP-62: escolher o padrão é de quem tem settings.edit; o Admin pode', async () => {
    const t = await withAdmin();
    const place = await addPlace(t);
    await expectDenied(
      t.groups.update(B, t.group.id, { ...t.sv(t.group.id), defaultPlaceId: place.id }),
      'settings.edit',
    );
    const updated = await t.groups.update(A, t.group.id, { ...t.sv(t.group.id), defaultPlaceId: place.id });
    expect(updated.defaultPlaceId).toBe(place.id);
  });

  it('GRP-62: sai o location em texto: nem o criar nem o grupo têm o campo', async () => {
    const t = await setup();
    const parsed = CreateGroupInputSchema.parse({ ...INPUT, location: 'Quadra do clube' });
    expect(parsed).not.toHaveProperty('location');
    expect(GroupSchema.shape).not.toHaveProperty('location');
    expect(t.group).not.toHaveProperty('location');
    expect(await t.groups.get(OWNER, t.group.id)).not.toHaveProperty('location');
  });
});

describe('quem vê o jogo vê o lugar (GRP-63, GRP-09)', () => {
  it('GRP-63: o convidado pelo link do jogo vê o lugar no game.place', async () => {
    const t = await setup({ guestsOpenHoursBefore: 6 });
    const place = await addPlace(t);
    await setDefault(t, place.id);
    const view = await t.games.guestView(G, guestTokenOf(t.group));
    expect(GuestGameSchema.parse(view).games[0]?.place).toMatchObject({ ...PLACE_INPUT, id: place.id });
  });

  it('GRP-09: o link do jogo sem lugar padrão → o jogo sem local, e o grupo do convidado não tem location', async () => {
    const t = await setup({ guestsOpenHoursBefore: 6 });
    const view = await t.games.guestView(G, guestTokenOf(t.group));
    expect(view.games[0]?.place).toBeUndefined();
    expect(view.group).not.toHaveProperty('location');
  });

  it('GRP-63: membro e reserva leem a lista dos lugares, com os arquivados marcados', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const active = await addPlace(t, placeNamed('Ativa'));
    const old = await addPlace(t, placeNamed('Antiga'));
    await t.places.archive(OWNER, t.group.id, old.id, { version: 1 });
    for (const who of [A, R]) {
      const list = await t.places.list(who, t.group.id);
      expect(list.map((p) => [p.id, p.archivedAt])).toEqual([
        [active.id, undefined],
        [old.id, THURSDAY_10H.toISOString()],
      ]);
    }
  });

  it('GRP-63: o convidado não lê a lista dos lugares → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A], reservesOpenHoursBefore: 48, guestsOpenHoursBefore: 48 });
    await addPlace(t);
    await t.guestConfirmInOrder(G);
    await expectAppError(t.places.list(G, t.group.id), 'GROUP_NOT_FOUND', 404);
  });
});

describe('grupo arquivado: lugares só leitura (GRP-32)', () => {
  it('GRP-32: com o grupo arquivado, cadastrar, editar, arquivar e desarquivar um lugar → GROUP_ARCHIVED (409)', async () => {
    const t = await setup();
    const active = await addPlace(t, placeNamed('Ativa'));
    const old = await addPlace(t, placeNamed('Antiga'));
    const archived = await t.places.archive(OWNER, t.group.id, old.id, { version: 1 });
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(t.places.create(OWNER, t.group.id, PLACE_INPUT), 'GROUP_ARCHIVED', 409);
    await expectAppError(
      t.places.update(OWNER, t.group.id, active.id, { ...placeNamed('X'), version: 1 }),
      'GROUP_ARCHIVED',
      409,
    );
    await expectAppError(
      t.places.archive(OWNER, t.group.id, active.id, { version: 1 }),
      'GROUP_ARCHIVED',
      409,
    );
    await expectAppError(
      t.places.unarchive(OWNER, t.group.id, old.id, { version: archived.version }),
      'GROUP_ARCHIVED',
      409,
    );
    expect(storedPlaces(t).map((p) => [p.name, p.version])).toEqual([
      ['Ativa', 1],
      ['Antiga', archived.version],
    ]);
  });

  it('GRP-32: com o grupo arquivado, mudar o lugar padrão no PATCH → GROUP_ARCHIVED', async () => {
    const t = await setup();
    const place = await addPlace(t);
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(setDefault(t, place.id), 'GROUP_ARCHIVED', 409);
  });

  it('GRP-32: a lista dos lugares continua de leitura para membros e reservas', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await addPlace(t);
    await t.groups.archive(OWNER, t.group.id);
    for (const who of [OWNER, A, R]) expect(await t.places.list(who, t.group.id)).toHaveLength(1);
  });

  it('GRP-32: a ordem dos erros nos lugares (GRP-52): GROUP_NOT_FOUND → GROUP_PERMISSION_DENIED → GROUP_ARCHIVED', async () => {
    const t = await setup({ members: [A] });
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(t.places.create(OUTSIDER, t.group.id, PLACE_INPUT), 'GROUP_NOT_FOUND', 404);
    await expectDenied(t.places.create(A, t.group.id, PLACE_INPUT), 'settings.edit');
    await expectAppError(t.places.create(OWNER, t.group.id, PLACE_INPUT), 'GROUP_ARCHIVED', 409);
  });
});

// Horários e jogo próprio (ADR 0015, `.claude/work/horarios-jogo.md`): GRP-64–67 e as regras do jogo que passaram a
// valer para os próximos jogos (GRP-09, 10, 11, 12, 16, 24, 25, 31, 42, 45, 46, 62). O grupo do `setup` joga sexta,
// 19:00–22:00 (São Paulo); o relógio começa na quinta 05/11 10:00.

/** Sábado 07/11, o dia do 2º horário dos testes (09:00–11:00 em São Paulo = 12:00Z–14:00Z). */
const SAT = '2026-11-07';
const SATURDAY: ScheduleInput = { weekday: 6, start: '09:00', end: '11:00' };

type T = Awaited<ReturnType<typeof setup>>;

/** O dono cria um horário pelo service (GRP-64). */
async function addSchedule(t: T, input: ScheduleInput = SATURDAY) {
  return t.schedules.create(OWNER, t.group.id, input);
}

/** O horário gravado (a versão atual, para mandar na edição). */
const storedSchedule = (t: T, scheduleId: string) =>
  t.store.schedulesOf(t.group.id).find((x) => x.id === scheduleId);
const versionOf = (t: T, scheduleId: string) => storedSchedule(t, scheduleId)?.version ?? 0;

/** Grupo com o horário de sábado, e o id do jogo de sábado 07/11. */
async function withSaturday(opts: SetupOpts = {}, input: ScheduleInput = SATURDAY) {
  const t = await setup(opts);
  const sat = await addSchedule(t, input);
  return { ...t, sat, satGame: gameIdOf(sat.id, SAT) };
}

const gameIn = (list: Game[], gameId: string): Game | undefined => list.find((g) => g.id === gameId);

describe('horários do grupo (GRP-64)', () => {
  it('GRP-64: o grupo nasce com o 1º horário, com o dia, o início e o fim do form de criar', async () => {
    const t = await setup();
    expect(GroupSchema.parse(t.group)).toBeTruthy();
    expect(t.group.schedules).toEqual([
      { id: expect.any(String), version: 1, weekday: 5, start: '19:00', end: '22:00' },
    ]);
    expect(t.group).not.toHaveProperty('time');
    expect(t.group).not.toHaveProperty('weekday');
    expect(t.store.scheduleCounters(t.group.id).scheduleCount).toBe(1);
    expect((await t.groups.get(OWNER, t.group.id)).schedules.map((x) => x.id)).toEqual([t.schedule.id]);
  });

  it('GRP-34: o form de criar manda o início e o fim do 1º horário (sai o time)', () => {
    expect(CreateGroupInputSchema.safeParse(INPUT).success).toBe(true);
    const { end: _end, ...withoutEnd } = INPUT;
    expect(CreateGroupInputSchema.safeParse(withoutEnd).success).toBe(false);
    const { start: _start, end: _end2, ...old } = INPUT;
    expect(CreateGroupInputSchema.safeParse({ ...old, time: '19:00' }).success).toBe(false);
  });

  it('GRP-64: o dono cria um horário → ele vem com version 1 e aparece no grupo e na lista, por dia e início', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const sat = await addSchedule(t);
    expect(ScheduleSchema.parse(sat)).toMatchObject({ ...SATURDAY, version: 1 });
    expect(sat.archivedAt).toBeUndefined();
    expect((await t.groups.get(OWNER, t.group.id)).schedules.map((x) => x.id)).toEqual([
      t.schedule.id,
      sat.id,
    ]);
    for (const who of [A, R])
      expect((await t.schedules.list(who, t.group.id)).map((x) => [x.weekday, x.start, x.end])).toEqual([
        [5, '19:00', '22:00'],
        [6, '09:00', '11:00'],
      ]);
    await expectAppError(t.schedules.list(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
  });

  it('GRP-64: o horário pode ter o seu lugar, as suas vagas e o seu mínimo', async () => {
    const t = await setup();
    const place = await addPlace(t);
    const sat = await addSchedule(t, { ...SATURDAY, placeId: place.id, slots: 14, minPlayers: 10 });
    expect(sat).toMatchObject({ placeId: place.id, slots: 14, minPlayers: 10 });
  });

  it('GRP-64: o lugar do horário tem que ser um lugar ativo do grupo; outro → PLACE_NOT_FOUND', async () => {
    const t = await setup();
    const archived = await addPlace(t, placeNamed('Arquivado'));
    await t.places.archive(OWNER, t.group.id, archived.id, { version: archived.version });
    const other = await t.groups.create(OWNER, { ...INPUT, name: 'Outro' });
    await t.places.create(OWNER, other.id, placeNamed('De outro'));
    const foreign = t.store.placesOf(other.id)[0] as StoredPlace;
    for (const placeId of [archived.id, foreign.id, randomUUID()]) {
      await expectAppError(addSchedule(t, { ...SATURDAY, placeId }), 'PLACE_NOT_FOUND', 404);
    }
    expect(t.store.schedulesOf(t.group.id)).toHaveLength(1);
  });

  it('GRP-64: criar é de quem tem settings.edit: o membro sem cargo recebe GROUP_PERMISSION_DENIED, o Admin cria', async () => {
    const t = await withAdmin();
    await expectDenied(t.schedules.create(B, t.group.id, SATURDAY), 'settings.edit');
    await expectDenied(t.schedules.create(R, t.group.id, SATURDAY), 'settings.edit');
    await expectAppError(t.schedules.create(OUTSIDER, t.group.id, SATURDAY), 'GROUP_NOT_FOUND', 404);
    expect(t.store.schedulesOf(t.group.id)).toHaveLength(1);
    const sat = await t.schedules.create(A, t.group.id, SATURDAY);
    expect(sat.weekday).toBe(6);
  });

  it('GRP-64: o jogo dura de 30 min a 6 h, com o fim depois do início no mesmo dia; fora disso o contrato recusa no end', () => {
    for (const ok of [
      { start: '19:00', end: '19:30' },
      { start: '09:00', end: '15:00' },
      { start: '18:00', end: '23:59' },
    ])
      expect(ScheduleInputSchema.safeParse({ weekday: 5, ...ok }).success).toBe(true);
    for (const bad of [
      { start: '19:00', end: '19:29' },
      { start: '09:00', end: '15:01' },
      { start: '19:00', end: '19:00' },
      { start: '21:00', end: '19:00' },
      { start: '23:00', end: '00:30' },
    ]) {
      const result = ScheduleInputSchema.safeParse({ weekday: 5, ...bad });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['end']);
      expect(UpdateScheduleInputSchema.safeParse({ weekday: 5, version: 1, ...bad }).success).toBe(false);
    }
  });

  it('GRP-64: até 3 horários ativos; o 4º responde SCHEDULE_LIMIT_REACHED com o max do plano', async () => {
    expect(SCHEDULE_LIMIT_BY_PLAN.free).toBe(3);
    const t = await setup();
    await addSchedule(t);
    await addSchedule(t, { weekday: 3, start: '19:00', end: '21:00' });
    const err = await expectAppError(
      addSchedule(t, { weekday: 1, start: '19:00', end: '21:00' }),
      'SCHEDULE_LIMIT_REACHED',
      409,
    );
    expect(err.details).toEqual({ max: 3 });
    expect(t.store.schedulesOf(t.group.id)).toHaveLength(3);
  });

  it('GRP-64: dois horários criados ao mesmo tempo com 2 ativos → só um entra, o outro recebe SCHEDULE_LIMIT_REACHED', async () => {
    const t = await withSaturday();
    // Outra criação gravada entre a leitura do service e a gravação: a revisão muda e o service relê.
    t.store.hooks.beforeScheduleWrite.push((groupId) =>
      t.store.forceSchedule({
        id: randomUUID(),
        groupId,
        weekday: 3,
        start: '19:00',
        end: '21:00',
        createdAt: THURSDAY_10H.toISOString(),
        updatedAt: THURSDAY_10H.toISOString(),
      }),
    );
    await expectAppError(
      addSchedule(t, { weekday: 1, start: '19:00', end: '21:00' }),
      'SCHEDULE_LIMIT_REACHED',
      409,
    );
    expect(t.store.scheduleStale).toContain('create');
    expect(t.store.schedulesOf(t.group.id).filter((x) => x.archivedAt === undefined)).toHaveLength(3);
  });

  it('GRP-64: mais de um horário no mesmo dia pode, se não se sobrepõem', async () => {
    const t = await setup();
    const early = await addSchedule(t, { weekday: 5, start: '15:00', end: '17:00' });
    expect((await t.groups.get(OWNER, t.group.id)).schedules.map((x) => x.id)).toEqual([
      early.id,
      t.schedule.id,
    ]);
  });
});

describe('horários sem sobreposição (GRP-65)', () => {
  it('GRP-65: bater com outro horário ativo do mesmo dia → SCHEDULE_OVERLAP com o id dele, e nada é gravado', async () => {
    const t = await setup();
    for (const bad of [
      { start: '20:00', end: '23:00' },
      { start: '18:00', end: '19:30' },
      { start: '19:00', end: '22:00' },
      { start: '20:00', end: '21:00' },
      { start: '18:00', end: '23:00' },
    ]) {
      const err = await expectAppError(addSchedule(t, { weekday: 5, ...bad }), 'SCHEDULE_OVERLAP', 409);
      expect(err.details).toEqual({ scheduleId: t.schedule.id });
    }
    expect(t.store.schedulesOf(t.group.id)).toHaveLength(1);
  });

  it('GRP-65: o fim é exclusivo: um começa quando o outro acaba (22:00–23:00 e 17:00–19:00 com o de 19:00–22:00)', async () => {
    const t = await setup();
    await addSchedule(t, { weekday: 5, start: '22:00', end: '23:00' });
    await addSchedule(t, { weekday: 5, start: '17:00', end: '19:00' });
    expect(t.store.schedulesOf(t.group.id)).toHaveLength(3);
  });

  it('GRP-65: no outro dia da semana, o mesmo horário não bate', async () => {
    const t = await setup();
    const thu = await addSchedule(t, { weekday: 4, start: '19:00', end: '22:00' });
    expect(thu.weekday).toBe(4);
  });

  it('GRP-65: editar para bater com outro → SCHEDULE_OVERLAP; editar o próprio horário sem mudar a hora não bate com ele mesmo', async () => {
    const t = await withSaturday();
    const err = await expectAppError(
      t.schedules.update(OWNER, t.group.id, t.sat.id, {
        weekday: 5,
        start: '21:00',
        end: '23:00',
        version: versionOf(t, t.sat.id),
      }),
      'SCHEDULE_OVERLAP',
      409,
    );
    expect(err.details).toEqual({ scheduleId: t.schedule.id });
    expect(storedSchedule(t, t.sat.id)).toMatchObject({ weekday: 6, start: '09:00', version: 1 });
    const same = await t.schedules.update(OWNER, t.group.id, t.schedule.id, {
      weekday: 5,
      start: '19:00',
      end: '22:00',
      slots: 14,
      version: versionOf(t, t.schedule.id),
    });
    expect(same).toMatchObject({ slots: 14, version: 2 });
  });

  it('GRP-65: um horário arquivado não conta; desarquivar o que bate com um ativo → SCHEDULE_OVERLAP', async () => {
    const t = await withSaturday();
    await t.schedules.archive(OWNER, t.group.id, t.sat.id, { version: versionOf(t, t.sat.id) });
    const other = await addSchedule(t, { weekday: 6, start: '10:00', end: '12:00' });
    const err = await expectAppError(
      t.schedules.unarchive(OWNER, t.group.id, t.sat.id, { version: versionOf(t, t.sat.id) }),
      'SCHEDULE_OVERLAP',
      409,
    );
    expect(err.details).toEqual({ scheduleId: other.id });
    expect(storedSchedule(t, t.sat.id)?.archivedAt).toBeDefined();
  });

  it('GRP-65: dois horários sobrepostos criados ao mesmo tempo → o segundo relê e recebe SCHEDULE_OVERLAP', async () => {
    const t = await setup();
    const raced = randomUUID();
    t.store.hooks.beforeScheduleWrite.push((groupId) =>
      t.store.forceSchedule({
        id: raced,
        groupId,
        weekday: 6,
        start: '09:00',
        end: '11:00',
        createdAt: THURSDAY_10H.toISOString(),
        updatedAt: THURSDAY_10H.toISOString(),
      }),
    );
    const err = await expectAppError(
      addSchedule(t, { weekday: 6, start: '10:00', end: '12:00' }),
      'SCHEDULE_OVERLAP',
      409,
    );
    expect(err.details).toEqual({ scheduleId: raced });
    expect(t.store.schedulesOf(t.group.id).map((x) => x.id)).toEqual([t.schedule.id, raced]);
  });
});

describe('cascata grupo → horário → jogo (GRP-66)', () => {
  it('GRP-66: as vagas do horário valem para os jogos dele; o outro horário segue as do grupo', async () => {
    const t = await withSaturday({ members: [A, B, C] }, { ...SATURDAY, slots: 2 });
    for (const id of [A, B, C]) {
      await t.games.confirm(id, t.group.id, t.satGame);
      t.tick();
    }
    const list = await t.games.upcoming(OWNER, t.group.id);
    expect(gameIn(list, t.satGame)).toMatchObject({ slots: 2 });
    expect(ids(gameIn(list, t.satGame)?.waitlist ?? [])).toEqual([C]);
    expect(gameIn(list, t.gameId)).toMatchObject({ slots: 12 });
  });

  it('GRP-66: o mínimo do horário vale para os jogos dele; sem o do horário, vale o do grupo', async () => {
    const t = await withSaturday({}, { ...SATURDAY, minPlayers: 4 });
    const list = await t.games.upcoming(OWNER, t.group.id);
    expect(gameIn(list, t.satGame)?.minPlayers).toBe(4);
    expect(gameIn(list, t.gameId)?.minPlayers).toBeUndefined();
  });

  it('GRP-66: o valor do próprio jogo vence o do horário', async () => {
    const t = await withSaturday({}, { ...SATURDAY, slots: 14 });
    const game = await t.games.updateGame(OWNER, t.group.id, t.satGame, { version: 0, slots: 16 });
    expect(game).toMatchObject({ slots: 16, slotsCustom: true });
  });

  it('GRP-66: tirar as vagas do horário (o PUT sem elas) → o jogo volta às do grupo', async () => {
    const t = await withSaturday({}, { ...SATURDAY, slots: 14 });
    await t.schedules.update(OWNER, t.group.id, t.sat.id, { ...SATURDAY, version: versionOf(t, t.sat.id) });
    expect(storedSchedule(t, t.sat.id)?.slots).toBeUndefined();
    expect(gameIn(await t.games.upcoming(OWNER, t.group.id), t.satGame)?.slots).toBe(12);
  });

  it('GRP-66: diminuir as vagas do horário abaixo de quem está dentro do próximo jogo que segue o padrão → GAME_SLOTS_BELOW_CONFIRMED', async () => {
    const t = await withSaturday({ members: [A, B, C] }, { ...SATURDAY, slots: 3 });
    for (const id of [A, B, C]) {
      await t.games.confirm(id, t.group.id, t.satGame);
      t.tick();
    }
    const err = await expectAppError(
      t.schedules.update(OWNER, t.group.id, t.sat.id, {
        ...SATURDAY,
        slots: 2,
        version: versionOf(t, t.sat.id),
      }),
      'GAME_SLOTS_BELOW_CONFIRMED',
      409,
    );
    expect(err.details).toEqual({ confirmed: 3 });
    expect(storedSchedule(t, t.sat.id)?.slots).toBe(3);
  });

  it('GRP-66: as camadas são só do grupo e valem para todos os horários', async () => {
    const t = await withSaturday();
    const list = await t.games.upcoming(OWNER, t.group.id);
    // Membros 48 h antes de cada jogo: sexta 19:00 → quarta 19:00; sábado 09:00 → quinta 09:00.
    expect(iso(gameIn(list, t.gameId)?.opensAt ?? '')).toBe('2026-11-04T22:00:00.000Z');
    expect(iso(gameIn(list, t.satGame)?.opensAt ?? '')).toBe('2026-11-05T12:00:00.000Z');
  });

  it('GRP-62: o lugar do horário vem antes do padrão do grupo; sem os dois, o jogo não tem local', async () => {
    const t = await setup();
    const main = await addPlace(t, placeNamed('Quadra do clube'));
    const beach = await addPlace(t, placeNamed('Praia'));
    const sat = await addSchedule(t, { ...SATURDAY, placeId: beach.id });
    const satGame = gameIdOf(sat.id, SAT);
    const before = await t.games.upcoming(OWNER, t.group.id);
    expect(gameIn(before, t.gameId)?.place).toBeUndefined();
    expect(gameIn(before, satGame)?.place).toMatchObject({ id: beach.id, name: 'Praia' });
    await setDefault(t, main.id);
    const after = await t.games.upcoming(OWNER, t.group.id);
    expect(gameIn(after, t.gameId)?.place).toMatchObject({ id: main.id });
    expect(gameIn(after, satGame)?.place).toMatchObject({ id: beach.id });
  });
});

describe('editar e arquivar o horário (GRP-67)', () => {
  it('GRP-67: editar muda o próximo jogo que ainda não virou item', async () => {
    const t = await setup();
    const updated = await t.schedules.update(OWNER, t.group.id, t.schedule.id, {
      weekday: 5,
      start: '20:00',
      end: '23:00',
      version: 1,
    });
    expect(updated).toMatchObject({ start: '20:00', end: '23:00', version: 2 });
    const [game] = await t.games.upcoming(OWNER, t.group.id);
    expect(iso(game?.startsAt ?? '')).toBe('2026-11-06T23:00:00.000Z');
    expect(iso(game?.endsAt ?? '')).toBe('2026-11-07T02:00:00.000Z');
  });

  it('GRP-10: o jogo que já é item fica com o início, o fim e o lugar que tinha, e quem confirmou continua nele', async () => {
    const t = await setup({ members: [A] });
    const old = await addPlace(t, placeNamed('Antiga'));
    const next = await addPlace(t, placeNamed('Nova'));
    const sat = await addSchedule(t, { ...SATURDAY, placeId: old.id });
    const satGame = gameIdOf(sat.id, SAT);
    await t.games.confirm(A, t.group.id, satGame);
    expect(t.store.storedGameById(satGame)).toMatchObject({
      scheduleId: sat.id,
      date: SAT,
      startsAt: '2026-11-07T12:00:00.000Z',
      endsAt: '2026-11-07T14:00:00.000Z',
      placeId: old.id,
    });
    await t.schedules.update(OWNER, t.group.id, sat.id, {
      weekday: 6,
      start: '10:00',
      end: '12:00',
      placeId: next.id,
      version: versionOf(t, sat.id),
    });
    const game = gameIn(await t.games.upcoming(A, t.group.id), satGame);
    expect(iso(game?.startsAt ?? '')).toBe('2026-11-07T12:00:00.000Z');
    expect(iso(game?.endsAt ?? '')).toBe('2026-11-07T14:00:00.000Z');
    expect(game?.place).toMatchObject({ id: old.id, name: 'Antiga' });
    expect(ids(game?.confirmed ?? [])).toEqual([A]);
    expect(game?.me).toEqual({ list: 'confirmed', position: 1 });
  });

  it('GRP-67: editar com a versão velha → VERSION_CONFLICT com a atual, e nada muda', async () => {
    const t = await withSaturday();
    await t.schedules.update(OWNER, t.group.id, t.sat.id, { ...SATURDAY, slots: 14, version: 1 });
    const err = await expectAppError(
      t.schedules.update(OWNER, t.group.id, t.sat.id, { ...SATURDAY, slots: 16, version: 1 }),
      'VERSION_CONFLICT',
      409,
    );
    expect(err.details).toEqual({ currentVersion: 2 });
    expect(storedSchedule(t, t.sat.id)?.slots).toBe(14);
  });

  it('GRP-67: editar e arquivar são de quem tem settings.edit', async () => {
    const t = await withAdmin();
    const sat = await addSchedule(t);
    await expectDenied(
      t.schedules.update(B, t.group.id, sat.id, { ...SATURDAY, version: 1 }),
      'settings.edit',
    );
    await expectDenied(t.schedules.archive(B, t.group.id, sat.id, { version: 1 }), 'settings.edit');
    await expectAppError(
      t.schedules.archive(OUTSIDER, t.group.id, sat.id, { version: 1 }),
      'GROUP_NOT_FOUND',
      404,
    );
    const archived = await t.schedules.archive(A, t.group.id, sat.id, { version: 1 });
    expect(archived.archivedAt).toBe(THURSDAY_10H.toISOString());
  });

  it('GRP-67: horário que não é do grupo → SCHEDULE_NOT_FOUND (404)', async () => {
    const t = await setup();
    const other = await t.groups.create(OWNER, { ...INPUT, name: 'Outro' });
    const foreign = (other.schedules[0] as Group['schedules'][number]).id;
    for (const id of [foreign, randomUUID()]) {
      await expectAppError(
        t.schedules.update(OWNER, t.group.id, id, { ...SATURDAY, version: 1 }),
        'SCHEDULE_NOT_FOUND',
        404,
      );
      await expectAppError(
        t.schedules.archive(OWNER, t.group.id, id, { version: 1 }),
        'SCHEDULE_NOT_FOUND',
        404,
      );
      await expectAppError(
        t.schedules.unarchive(OWNER, t.group.id, id, { version: 1 }),
        'SCHEDULE_NOT_FOUND',
        404,
      );
    }
  });

  it('GRP-67: arquivar → o horário fica na lista com archivedAt, sai do grupo e não gera mais jogos', async () => {
    const t = await withSaturday({ members: [A] });
    const archived = await t.schedules.archive(OWNER, t.group.id, t.sat.id, { version: 1 });
    expect(archived).toMatchObject({ id: t.sat.id, archivedAt: THURSDAY_10H.toISOString(), version: 2 });
    expect(
      (await t.schedules.list(OWNER, t.group.id)).find((x) => x.id === t.sat.id)?.archivedAt,
    ).toBeDefined();
    expect((await t.groups.get(OWNER, t.group.id)).schedules.map((x) => x.id)).toEqual([t.schedule.id]);
    expect((await t.games.upcoming(A, t.group.id)).map((g) => g.id)).toEqual([t.gameId]);
    await expectAppError(t.games.confirm(A, t.group.id, t.satGame), 'GAME_NOT_FOUND', 404);
  });

  it('GRP-67: arquivar cancela o próximo jogo do horário e avisa a lista (GRP-24), menos quem arquivou', async () => {
    const t = await withSaturday({ members: [A, B] });
    for (const id of [A, B, OWNER]) {
      await t.games.confirm(id, t.group.id, t.satGame);
      t.tick();
    }
    await t.games.confirm(A, t.group.id, t.gameId);
    await t.schedules.archive(OWNER, t.group.id, t.sat.id, { version: 1 });
    expect(t.store.storedGameById(t.satGame)?.cancelledAt).toBeDefined();
    expect(ofType(t.sent, 'game_cancelled').sort()).toEqual([A, B].sort());
    // O jogo do outro horário continua valendo.
    expect(t.store.storedGameById(t.gameId)?.cancelledAt).toBeUndefined();
  });

  it('GRP-67: arquivar com o próximo jogo ainda virtual → nada vira item e ninguém é avisado', async () => {
    const t = await withSaturday();
    await t.schedules.archive(OWNER, t.group.id, t.sat.id, { version: 1 });
    expect(t.store.storedGameById(t.satGame)).toBeUndefined();
    expect(t.sent).toEqual([]);
  });

  it('GRP-67: arquivar com o próximo jogo em andamento → ele fica como está', async () => {
    const t = await withSaturday({ members: [A] });
    await t.games.confirm(A, t.group.id, t.satGame);
    t.clock.now = new Date('2026-11-07T13:00:00.000Z');
    await t.schedules.archive(OWNER, t.group.id, t.sat.id, { version: 1 });
    expect(t.store.storedGameById(t.satGame)?.cancelledAt).toBeUndefined();
    expect(ofType(t.sent, 'game_cancelled')).toEqual([]);
  });

  it('GRP-67: arquivar de novo devolve como está, sem avisar outra vez', async () => {
    const t = await withSaturday({ members: [A] });
    await t.games.confirm(A, t.group.id, t.satGame);
    const first = await t.schedules.archive(OWNER, t.group.id, t.sat.id, { version: 1 });
    const again = await t.schedules.archive(OWNER, t.group.id, t.sat.id, { version: 1 });
    expect(again.archivedAt).toBe(first.archivedAt);
    expect(ofType(t.sent, 'game_cancelled')).toEqual([A]);
  });

  it('GRP-67: o último horário ativo não pode ser arquivado → SCHEDULE_LAST', async () => {
    const t = await withSaturday();
    await t.schedules.archive(OWNER, t.group.id, t.sat.id, { version: 1 });
    await expectAppError(
      t.schedules.archive(OWNER, t.group.id, t.schedule.id, { version: 1 }),
      'SCHEDULE_LAST',
      409,
    );
    expect(storedSchedule(t, t.schedule.id)?.archivedAt).toBeUndefined();
  });

  it('GRP-67: o arquivado não conta no limite; desarquivar confere o limite', async () => {
    const t = await withSaturday();
    await t.schedules.archive(OWNER, t.group.id, t.sat.id, { version: 1 });
    await addSchedule(t, { weekday: 3, start: '19:00', end: '21:00' });
    await addSchedule(t, { weekday: 1, start: '19:00', end: '21:00' });
    const err = await expectAppError(
      t.schedules.unarchive(OWNER, t.group.id, t.sat.id, { version: versionOf(t, t.sat.id) }),
      'SCHEDULE_LIMIT_REACHED',
      409,
    );
    expect(err.details).toEqual({ max: 3 });
  });

  it('GRP-67: desarquivar volta o horário e os jogos dele; o que não está arquivado volta como está', async () => {
    const t = await withSaturday();
    await t.schedules.archive(OWNER, t.group.id, t.sat.id, { version: 1 });
    const back = await t.schedules.unarchive(OWNER, t.group.id, t.sat.id, { version: 2 });
    expect(back.archivedAt).toBeUndefined();
    expect(back.version).toBe(3);
    expect((await t.games.upcoming(OWNER, t.group.id)).map((g) => g.id)).toEqual([t.gameId, t.satGame]);
    expect((await t.schedules.unarchive(OWNER, t.group.id, t.sat.id, { version: 3 })).version).toBe(3);
  });

  it('GRP-67: arquivar ou desarquivar com a versão velha → VERSION_CONFLICT', async () => {
    const t = await withSaturday();
    await t.schedules.update(OWNER, t.group.id, t.sat.id, { ...SATURDAY, slots: 14, version: 1 });
    await expectAppError(
      t.schedules.archive(OWNER, t.group.id, t.sat.id, { version: 1 }),
      'VERSION_CONFLICT',
      409,
    );
    await t.schedules.archive(OWNER, t.group.id, t.sat.id, { version: 2 });
    await expectAppError(
      t.schedules.unarchive(OWNER, t.group.id, t.sat.id, { version: 2 }),
      'VERSION_CONFLICT',
      409,
    );
  });

  it('GRP-16: o PATCH do grupo não muda os horários: dia, início e fim ficam fora', () => {
    expect(
      UpdateGroupInputSchema.parse({
        version: 1,
        slots: 14,
        weekday: 2,
        start: '20:00',
        end: '22:00',
        time: '20:00',
      }),
    ).toEqual({ version: 1, slots: 14 });
  });
});

describe('o jogo de um horário (GRP-10, 12)', () => {
  it('GRP-10: o id do jogo é o horário + a data, e o jogo traz o horário e o fim', async () => {
    const t = await setup();
    const [game] = await t.games.upcoming(OWNER, t.group.id);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game).toMatchObject({ id: `${t.schedule.id}_${DATE}`, scheduleId: t.schedule.id, date: DATE });
    expect(iso(game?.startsAt ?? '')).toBe('2026-11-06T22:00:00.000Z');
    expect(iso(game?.endsAt ?? '')).toBe('2026-11-07T01:00:00.000Z');
    expect(t.store.gameCount()).toBe(0);
  });

  it('GRP-10: o jogo vira item na 1ª escrita, com o início, o fim e o lugar daquela hora', async () => {
    const t = await setup({ members: [A] });
    const place = await addPlace(t);
    await setDefault(t, place.id);
    await t.games.confirm(A, t.group.id, t.gameId);
    expect(t.store.storedGameById(t.gameId)).toMatchObject({
      id: t.gameId,
      groupId: t.group.id,
      scheduleId: t.schedule.id,
      date: DATE,
      startsAt: '2026-11-06T22:00:00.000Z',
      endsAt: '2026-11-07T01:00:00.000Z',
      placeId: place.id,
    });
    expect((await t.store.games.listByGroup(t.group.id)).map((g) => g.id)).toEqual([t.gameId]);
  });

  it('GRP-12: em andamento do início até o fim do horário; no fim, o próximo é o da semana seguinte', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, { ...INPUT, end: '20:30' });
    s.clock.now = new Date('2026-11-06T23:29:00.000Z');
    const [during] = await s.games.upcoming(OWNER, group.id);
    expect(during).toMatchObject({ date: DATE, status: 'in_progress' });
    expect(iso(during?.endsAt ?? '')).toBe('2026-11-06T23:30:00.000Z');
    s.clock.now = new Date('2026-11-06T23:30:00.000Z');
    const [after] = await s.games.upcoming(OWNER, group.id);
    expect(after).toMatchObject({ date: NEXT_DATE, status: 'scheduled' });
  });

  it('GRP-12: o jogo de 3 h não tem mais 3 h fixas: um horário de 6 h fica em andamento até o fim', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, { ...INPUT, start: '17:00', end: '23:00' });
    s.clock.now = new Date('2026-11-07T01:30:00.000Z');
    const [game] = await s.games.upcoming(OWNER, group.id);
    expect(game).toMatchObject({ date: DATE, status: 'in_progress' });
  });
});

describe('próximos jogos (GRP-11)', () => {
  it('GRP-11: um jogo por horário ativo, em ordem de início', async () => {
    const t = await withSaturday({ members: [A] });
    const wed = await addSchedule(t, { weekday: 3, start: '19:00', end: '21:00' });
    const list = await t.games.upcoming(A, t.group.id);
    expect(list.map((g) => [g.id, g.date])).toEqual([
      [t.gameId, DATE],
      [t.satGame, SAT],
      [gameIdOf(wed.id, '2026-11-11'), '2026-11-11'],
    ]);
    for (const g of list) expect(GameSchema.parse(g)).toBeTruthy();
  });

  it('GRP-11: o jogo que terminou sai dos próximos; ele fica guardado, mas pedir ou confirmar nele → GAME_NOT_FOUND', async () => {
    const t = await withSaturday({ members: [A, B] });
    await t.games.confirm(A, t.group.id, t.gameId);
    t.clock.now = FRIDAY_22H01;
    expect((await t.games.upcoming(A, t.group.id)).map((g) => g.id)).toEqual([
      t.satGame,
      t.gameAt(NEXT_DATE),
    ]);
    await expectAppError(t.games.confirm(B, t.group.id, t.gameId), 'GAME_NOT_FOUND', 404);
    await expectAppError(t.games.gameRoster(A, t.group.id, t.gameId), 'GAME_NOT_FOUND', 404);
    expect(t.store.storedGameById(t.gameId)).toBeDefined();
  });

  it('GRP-11: o jogo que já é item continua nos próximos se o horário mudou de dia; o seguinte já segue o novo', async () => {
    const t = await withSaturday({ members: [A] });
    await t.games.confirm(A, t.group.id, t.satGame);
    await t.schedules.update(OWNER, t.group.id, t.sat.id, {
      weekday: 0,
      start: '09:00',
      end: '11:00',
      version: versionOf(t, t.sat.id),
    });
    // Domingo 08/11 09:00–11:00 em São Paulo.
    const sunGame = gameIdOf(t.sat.id, '2026-11-08');
    const list = await t.games.upcoming(A, t.group.id);
    expect(list.map((g) => g.id)).toEqual([t.gameId, t.satGame, sunGame]);
    expect(gameIn(list, t.satGame)).toMatchObject({
      date: SAT,
      startsAt: '2026-11-07T12:00:00.000Z',
      endsAt: '2026-11-07T14:00:00.000Z',
    });
    expect(gameIn(list, sunGame)).toMatchObject({ date: '2026-11-08', scheduleId: t.sat.id });
  });

  it('GRP-11: o id de um horário de outro grupo, ou de um horário que não existe → GAME_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    const other = await t.groups.create(OWNER, { ...INPUT, name: 'Outro' });
    const foreign = gameIdOf((other.schedules[0] as Group['schedules'][number]).id, DATE);
    for (const id of [foreign, gameIdOf(randomUUID(), DATE), `${t.schedule.id}_2026-11-07`]) {
      await expectAppError(t.games.confirm(A, t.group.id, id), 'GAME_NOT_FOUND', 404);
      await expectAppError(t.games.cancel(OWNER, t.group.id, id), 'GAME_NOT_FOUND', 404);
    }
    expect(t.store.gameCount()).toBe(0);
  });

  it('GRP-17: confirmar num jogo não confirma no outro', async () => {
    const t = await withSaturday({ members: [A] });
    const game = await t.games.confirm(A, t.group.id, t.satGame);
    expect(game.id).toBe(t.satGame);
    const list = await t.games.upcoming(A, t.group.id);
    expect(gameIn(list, t.satGame)?.me).toEqual({ list: 'confirmed', position: 1 });
    expect(gameIn(list, t.gameId)?.me).toBeUndefined();
    expect(gameIn(list, t.gameId)?.confirmed).toEqual([]);
  });

  it('GRP-32: grupo arquivado → os próximos jogos dão GROUP_ARCHIVED', async () => {
    const t = await withSaturday({ members: [A] });
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(t.games.upcoming(A, t.group.id), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.games.confirm(A, t.group.id, t.satGame), 'GROUP_ARCHIVED', 409);
  });

  it('GRP-11: "meus grupos" traz o 1º dos próximos jogos de cada grupo, com o id', async () => {
    const t = await withSaturday({ members: [A] });
    await t.games.confirm(A, t.group.id, t.satGame);
    const [mine] = await t.groups.myGroups(A);
    expect(MyGroupSchema.parse(mine)).toBeTruthy();
    expect(mine?.game).toMatchObject({ id: t.gameId, date: DATE, confirmedCount: 0 });
    expect(mine?.schedules.map((x) => x.id)).toEqual([t.schedule.id, t.sat.id]);
  });
});

describe('ações sobre um jogo só (GRP-24, 44, 45, 46)', () => {
  it('GRP-24: cancelar um jogo não cancela o do outro horário, e só a lista dele é avisada', async () => {
    const t = await withSaturday({ members: [A, B] });
    await t.games.confirm(A, t.group.id, t.satGame);
    await t.games.confirm(B, t.group.id, t.gameId);
    const cancelled = await t.games.cancel(OWNER, t.group.id, t.satGame);
    expect(cancelled).toMatchObject({ id: t.satGame, status: 'cancelled' });
    expect(ofType(t.sent, 'game_cancelled')).toEqual([A]);
    const list = await t.games.upcoming(B, t.group.id);
    expect(gameIn(list, t.gameId)?.status).toBe('open');
    expect(gameIn(list, t.satGame)?.status).toBe('cancelled');
  });

  it('GRP-44: reabrir um jogo cancelado não mexe no outro', async () => {
    const t = await withSaturday({ members: [A] });
    await t.games.confirm(A, t.group.id, t.satGame);
    await t.games.cancel(OWNER, t.group.id, t.satGame);
    await t.games.cancel(OWNER, t.group.id, t.gameId);
    const reopened = await t.games.reopen(OWNER, t.group.id, t.satGame);
    expect(reopened).toMatchObject({ id: t.satGame, status: 'open' });
    expect(gameIn(await t.games.upcoming(A, t.group.id), t.gameId)?.status).toBe('cancelled');
  });

  it('GRP-45: as vagas de um jogo mudam só nele; o outro segue o padrão', async () => {
    const t = await withSaturday();
    await t.games.updateGame(OWNER, t.group.id, t.satGame, { version: 0, slots: 14 });
    const list = await t.games.upcoming(OWNER, t.group.id);
    expect(gameIn(list, t.satGame)).toMatchObject({ slots: 14, slotsCustom: true });
    expect(gameIn(list, t.gameId)).toMatchObject({ slots: 12 });
    expect(gameIn(list, t.gameId)?.slotsCustom).toBeFalsy();
  });

  it('GRP-46: o mínimo de um jogo vale só nele', async () => {
    const t = await withSaturday();
    await t.games.updateGame(OWNER, t.group.id, t.satGame, { version: 0, minPlayers: 8 });
    const list = await t.games.upcoming(OWNER, t.group.id);
    expect(gameIn(list, t.satGame)?.minPlayers).toBe(8);
    expect(gameIn(list, t.gameId)?.minPlayers).toBeUndefined();
  });

  it('GRP-45: o padrão do grupo abaixo de quem está dentro de qualquer um dos próximos jogos que o seguem → GAME_SLOTS_BELOW_CONFIRMED', async () => {
    const t = await withSaturday({ members: [A, B, C] });
    for (const id of [A, B, C]) {
      await t.games.confirm(id, t.group.id, t.satGame);
      t.tick();
    }
    const err = await expectAppError(
      t.groups.update(OWNER, t.group.id, { ...t.sv(t.group.id), slots: 2 }),
      'GAME_SLOTS_BELOW_CONFIRMED',
      409,
    );
    expect(err.details).toEqual({ confirmed: 3 });
  });
});

describe('remover, sair e arquivar sobre os próximos jogos (GRP-25, 31, 42)', () => {
  it('GRP-25: o removido perde a vaga em cada um dos próximos jogos, e a fila de cada um sobe', async () => {
    const t = await withSaturday({ members: [A, B] });
    await t.games.updateGame(OWNER, t.group.id, t.satGame, { version: 0, slots: 2 });
    for (const id of [A, OWNER, B]) {
      await t.games.confirm(id, t.group.id, t.satGame);
      t.tick();
    }
    await t.games.confirm(A, t.group.id, t.gameId);
    await t.groups.removeMember(OWNER, t.group.id, pub(A));
    expect(t.store.removeCalls[0]?.players?.map((p) => p.gameId).sort()).toEqual(
      [t.gameId, t.satGame].sort(),
    );
    expect(await t.store.games.getPlayer(t.gameId, A)).toBeUndefined();
    expect(await t.store.games.getPlayer(t.satGame, A)).toBeUndefined();
    const sat = gameIn(await t.games.upcoming(OWNER, t.group.id), t.satGame);
    expect(ids(sat?.confirmed ?? [])).toEqual([OWNER, B]);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([B]);
  });

  it('GRP-25: com um jogo em andamento, a vaga nele fica e a do outro sai', async () => {
    const t = await withSaturday({ members: [A] });
    await t.games.confirm(A, t.group.id, t.gameId);
    await t.games.confirm(A, t.group.id, t.satGame);
    t.clock.now = FRIDAY_20H;
    await t.groups.removeMember(OWNER, t.group.id, pub(A));
    expect(await t.store.games.getPlayer(t.gameId, A)).toBeDefined();
    expect(await t.store.games.getPlayer(t.satGame, A)).toBeUndefined();
  });

  it('GRP-42: quem sai perde a vaga em cada um dos próximos jogos', async () => {
    const t = await withSaturday({ members: [A] });
    await t.games.confirm(A, t.group.id, t.satGame);
    await t.games.confirm(A, t.group.id, t.gameId);
    await t.groups.leave(A, t.group.id);
    expect(await t.store.games.getPlayer(t.gameId, A)).toBeUndefined();
    expect(await t.store.games.getPlayer(t.satGame, A)).toBeUndefined();
  });

  it('GRP-31: arquivar o grupo cancela cada um dos próximos jogos com lista, com o aviso', async () => {
    const t = await withSaturday({ members: [A, B] });
    await t.games.confirm(A, t.group.id, t.satGame);
    await t.games.confirm(B, t.group.id, t.gameId);
    await t.groups.archive(OWNER, t.group.id);
    expect(t.store.storedGameById(t.gameId)?.cancelledAt).toBeDefined();
    expect(t.store.storedGameById(t.satGame)?.cancelledAt).toBeDefined();
    expect(ofType(t.sent, 'game_cancelled').sort()).toEqual([A, B].sort());
  });

  it('GRP-31: arquivar com um jogo em andamento → ele fica, e o outro com lista é cancelado', async () => {
    const t = await withSaturday({ members: [A, B] });
    await t.games.confirm(A, t.group.id, t.gameId);
    await t.games.confirm(B, t.group.id, t.satGame);
    t.clock.now = FRIDAY_20H;
    await t.groups.archive(OWNER, t.group.id);
    expect(t.store.storedGameById(t.gameId)?.cancelledAt).toBeUndefined();
    expect(t.store.storedGameById(t.satGame)?.cancelledAt).toBeDefined();
    expect(ofType(t.sent, 'game_cancelled')).toEqual([B]);
  });
});

describe('o link do jogo mostra os próximos jogos (GRP-09)', () => {
  it('GRP-09: um link só para todos os horários, com os próximos jogos em ordem de início', async () => {
    const t = await withSaturday({ reservesOpenHoursBefore: 48, guestsOpenHoursBefore: 48 });
    const view = await t.games.guestView(G, guestTokenOf(t.group));
    expect(GuestGameSchema.parse(view)).toBeTruthy();
    expect(view.games.map((g) => g.id)).toEqual([t.gameId, t.satGame]);
    expect(view.myTier).toBe('guest');
  });

  it('GRP-09: o convidado confirma em qualquer um deles quando a camada dele abre', async () => {
    const t = await withSaturday({ reservesOpenHoursBefore: 48, guestsOpenHoursBefore: 48 });
    const token = guestTokenOf(t.group);
    const game = await t.games.guestConfirm(G, token, t.satGame);
    expect(game.id).toBe(t.satGame);
    const view = await t.games.guestView(G, token);
    expect(gameIn(view.games, t.satGame)?.me).toEqual({ list: 'confirmed', position: 1 });
    expect(gameIn(view.games, t.gameId)?.me).toBeUndefined();
    await t.games.guestLeave(G, token, t.satGame);
    expect(gameIn((await t.games.guestView(G, token)).games, t.satGame)?.me).toBeUndefined();
  });

  it('GRP-09: pelo link, um jogo que não é um dos próximos → GAME_NOT_FOUND', async () => {
    const t = await setup({ reservesOpenHoursBefore: 48, guestsOpenHoursBefore: 48 });
    await expectAppError(
      t.games.guestConfirm(G, guestTokenOf(t.group), t.gameAt(NEXT_DATE)),
      'GAME_NOT_FOUND',
      404,
    );
  });
});

describe('materializar o jogo (GRP-10) e um jogo por data (GRP-11, 67)', () => {
  it('GRP-10: materialize cria o item com início, fim e lugar, e chamar de novo não muda nada', async () => {
    const t = await setup({ members: [A] });
    const place = await addPlace(t);
    await setDefault(t, place.id);
    expect(t.store.storedGameById(t.gameId)).toBeUndefined();
    await t.games.materialize(OWNER, t.group.id, t.gameId);
    const first = t.store.storedGameById(t.gameId);
    expect(first).toMatchObject({
      id: t.gameId,
      scheduleId: t.schedule.id,
      date: DATE,
      startsAt: '2026-11-06T22:00:00.000Z',
      endsAt: '2026-11-07T01:00:00.000Z',
      placeId: place.id,
    });
    t.tick();
    await t.games.materialize(OWNER, t.group.id, t.gameId);
    expect(t.store.storedGameById(t.gameId)).toEqual(first);
    expect(t.store.gameCount()).toBe(1);
  });

  it('GRP-10: materialize de um jogo que não é um dos próximos → GAME_NOT_FOUND; de quem não participa → GROUP_NOT_FOUND', async () => {
    const t = await setup();
    await expectAppError(t.games.materialize(OWNER, t.group.id, t.gameAt(NEXT_DATE)), 'GAME_NOT_FOUND', 404);
    await expectAppError(t.games.materialize(OUTSIDER, t.group.id, t.gameId), 'GROUP_NOT_FOUND', 404);
    expect(t.store.gameCount()).toBe(0);
  });

  it('GRP-11, 67: horário editado no mesmo sábado, com o jogo de hoje já item → depois das 11h, o próximo é o do sábado seguinte', async () => {
    const t = await withSaturday({ members: [A] });
    await t.games.confirm(A, t.group.id, t.satGame);
    await t.schedules.update(OWNER, t.group.id, t.sat.id, {
      weekday: 6,
      start: '18:00',
      end: '20:00',
      version: versionOf(t, t.sat.id),
    });
    // Sábado 07/11 15:00Z = 12:00 em São Paulo: o jogo das 09–11 (item) já acabou.
    t.clock.now = new Date('2026-11-07T15:00:00.000Z');
    const list = await t.games.upcoming(A, t.group.id);
    const nextSat = list.filter((g) => g.scheduleId === t.sat.id);
    expect(nextSat.map((g) => g.id)).toEqual([gameIdOf(t.sat.id, '2026-11-14')]);
    expect(list.map((g) => g.id)).not.toContain(t.satGame);
  });
});
