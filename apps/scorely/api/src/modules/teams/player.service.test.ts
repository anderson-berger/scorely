import { AppError, appError } from '@scorely/api/src/lib/errors';
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
  SPORT_POSITIONS,
  type Sport,
  UpdatePlayerInputSchema,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// E3 etapa 1 (`.claude/work/e3-times-1.md`, retrabalho 1): posições por pessoa no grupo, TIM-01 a TIM-04.
// O roster (membros e jogo atual) é um fake: quem confere participação e permissão é o service (`requireMember` no list, dono no update).

const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GROUP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333';
/** Reserva. */
const R = '88888888-8888-4888-8888-888888888888';
/** Convidado dentro da lista. */
const G = '99999999-9999-4999-8999-999999999999';
/** Convidado na fila. */
const H = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OUTSIDER = '66666666-6666-4666-8666-666666666666';

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
    inviteToken: 'tok-member',
    reserveInviteToken: 'tok-reserve',
    guestToken: 'tok-guest',
    maxMembers: 30,
    maxReserves: 30,
    ...extra,
  };
}

const member = (userId: string, name: string, role: MemberRole = 'member'): Member => ({
  userId,
  name,
  isOwner: userId === OWNER,
  role,
});

const attendee = (userId: string, name: string, role: Attendee['role'], minute: number): Attendee => ({
  userId,
  name,
  role,
  confirmedAt: new Date(Date.UTC(2026, 10, 4, 22, minute)).toISOString(),
});

/** Ordem do GET /members (GRP-06): quem ordena é o módulo de grupos; aqui a ordem é a do fixture. */
const MEMBERS: Member[] = [
  member(OWNER, 'Dono'),
  member(B, 'Beatriz'),
  member(A, 'Ana'),
  member(R, 'Rafa', 'reserve'),
];

/** Jogo atual: membros e convidados misturados, dentro e na fila. */
function gameOf(confirmed: Attendee[], waitlist: Attendee[]): Game {
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
function setup(opts: { group?: Partial<StoredGroup>; members?: Member[]; game?: Game } = {}) {
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

  const service = createPlayerService({ groups, roster, players, now: () => clock.now });
  /** Grava direto no repositório (posição definida antes, por exemplo em outra semana). */
  const seed = (userId: string, positions: PlayerPosition[], groupId = GROUP_ID) =>
    players.save(groupId, userId, positions, '2026-10-01T00:00:00.000Z');
  return { clock, state, saved, store, service, seed };
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

    for (const p of list) expect(PlayerSchema.parse(p)).toEqual(p);
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
    const cases: [string, Attendee['role']][] = [
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
