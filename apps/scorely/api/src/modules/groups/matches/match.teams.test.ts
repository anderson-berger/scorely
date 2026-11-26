import { appError } from '@scorely/api/src/lib/errors';
import { asGroupId, asPublicGroupId, asUserId, type UserId } from '@scorely/api/src/lib/ids';
import type { GroupAccess } from '@scorely/api/src/modules/groups/group.access';
import { createMatchService } from '@scorely/api/src/modules/groups/matches/match.service';
import { memoryMatches } from '@scorely/api/src/modules/groups/matches/matches.memory';
import type { UserRecord } from '@scorely/api/src/modules/users/user.repository';
import type { GroupPermission, GroupTier, MatchTeamPlayerRef, UpdateMatchInput } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Times da partida (PAR-25, 27, 28, 29). Repositório em memória, grupo falso e relógio fake.

const ANA = asUserId('11111111-1111-4111-8111-111111111111'); // Dono: matches.manage
const BIA = asUserId('22222222-2222-4222-8222-222222222222');
const CAIO = asUserId('33333333-3333-4333-8333-333333333333');
const DUDA = asUserId('44444444-4444-4444-8444-444444444444');
const PUBLIC_ID = asPublicGroupId('K3X9PQ2A');
const GROUP_ID = asGroupId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const PUB = { [ANA]: '1AAAAAAA', [BIA]: '2BBBBBBB', [CAIO]: '3CCCCCCC', [DUDA]: '4DDDDDDD' } as Record<
  string,
  string
>;

const HOUR = 3_600_000;
const T0 = '2026-11-23T10:00:00.000Z';
const START = '2026-11-27T22:00:00.000Z';
const END = '2026-11-28T00:00:00.000Z';
const iso = (base: string, hours: number) => new Date(Date.parse(base) + hours * HOUR).toISOString();

function setup() {
  const clock = { now: new Date(T0) };
  const sent: { userId: UserId; type: string; link?: string | undefined }[] = [];
  const state = {
    participants: new Map<UserId, GroupTier>([
      [ANA, 'member'],
      [BIA, 'member'],
      [CAIO, 'member'],
      [DUDA, 'reserve'],
    ]),
    managers: new Set<UserId>([ANA]),
    /** Quem perdeu o perfil (PAR-28): continua no grupo, mas o lookup de usuários não o acha. */
    noProfile: new Set<UserId>(),
  };
  const groups: GroupAccess = {
    access: async (userId, publicId) => {
      const tier = state.participants.get(userId);
      if (tier === undefined || publicId !== PUBLIC_ID) throw appError('GROUP_NOT_FOUND');
      const permissions: GroupPermission[] = state.managers.has(userId) ? ['matches.manage'] : [];
      return { groupId: GROUP_ID, publicId: PUBLIC_ID, name: 'Pelada de sexta', tier, permissions };
    },
    participants: async () => new Map(state.participants),
    holders: async () => [...state.managers],
  };
  const users = {
    getMany: async (ids: readonly UserId[]): Promise<UserRecord[]> =>
      ids
        .filter((id) => PUB[id] !== undefined && !state.noProfile.has(id))
        .map((id) => ({
          id,
          publicId: PUB[id] as UserRecord['publicId'],
          nickname: (PUB[id] as string).toLowerCase(),
          createdAt: '2026-01-01T00:00:00.000Z',
          version: 1,
        })),
    resolve: async (publicIds: readonly UserRecord['publicId'][]) =>
      new Map(
        Object.entries(PUB)
          .filter(
            ([id, pub]) =>
              publicIds.includes(pub as UserRecord['publicId']) && !state.noProfile.has(id as UserId),
          )
          .map(([id, pub]) => [pub as UserRecord['publicId'], id as UserId]),
      ),
  };
  const notifications = {
    notify: async (userId: UserId, n: { type: string; link?: string }) => {
      sent.push({ userId, type: n.type, link: n.link });
    },
  };
  const service = createMatchService({
    matches: memoryMatches().repo,
    groups,
    users,
    notifications: notifications as never,
    now: () => clock.now,
  });
  const at = (when: string) => {
    clock.now = new Date(when);
  };
  return { service, at, sent, state };
}
type T = ReturnType<typeof setup>;

type Settings = Omit<UpdateMatchInput, 'expectedVersion'>;

function input(over: Partial<Settings> = {}): Settings {
  return {
    startsAt: START,
    endsAt: END,
    teams: 2,
    playersPerTeam: 3,
    membersHours: 72,
    reservesHours: 24,
    guestsHours: 6,
    noGuests: false,
    closeHours: 0,
    resultMode: 'day',
    ...over,
  };
}

/** Cria a partida com o formato dado e põe o relógio com todas as ondas abertas, antes do início. */
async function open(t: T, over: Partial<Settings> = {}) {
  const first = await t.service.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
  const m = await t.service.update(ANA, PUBLIC_ID, first.id, {
    ...input(over),
    expectedVersion: first.version,
  });
  t.at(iso(START, -1));
  return m;
}
const go = (t: T, user: UserId, matchId: string) =>
  t.service.setAttendance(user, PUBLIC_ID, matchId, { status: 'going' });
const notGoing = (t: T, user: UserId, matchId: string) =>
  t.service.setAttendance(user, PUBLIC_ID, matchId, { status: 'not_going' });
const ref = (id: UserId): MatchTeamPlayerRef => ({ kind: 'user', id: PUB[id] as never });
const guestRef = (id: string): MatchTeamPlayerRef => ({ kind: 'guest', id });
const save = (t: T, by: UserId, matchId: string, teams: MatchTeamPlayerRef[][], expectedVersion = 0) =>
  t.service.saveTeams(by, PUBLIC_ID, matchId, { teams, expectedVersion });
const link = (matchId: string) => `/groups/${PUBLIC_ID}/matches/${matchId}`;

type Lineup = NonNullable<Awaited<ReturnType<T['service']['get']>>['lineup']>;
const nameOf = (e: Lineup['unassigned'][number]) => (e.kind === 'player' ? e.user.id : e.name);
const teamIds = (lineup: Lineup | undefined) =>
  lineup?.list.map((team) =>
    team.map((p) => (p.kind === 'player' ? p.user.id : p.kind === 'guest' ? p.guestId : 'gone')),
  );

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return err as { code: string; status: number; details?: unknown };
  }
}

/** ANA, BIA e CAIO (membros) e DUDA (reserva) dentro, nessa ordem. */
async function everyoneIn(t: T, over: Partial<Settings> = {}) {
  const m = await open(t, over);
  await go(t, ANA, m.id);
  await go(t, BIA, m.id);
  await go(t, CAIO, m.id);
  await go(t, DUDA, m.id);
  return m;
}

/** BIA pede um convidado e ANA libera: devolve o id dele. */
async function approvedGuest(t: T, matchId: string) {
  await t.service.requestGuest(BIA, PUBLIC_ID, matchId, { name: 'Primo' });
  const guestId = (await t.service.get(ANA, PUBLIC_ID, matchId)).guestRequests[0]?.id as string;
  await t.service.approveGuest(ANA, PUBLIC_ID, matchId, guestId);
  return guestId;
}

describe('PAR-25: salvar os times', () => {
  it('PAR-25: quem tem matches.manage salva; a resposta traz os times na ordem, com a version, e quem não foi posto fica sem time', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    const saved = await save(t, ANA, m.id, [[ref(ANA), ref(BIA)], [ref(CAIO)]]);
    expect(teamIds(saved.lineup)).toEqual([[PUB[ANA], PUB[BIA]], [PUB[CAIO]]]);
    expect(saved.lineup?.unassigned.map(nameOf)).toEqual([PUB[DUDA]]);
    expect(saved.lineup?.version).toBe(1);
    expect(saved.lineup?.list.flat().every((p) => !p.left)).toBe(true);
  });

  it('PAR-25: quem não tem matches.manage não salva (GROUP_PERMISSION_DENIED)', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    const err = await failure(save(t, BIA, m.id, [[ref(ANA)], [ref(BIA)]]));
    expect(err?.code).toBe('GROUP_PERMISSION_DENIED');
  });

  it('PAR-25: um time pode ficar vazio', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    const saved = await save(t, ANA, m.id, [[ref(ANA), ref(BIA), ref(CAIO), ref(DUDA)], []]);
    expect(saved.lineup?.list[1]).toEqual([]);
    expect(saved.lineup?.unassigned).toEqual([]);
  });

  it('PAR-25: o convidado liberado entra num time pelo id do convidado', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    const guestId = await approvedGuest(t, m.id);
    const saved = await save(t, ANA, m.id, [[guestRef(guestId), ref(ANA)], [ref(BIA)]]);
    expect(saved.lineup?.list[0]?.[0]).toMatchObject({ kind: 'guest', guestId, name: 'Primo', left: false });
  });

  it('PAR-25: de 2 a 10 times; fora disso, VALIDATION_ERROR', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    expect((await failure(save(t, ANA, m.id, [[ref(ANA)]])))?.code).toBe('VALIDATION_ERROR');
    const eleven = Array.from({ length: 11 }, () => [] as MatchTeamPlayerRef[]);
    expect((await failure(save(t, ANA, m.id, eleven)))?.code).toBe('VALIDATION_ERROR');
    const ten = Array.from({ length: 10 }, () => [] as MatchTeamPlayerRef[]);
    expect((await save(t, ANA, m.id, ten)).lineup?.list).toHaveLength(10);
  });

  it('PAR-25: pessoa repetida é VALIDATION_ERROR e nada é gravado', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    const err = await failure(save(t, ANA, m.id, [[ref(ANA)], [ref(ANA)]]));
    expect(err?.code).toBe('VALIDATION_ERROR');
    expect((await t.service.get(ANA, PUBLIC_ID, m.id)).lineup).toBeUndefined();
  });

  it('PAR-25: quem está na fila não entra num time (MATCH_TEAM_PLAYER_OUT, com quem é, e nada é gravado)', async () => {
    const t = setup();
    const m = await everyoneIn(t, { teams: 1, playersPerTeam: 2 }); // ANA e BIA dentro; CAIO e DUDA na fila
    const err = await failure(
      save(t, ANA, m.id, [
        [ref(ANA), ref(CAIO)],
        [ref(BIA), ref(DUDA)],
      ]),
    );
    expect(err).toMatchObject({ code: 'MATCH_TEAM_PLAYER_OUT', status: 409 });
    const players = (err?.details as { players: MatchTeamPlayerRef[] } | undefined)?.players ?? [];
    expect(players).toHaveLength(2);
    expect(players).toEqual(
      expect.arrayContaining([expect.objectContaining(ref(CAIO)), expect.objectContaining(ref(DUDA))]),
    );
    expect((await t.service.get(ANA, PUBLIC_ID, m.id)).lineup).toBeUndefined();
  });

  it('PAR-25: quem disse "não vou", quem não respondeu e o convidado só pedido não entram (MATCH_TEAM_PLAYER_OUT)', async () => {
    const t = setup();
    const m = await open(t);
    await go(t, ANA, m.id);
    await notGoing(t, BIA, m.id);
    await t.service.requestGuest(DUDA, PUBLIC_ID, m.id, { name: 'Primo' });
    const guestId = (await t.service.get(ANA, PUBLIC_ID, m.id)).guestRequests[0]?.id as string;
    const err = await failure(
      save(t, ANA, m.id, [
        [ref(ANA), ref(BIA)],
        [ref(CAIO), guestRef(guestId)],
      ]),
    );
    expect(err?.code).toBe('MATCH_TEAM_PLAYER_OUT');
    expect((err?.details as { players: unknown[] } | undefined)?.players).toHaveLength(3);
  });

  it('PAR-25: a version dos times é conferida (VERSION_CONFLICT); salvar de novo troca a divisão inteira', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    await save(t, ANA, m.id, [[ref(ANA), ref(BIA)], [ref(CAIO)]]);
    const stale = await failure(save(t, ANA, m.id, [[ref(ANA)], [ref(BIA)]], 0));
    expect(stale?.code).toBe('VERSION_CONFLICT');
    const again = await save(t, ANA, m.id, [[ref(DUDA)], [ref(ANA), ref(BIA), ref(CAIO)], []], 1);
    expect(again.lineup?.version).toBe(2);
    expect(again.lineup?.list.map((team) => team.length)).toEqual([1, 3, 0]);
  });

  it('PAR-25: vale durante o jogo, mas depois do fim é MATCH_FINISHED (409)', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    t.at(iso(START, 1));
    await t.service.start(ANA, PUBLIC_ID, m.id);
    const playing = await save(t, ANA, m.id, [[ref(ANA)], [ref(BIA)]]);
    expect(playing.lineup?.version).toBe(1);
    t.at(iso(END, 1));
    await save(t, ANA, m.id, [[ref(BIA)], [ref(ANA)]], 1);
    await t.service.finish(ANA, PUBLIC_ID, m.id);
    const err = await failure(save(t, ANA, m.id, [[ref(BIA)], [ref(ANA)]], 1));
    expect(err).toMatchObject({ code: 'MATCH_FINISHED', status: 409 });
  });

  it('PAR-25: passada a hora do fim, sem finalizar, ainda se salvam os times', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    t.at(iso(END, 5));
    const saved = await save(t, ANA, m.id, [[ref(ANA)], [ref(BIA)]]);
    expect(saved.lineup?.version).toBe(1);
  });

  it('PAR-25: partida cancelada responde MATCH_CANCELLED', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    await t.service.cancel(ANA, PUBLIC_ID, m.id);
    const err = await failure(save(t, ANA, m.id, [[ref(ANA)], [ref(BIA)]]));
    expect(err?.code).toBe('MATCH_CANCELLED');
  });

  it('PAR-25: o número de times não depende do formato (3 times numa partida 2 × 3)', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    const saved = await save(t, ANA, m.id, [[ref(ANA)], [ref(BIA)], [ref(CAIO)]]);
    expect(saved.lineup?.list).toHaveLength(3);
  });

  it('PAR-25: actions.manageTeams vale para quem tem matches.manage, até o fim e sem cancelar', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    expect((await t.service.get(ANA, PUBLIC_ID, m.id)).actions.manageTeams).toBe(true);
    expect((await t.service.get(BIA, PUBLIC_ID, m.id)).actions.manageTeams).toBe(false);
    t.at(iso(START, 1));
    await t.service.start(ANA, PUBLIC_ID, m.id);
    expect((await t.service.get(ANA, PUBLIC_ID, m.id)).actions.manageTeams).toBe(true);
    t.at(iso(END, 1));
    expect((await t.service.get(ANA, PUBLIC_ID, m.id)).actions.manageTeams).toBe(true);
    await t.service.finish(ANA, PUBLIC_ID, m.id);
    expect((await t.service.get(ANA, PUBLIC_ID, m.id)).actions.manageTeams).toBe(false);
  });
});

describe('PAR-27: todos veem os times', () => {
  it('PAR-27: quem só participa vê os times salvos; sem times salvos, a partida vem sem lineup', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    expect((await t.service.get(BIA, PUBLIC_ID, m.id)).lineup).toBeUndefined();
    await save(t, ANA, m.id, [[ref(ANA), ref(BIA)], [ref(CAIO)]]);
    const seen = await t.service.get(BIA, PUBLIC_ID, m.id);
    expect(teamIds(seen.lineup)).toEqual([[PUB[ANA], PUB[BIA]], [PUB[CAIO]]]);
    expect(seen.lineup?.list[0]?.[0]).toMatchObject({ kind: 'player', tier: 'member' });
    expect(seen.lineup?.unassigned).toHaveLength(1);
  });

  it('PAR-27: os times de uma partida cancelada continuam guardados e visíveis', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    await save(t, ANA, m.id, [[ref(ANA)], [ref(BIA)]]);
    await t.service.cancel(ANA, PUBLIC_ID, m.id);
    expect((await t.service.get(BIA, PUBLIC_ID, m.id)).lineup?.list).toHaveLength(2);
  });
});

describe('PAR-28: a lista muda, os times não', () => {
  it('PAR-28: quem diz "não vou" continua no time, com a marca left', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    await save(t, ANA, m.id, [[ref(ANA), ref(BIA)], [ref(CAIO)]]);
    await notGoing(t, BIA, m.id);
    const seen = await t.service.get(CAIO, PUBLIC_ID, m.id);
    expect(seen.lineup?.list[0]?.map((p) => p.left)).toEqual([false, true]);
  });

  it('PAR-28: quem sobe da fila fica sem time, e quem saiu do grupo continua no time com left', async () => {
    const t = setup();
    const m = await everyoneIn(t, { teams: 1, playersPerTeam: 3 }); // ANA, BIA e CAIO dentro; DUDA na fila
    await save(t, ANA, m.id, [[ref(ANA), ref(BIA)], [ref(CAIO)]]);
    t.state.participants.delete(BIA);
    const seen = await t.service.get(ANA, PUBLIC_ID, m.id);
    expect(seen.lineup?.list[0]?.map((p) => p.left)).toEqual([false, true]);
    expect(seen.lineup?.unassigned.map(nameOf)).toEqual([PUB[DUDA]]);
  });

  it('PAR-28: o convidado tirado continua no time com left', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    const guestId = await approvedGuest(t, m.id);
    await save(t, ANA, m.id, [[guestRef(guestId)], [ref(ANA)]]);
    await t.service.removeGuest(BIA, PUBLIC_ID, m.id, guestId);
    const seen = await t.service.get(ANA, PUBLIC_ID, m.id);
    expect(seen.lineup?.list[0]?.[0]).toMatchObject({ kind: 'guest', guestId, left: true });
  });

  it('PAR-28: quem confirma depois de salvar fica sem time, e os times salvos não mudam', async () => {
    const t = setup();
    const m = await open(t);
    await go(t, ANA, m.id);
    await go(t, BIA, m.id);
    await save(t, ANA, m.id, [[ref(ANA)], [ref(BIA)]]);
    await go(t, CAIO, m.id);
    const seen = await t.service.get(ANA, PUBLIC_ID, m.id);
    expect(seen.lineup?.unassigned.map(nameOf)).toEqual([PUB[CAIO]]);
    expect(teamIds(seen.lineup)).toEqual([[PUB[ANA]], [PUB[BIA]]]);
  });
});

describe('PAR-25: o nome de quem saiu', () => {
  type Out = { kind: string; id: string; name?: string };
  const outOf = (err: { details?: unknown } | undefined) =>
    (err?.details as { players: Out[] } | undefined)?.players ?? [];

  it('PAR-25: details.players traz o nome de quem tem conta (apelido) e do convidado, mesmo de quem a tela nunca teve', async () => {
    const t = setup();
    const m = await everyoneIn(t, { teams: 1, playersPerTeam: 2 }); // CAIO e DUDA na fila
    await t.service.requestGuest(BIA, PUBLIC_ID, m.id, { name: 'Primo' }); // só pedido: fora
    const guestId = (await t.service.get(ANA, PUBLIC_ID, m.id)).guestRequests[0]?.id as string;
    const err = await failure(
      save(t, ANA, m.id, [
        [ref(ANA), ref(CAIO)],
        [guestRef(guestId), ref(DUDA)],
      ]),
    );
    expect(err?.code).toBe('MATCH_TEAM_PLAYER_OUT');
    const players = outOf(err);
    expect(players).toHaveLength(3);
    expect(players).toEqual(
      expect.arrayContaining([
        { kind: 'user', id: PUB[CAIO], name: (PUB[CAIO] as string).toLowerCase() },
        { kind: 'user', id: PUB[DUDA], name: (PUB[DUDA] as string).toLowerCase() },
        { kind: 'guest', id: guestId, name: 'Primo' },
      ]),
    );
  });

  it('PAR-25: quem disse "não vou" também vem com nome', async () => {
    const t = setup();
    const m = await open(t);
    await go(t, ANA, m.id);
    await notGoing(t, BIA, m.id);
    const err = await failure(save(t, ANA, m.id, [[ref(ANA)], [ref(BIA)]]));
    expect(outOf(err)).toEqual([{ kind: 'user', id: PUB[BIA], name: (PUB[BIA] as string).toLowerCase() }]);
  });

  it('PAR-25: o id que não é de ninguém vem sem name', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    const nobody = '9ZZZZZZZ' as never;
    const unknownGuest = '99999999-9999-4999-8999-999999999999';
    const err = await failure(
      save(t, ANA, m.id, [[ref(ANA), { kind: 'user', id: nobody }], [guestRef(unknownGuest)]]),
    );
    expect(err?.code).toBe('MATCH_TEAM_PLAYER_OUT');
    const players = outOf(err);
    expect(players).toHaveLength(2);
    expect(players.every((p) => p.name === undefined)).toBe(true);
  });
});

describe('PAR-28: quem não tem mais perfil', () => {
  it('PAR-28: quem perdeu o perfil continua no time como pessoa removida (gone), com left', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    await save(t, ANA, m.id, [[ref(ANA), ref(BIA)], [ref(CAIO)]]);
    t.state.participants.delete(BIA);
    t.state.noProfile.add(BIA);
    const seen = await t.service.get(ANA, PUBLIC_ID, m.id);
    expect(seen.lineup?.list[0]).toHaveLength(2);
    expect(seen.lineup?.list[0]?.[1]).toEqual({ kind: 'gone', left: true });
    expect(seen.lineup?.list[0]?.[0]).toMatchObject({ kind: 'player', left: false });
    expect(seen.lineup?.list[1]).toHaveLength(1);
  });

  it('PAR-28: o convidado de quem perdeu o perfil continua no time como pessoa removida', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    const guestId = await approvedGuest(t, m.id); // pedido pela BIA
    await save(t, ANA, m.id, [[guestRef(guestId), ref(ANA)], [ref(CAIO)]]);
    await t.service.removeGuest(BIA, PUBLIC_ID, m.id, guestId);
    t.state.participants.delete(BIA);
    t.state.noProfile.add(BIA);
    const seen = await t.service.get(ANA, PUBLIC_ID, m.id);
    expect(seen.lineup?.list[0]).toHaveLength(2);
    expect(seen.lineup?.list[0]?.[0]).toEqual({ kind: 'gone', left: true });
  });
});

describe('PAR-29: o aviso dos times', () => {
  const teamsReady = (t: T) => t.sent.filter((n) => n.type === 'match_teams_ready');

  it('PAR-29: o primeiro salvar avisa quem tem conta e está num time, menos quem salvou, com o link da partida', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    t.sent.length = 0;
    await save(t, ANA, m.id, [[ref(ANA), ref(BIA)], [ref(CAIO)]]);
    expect(
      teamsReady(t)
        .map((n) => n.userId)
        .sort(),
    ).toEqual([BIA, CAIO].sort());
    expect(teamsReady(t).every((n) => n.link === link(m.id))).toBe(true);
  });

  it('PAR-29: quem ficou sem time não é avisado', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    t.sent.length = 0;
    await save(t, ANA, m.id, [[ref(ANA)], [ref(BIA)]]);
    expect(teamsReady(t).map((n) => n.userId)).toEqual([BIA]);
  });

  it('PAR-29: salvar de novo não avisa', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    await save(t, ANA, m.id, [[ref(ANA)], [ref(BIA)]]);
    t.sent.length = 0;
    await save(t, ANA, m.id, [[ref(BIA), ref(CAIO)], [ref(ANA)]], 1);
    expect(teamsReady(t)).toEqual([]);
  });

  it('PAR-29: o salvar que falha não avisa', async () => {
    const t = setup();
    const m = await everyoneIn(t, { teams: 1, playersPerTeam: 2 });
    t.sent.length = 0;
    await failure(save(t, ANA, m.id, [[ref(ANA)], [ref(DUDA)]]));
    expect(teamsReady(t)).toEqual([]);
  });

  it('PAR-29: dois primeiros salvares ao mesmo tempo: só um ganha e avisa', async () => {
    const t = setup();
    const m = await everyoneIn(t);
    t.sent.length = 0;
    const results = await Promise.allSettled([
      save(t, ANA, m.id, [[ref(ANA)], [ref(BIA)]]),
      save(t, ANA, m.id, [[ref(BIA)], [ref(CAIO)]]),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(teamsReady(t)).toHaveLength(1);
  });
});
