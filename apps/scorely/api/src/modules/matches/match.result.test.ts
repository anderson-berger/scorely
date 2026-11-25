import { appError } from '@scorely/api/src/lib/errors';
import { asGroupId, asPublicGroupId, asUserId, type UserId } from '@scorely/api/src/lib/ids';
import type { GroupAccess } from '@scorely/api/src/modules/groups/group.access';
import { createMatchService } from '@scorely/api/src/modules/matches/match.service';
import { memoryMatches } from '@scorely/api/src/modules/matches/matches.memory';
import type { UserRecord } from '@scorely/api/src/modules/users/user.repository';
import type {
  GroupPermission,
  GroupTier,
  MatchTeamPlayerRef,
  SaveMatchResultInput,
  UpdateMatchInput,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Resultado e histórico da partida (PAR-31–36). Repositório em memória, grupo falso e relógio fake.

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
const STRANGER = asUserId('99999999-9999-4999-8999-999999999999');

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return err as { code: string; status: number; details?: unknown };
  }
}

type Who = { kind: string; user?: { id: string }; guestId?: string };
const who = (m: Who) => (m.kind === 'player' ? m.user?.id : m.kind === 'guest' ? m.guestId : 'gone');
const ids = (people: readonly Who[]) => people.map(who);

/** ANA, BIA e CAIO (membros) e DUDA (reserva) dentro, nessa ordem, e o relógio depois do início. */
async function started(t: T, over: Partial<Settings> = {}) {
  const m = await open(t, over);
  await go(t, ANA, m.id);
  await go(t, BIA, m.id);
  await go(t, CAIO, m.id);
  await go(t, DUDA, m.id);
  t.at(iso(START, 0.5));
  return m;
}

/** BIA pede um convidado e ANA libera (antes do início): devolve o id dele. */
async function approvedGuest(t: T, matchId: string) {
  await t.service.requestGuest(BIA, PUBLIC_ID, matchId, { name: 'Primo' });
  const guestId = (await t.service.get(ANA, PUBLIC_ID, matchId)).guestRequests[0]?.id as string;
  await t.service.approveGuest(ANA, PUBLIC_ID, matchId, guestId);
  return guestId;
}

type Team = MatchTeamPlayerRef[];
const day = (teams: Team[], winner: number | 'draw', expectedVersion = 0): SaveMatchResultInput => ({
  mode: 'day',
  teams,
  winner,
  expectedVersion,
});
const games = (list: [Team, Team, 'a' | 'b' | 'draw'][], expectedVersion = 0): SaveMatchResultInput => ({
  mode: 'games',
  games: list.map(([a, b, winner]) => ({ teams: [a, b] as [Team, Team], winner })),
  expectedVersion,
});
const record = (t: T, by: UserId, matchId: string, body: SaveMatchResultInput) =>
  t.service.saveResult(by, PUBLIC_ID, matchId, body);

describe('PAR-31: os dois jeitos e a configuração', () => {
  it('PAR-31: a partida nasce pelo dia e o jeito se configura (PAR-06)', async () => {
    const t = setup();
    const first = await t.service.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    expect(first.resultMode).toBe('day');
    const edited = await t.service.update(ANA, PUBLIC_ID, first.id, {
      ...input({ resultMode: 'games' }),
      expectedVersion: first.version,
    });
    expect(edited.resultMode).toBe('games');
    expect((await t.service.get(BIA, PUBLIC_ID, first.id)).resultMode).toBe('games');
  });

  it('PAR-31: o resultado guarda o próprio jeito; registrar de outro jeito troca tudo, sem importar a configuração', async () => {
    const t = setup();
    const m = await started(t, { resultMode: 'games' });
    const first = await record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    expect(first.result?.mode).toBe('day');
    expect(first.resultMode).toBe('games');
    const second = await record(t, ANA, m.id, games([[[ref(ANA)], [ref(BIA)], 'b']], 1));
    expect(second.result?.mode).toBe('games');
    expect(second.result).not.toHaveProperty('teams');
    expect(second.result?.version).toBe(2);
  });

  it('PAR-20, 21, 22: a repetição leva o jeito do resultado e a partida seguinte nasce com ele', async () => {
    const t = setup();
    const m = await t.service.create(ANA, PUBLIC_ID, {
      startsAt: START,
      endsAt: END,
      repeatWeekly: true,
      timeZone: 'America/Sao_Paulo',
    });
    const series = (await t.service.get(ANA, PUBLIC_ID, m.id)).series;
    expect(series?.resultMode).toBe('day');
    await t.service.updateSeries(ANA, PUBLIC_ID, series?.id as string, {
      weekday: series?.weekday as never,
      time: series?.time as string,
      durationMinutes: series?.durationMinutes as number,
      noGuests: false,
      closeHours: 0,
      resultMode: 'games',
      expectedVersion: series?.version as number,
    });
    t.at(END);
    const [next] = await t.service.list(BIA, PUBLIC_ID);
    expect((await t.service.get(BIA, PUBLIC_ID, next?.id as string)).resultMode).toBe('games');
    expect((await t.service.get(ANA, PUBLIC_ID, m.id)).resultMode).toBe('day');
  });
});

describe('PAR-32: registrar o resultado', () => {
  it('PAR-32: quem tem matches.manage registra a partir do início; a resposta é a partida com o resultado e a version', async () => {
    const t = setup();
    const m = await started(t);
    const saved = await record(t, ANA, m.id, day([[ref(ANA), ref(BIA)], [ref(CAIO)]], 1));
    expect(saved.id).toBe(m.id);
    expect(saved.result?.mode).toBe('day');
    expect(saved.result?.version).toBe(1);
    expect((await t.service.get(DUDA, PUBLIC_ID, m.id)).result?.version).toBe(1);
  });

  it('PAR-32: quem não tem matches.manage recebe GROUP_PERMISSION_DENIED', async () => {
    const t = setup();
    const m = await started(t);
    const err = await failure(record(t, BIA, m.id, day([[ref(ANA)], [ref(BIA)]], 1)));
    expect(err?.code).toBe('GROUP_PERMISSION_DENIED');
  });

  it('PAR-32: antes do início, MATCH_NOT_STARTED (409); no instante do início já vale', async () => {
    const t = setup();
    const m = await started(t);
    t.at(iso(START, -0.01));
    const err = await failure(record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA)]], 1)));
    expect(err).toMatchObject({ code: 'MATCH_NOT_STARTED', status: 409 });
    t.at(START);
    expect((await record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA)]], 1))).result?.mode).toBe('day');
  });

  it('PAR-32: na partida cancelada, MATCH_CANCELLED', async () => {
    const t = setup();
    const m = await started(t);
    t.at(iso(START, -1));
    await t.service.cancel(ANA, PUBLIC_ID, m.id);
    t.at(iso(START, 0.5));
    const err = await failure(record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA)]], 1)));
    expect(err?.code).toBe('MATCH_CANCELLED');
  });

  it('PAR-32: sem prazo: semanas depois do fim ainda se registra e se corrige', async () => {
    const t = setup();
    const m = await started(t);
    t.at(iso(END, 24 * 30));
    const first = await record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    expect(first.result?.version).toBe(1);
    const fixed = await record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA)]], 2, 1));
    expect(fixed.result).toMatchObject({ mode: 'day', winner: 2, version: 2 });
  });

  it('PAR-32: a version do resultado é conferida (VERSION_CONFLICT); registrar de novo troca o anterior inteiro; não há apagar', async () => {
    const t = setup();
    const m = await started(t);
    await record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    const stale = await failure(record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA)]], 2, 0)));
    expect(stale?.code).toBe('VERSION_CONFLICT');
    const again = await record(t, ANA, m.id, day([[ref(CAIO), ref(DUDA)], [ref(ANA)], []], 'draw', 1));
    expect(again.result).toMatchObject({ mode: 'day', winner: 'draw', version: 2 });
    expect(again.result?.mode === 'day' && again.result.teams.map((x) => x.length)).toEqual([2, 1, 0]);
  });

  it('PAR-32: ninguém é avisado', async () => {
    const t = setup();
    const m = await started(t);
    const before = t.sent.length;
    await record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    expect(t.sent).toHaveLength(before);
  });

  it('PAR-32, 16: actions.recordResult vale para matches.manage, a partir do início e sem cancelar', async () => {
    const t = setup();
    const m = await open(t);
    expect((await t.service.get(ANA, PUBLIC_ID, m.id)).actions.recordResult).toBe(false);
    t.at(START);
    expect((await t.service.get(ANA, PUBLIC_ID, m.id)).actions.recordResult).toBe(true);
    expect((await t.service.get(BIA, PUBLIC_ID, m.id)).actions.recordResult).toBe(false);
    t.at(iso(END, 24 * 30));
    expect((await t.service.get(ANA, PUBLIC_ID, m.id)).actions.recordResult).toBe(true);
    const other = await t.service.create(ANA, PUBLIC_ID, {
      startsAt: iso(END, 24 * 31),
      endsAt: iso(END, 24 * 31 + 2),
    });
    await t.service.cancel(ANA, PUBLIC_ID, other.id);
    t.at(iso(END, 24 * 31 + 1));
    expect((await t.service.get(ANA, PUBLIC_ID, other.id)).actions.recordResult).toBe(false);
  });
});

describe('PAR-33: resultado pelo dia', () => {
  it('PAR-33: o winner é o número do time; vencem as pessoas dele, na ordem', async () => {
    const t = setup();
    const m = await started(t);
    const saved = await record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA), ref(CAIO)]], 2));
    const r = saved.result;
    if (r?.mode !== 'day') throw new Error('expected day');
    expect(r.winner).toBe(2);
    expect(r.teams.map(ids)).toEqual([[PUB[ANA]], [PUB[BIA], PUB[CAIO]]]);
    expect(ids(r.dayWinners)).toEqual([PUB[BIA], PUB[CAIO]]);
  });

  it('PAR-33: no empate ninguém venceu o dia', async () => {
    const t = setup();
    const m = await started(t);
    const saved = await record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA)]], 'draw'));
    expect(saved.result).toMatchObject({ mode: 'day', winner: 'draw', dayWinners: [] });
  });

  it('PAR-33: quem está na fila entra no resultado; o convidado liberado também', async () => {
    const t = setup();
    const m = await open(t, { teams: 1, playersPerTeam: 2 }); // ANA e BIA dentro, CAIO e DUDA na fila
    await go(t, ANA, m.id);
    await go(t, BIA, m.id);
    await go(t, CAIO, m.id);
    await go(t, DUDA, m.id);
    const guestId = await approvedGuest(t, m.id);
    t.at(iso(START, 0.5));
    const saved = await record(
      t,
      ANA,
      m.id,
      day(
        [
          [ref(ANA), ref(CAIO)],
          [ref(BIA), guestRef(guestId)],
        ],
        1,
      ),
    );
    expect(saved.result?.mode === 'day' && saved.result.teams[1]?.[1]).toMatchObject({
      kind: 'guest',
      name: 'Primo',
    });
  });

  it('PAR-33: quem não está na lista (não vou, nunca respondeu) é MATCH_TEAM_PLAYER_OUT com details.players, e nada é gravado', async () => {
    const t = setup();
    const m = await open(t);
    await go(t, ANA, m.id);
    await notGoing(t, BIA, m.id);
    t.at(iso(START, 0.5));
    const err = await failure(record(t, ANA, m.id, day([[ref(ANA), ref(BIA)], [ref(CAIO)]], 1)));
    expect(err).toMatchObject({ code: 'MATCH_TEAM_PLAYER_OUT', status: 409 });
    const players = (err?.details as { players: { id: string; name?: string }[] } | undefined)?.players ?? [];
    expect(players.map((p) => p.id).sort()).toEqual([PUB[BIA], PUB[CAIO]].sort());
    expect(players.find((p) => p.id === PUB[BIA])?.name).toBeDefined();
    expect((await t.service.get(ANA, PUBLIC_ID, m.id)).result).toBeUndefined();
  });

  it('PAR-33: pessoa repetida, número de times fora de 2 a 10, winner além dos times e time vencedor vazio são VALIDATION_ERROR', async () => {
    const t = setup();
    const m = await started(t);
    const codes = await Promise.all([
      failure(record(t, ANA, m.id, day([[ref(ANA)], [ref(ANA)]], 1))),
      failure(record(t, ANA, m.id, day([[ref(ANA)]], 1))),
      failure(
        record(
          t,
          ANA,
          m.id,
          day(
            Array.from({ length: 11 }, () => []),
            'draw',
          ),
        ),
      ),
      failure(record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA)]], 3))),
      failure(record(t, ANA, m.id, day([[ref(ANA)], []], 2))),
    ]);
    expect(codes.map((e) => e?.code)).toEqual(Array(5).fill('VALIDATION_ERROR'));
    expect((await t.service.get(ANA, PUBLIC_ID, m.id)).result).toBeUndefined();
  });

  it('PAR-33: os times do resultado são do resultado: salvar os times depois não o muda, e ele não muda os times', async () => {
    const t = setup();
    const m = await started(t);
    await save(t, ANA, m.id, [
      [ref(ANA), ref(BIA)],
      [ref(CAIO), ref(DUDA)],
    ]);
    await record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    const afterResult = await t.service.get(ANA, PUBLIC_ID, m.id);
    expect(afterResult.lineup?.list.map((x) => x.length)).toEqual([2, 2]);
    await save(t, ANA, m.id, [[ref(DUDA)], [ref(CAIO)]], 1);
    const r = (await t.service.get(ANA, PUBLIC_ID, m.id)).result;
    expect(r?.mode === 'day' && r.teams.map(ids)).toEqual([[PUB[ANA]], [PUB[BIA]]]);
  });
});

describe('PAR-34: resultado por jogo', () => {
  it('PAR-34: a contagem de cada pessoa (jogos, vitórias, empates, derrotas) e quem venceu o dia', async () => {
    const t = setup();
    const m = await started(t);
    const saved = await record(
      t,
      ANA,
      m.id,
      games([
        [[ref(ANA), ref(BIA)], [ref(CAIO)], 'a'],
        [[ref(ANA)], [ref(DUDA)], 'a'],
        [[ref(BIA)], [ref(CAIO)], 'draw'],
      ]),
    );
    const r = saved.result;
    if (r?.mode !== 'games') throw new Error('expected games');
    const by = (id: UserId) => r.standings.find((s) => who(s.member) === PUB[id]);
    expect(by(ANA)).toMatchObject({ played: 2, wins: 2, draws: 0, losses: 0 });
    expect(by(BIA)).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0 });
    expect(by(CAIO)).toMatchObject({ played: 2, wins: 0, draws: 1, losses: 1 });
    expect(by(DUDA)).toMatchObject({ played: 1, wins: 0, draws: 0, losses: 1 });
    expect(ids(r.dayWinners)).toEqual([PUB[ANA]]);
    expect(r.games).toHaveLength(3);
  });

  it('PAR-34: empate nas vitórias, todos os empatados venceram o dia; só empates, ninguém', async () => {
    const t = setup();
    const m = await started(t);
    const tie = await record(
      t,
      ANA,
      m.id,
      games([
        [[ref(ANA)], [ref(BIA)], 'a'],
        [[ref(BIA)], [ref(ANA)], 'a'],
      ]),
    );
    expect(ids(tie.result?.dayWinners ?? []).sort()).toEqual([PUB[ANA], PUB[BIA]].sort());
    const draws = await record(t, ANA, m.id, games([[[ref(ANA)], [ref(BIA)], 'draw']], 1));
    expect(draws.result?.dayWinners).toEqual([]);
  });

  it('PAR-34: os times não precisam ter o mesmo tamanho, e o convidado conta e pode vencer o dia', async () => {
    const t = setup();
    const m = await open(t);
    await go(t, ANA, m.id);
    await go(t, BIA, m.id);
    await go(t, CAIO, m.id);
    const guestId = await approvedGuest(t, m.id);
    t.at(iso(START, 0.5));
    const saved = await record(
      t,
      ANA,
      m.id,
      games([[[guestRef(guestId)], [ref(ANA), ref(BIA), ref(CAIO)], 'a']]),
    );
    expect(saved.result?.dayWinners[0]).toMatchObject({ kind: 'guest', guestId });
  });

  it('PAR-34: de 1 a 30 jogos; fora disso, VALIDATION_ERROR', async () => {
    const t = setup();
    const m = await started(t);
    const one: [Team, Team, 'a'] = [[ref(ANA)], [ref(BIA)], 'a'];
    expect((await failure(record(t, ANA, m.id, games([]))))?.code).toBe('VALIDATION_ERROR');
    expect((await failure(record(t, ANA, m.id, games(Array.from({ length: 31 }, () => one)))))?.code).toBe(
      'VALIDATION_ERROR',
    );
    const ok = await record(t, ANA, m.id, games(Array.from({ length: 30 }, () => one)));
    expect(ok.result?.mode === 'games' && ok.result.games).toHaveLength(30);
  });

  it('PAR-34: time vazio e pessoa nos dois times do mesmo jogo são VALIDATION_ERROR; a mesma pessoa em jogos diferentes vale', async () => {
    const t = setup();
    const m = await started(t);
    expect((await failure(record(t, ANA, m.id, games([[[ref(ANA)], [], 'a']]))))?.code).toBe(
      'VALIDATION_ERROR',
    );
    expect(
      (await failure(record(t, ANA, m.id, games([[[ref(ANA)], [ref(ANA), ref(BIA)], 'a']]))))?.code,
    ).toBe('VALIDATION_ERROR');
    expect(
      (
        await record(
          t,
          ANA,
          m.id,
          games([
            [[ref(ANA)], [ref(BIA)], 'a'],
            [[ref(ANA)], [ref(CAIO)], 'b'],
          ]),
        )
      ).result?.mode,
    ).toBe('games');
  });

  it('PAR-34: quem não está na lista é MATCH_TEAM_PLAYER_OUT', async () => {
    const t = setup();
    const m = await open(t);
    await go(t, ANA, m.id);
    await go(t, BIA, m.id);
    t.at(iso(START, 0.5));
    const err = await failure(record(t, ANA, m.id, games([[[ref(ANA)], [ref(CAIO)], 'a']])));
    expect(err?.code).toBe('MATCH_TEAM_PLAYER_OUT');
  });
});

describe('PAR-35: ver o resultado', () => {
  it('PAR-35: sem resultado, a partida vem sem ele', async () => {
    const t = setup();
    const m = await started(t);
    expect((await t.service.get(BIA, PUBLIC_ID, m.id)).result).toBeUndefined();
  });

  it('PAR-35: todos que participam veem o resultado, com o perfil de cada pessoa', async () => {
    const t = setup();
    const m = await started(t);
    await record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    const seen = (await t.service.get(DUDA, PUBLIC_ID, m.id)).result;
    expect(seen?.mode === 'day' && seen.teams[0]?.[0]).toMatchObject({
      kind: 'player',
      user: { id: PUB[ANA] },
    });
    expect((await failure(t.service.get(STRANGER, PUBLIC_ID, m.id)))?.code).toBe('GROUP_NOT_FOUND');
  });

  it('PAR-35: quem saiu do grupo depois continua no resultado, mas sai das listas', async () => {
    const t = setup();
    const m = await started(t);
    await record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA)]], 2));
    t.state.participants.delete(BIA);
    const seen = await t.service.get(ANA, PUBLIC_ID, m.id);
    expect(seen.in.map((e) => (e.kind === 'player' ? e.user.id : e.name))).not.toContain(PUB[BIA]);
    const r = seen.result;
    expect(r?.mode === 'day' && r.teams[1]?.[0]).toMatchObject({ kind: 'player', user: { id: PUB[BIA] } });
    expect(r?.dayWinners.map(who)).toEqual([PUB[BIA]]);
  });

  it('PAR-35: quem não tem mais perfil vem como pessoa removida (gone)', async () => {
    const t = setup();
    const m = await started(t);
    await record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    // Sai do grupo antes (sai das listas, PAR-10): o que as listas fazem com quem perde o perfil está em aberto (§5).
    t.state.participants.delete(BIA);
    t.state.noProfile.add(BIA);
    const r = (await t.service.get(ANA, PUBLIC_ID, m.id)).result;
    expect(r?.mode === 'day' && r.teams[1]?.[0]).toEqual({ kind: 'gone' });
  });
});

describe('PAR-36: o histórico', () => {
  it('PAR-36: lista as que terminaram, da mais recente para a mais antiga, canceladas incluídas; as próximas ficam de fora', async () => {
    const t = setup();
    const a = await t.service.create(ANA, PUBLIC_ID, { startsAt: iso(START, 0), endsAt: iso(START, 2) });
    const b = await t.service.create(ANA, PUBLIC_ID, { startsAt: iso(START, 24), endsAt: iso(START, 26) });
    const c = await t.service.create(ANA, PUBLIC_ID, { startsAt: iso(START, 48), endsAt: iso(START, 50) });
    const upcoming = await t.service.create(ANA, PUBLIC_ID, {
      startsAt: iso(START, 24 * 10),
      endsAt: iso(START, 24 * 10 + 2),
    });
    await t.service.cancel(ANA, PUBLIC_ID, b.id);
    t.at(iso(START, 60));
    const page = await t.service.history(BIA, PUBLIC_ID);
    expect(page.items.map((i) => i.id)).toEqual([c.id, b.id, a.id]);
    expect(page.items.map((i) => i.status)).toEqual(['finished', 'cancelled', 'finished']);
    expect(page.items.map((i) => i.id)).not.toContain(upcoming.id);
    expect(page.items[0]).toMatchObject({ startsAt: c.startsAt, endsAt: c.endsAt, confirmed: 0 });
    expect(page.nextCursor).toBeUndefined();
  });

  it('PAR-36: cada item traz quantos estavam dentro e o resumo do resultado (pelo dia: o time; por jogo: quem venceu o dia)', async () => {
    const t = setup();
    const m1 = await started(t);
    await record(t, ANA, m1.id, day([[ref(ANA)], [ref(BIA)]], 2));
    t.at(iso(START, -1 + 24 * 7));
    const m2 = await t.service.create(ANA, PUBLIC_ID, {
      startsAt: iso(START, 24 * 7),
      endsAt: iso(END, 24 * 7),
    });
    await t.service.update(ANA, PUBLIC_ID, m2.id, {
      ...input({ startsAt: m2.startsAt, endsAt: m2.endsAt, resultMode: 'games' }),
      expectedVersion: m2.version,
    });
    await go(t, ANA, m2.id);
    await go(t, BIA, m2.id);
    t.at(iso(START, 24 * 7 + 0.5));
    await record(t, ANA, m2.id, games([[[ref(ANA)], [ref(BIA)], 'a']]));
    t.at(iso(END, 24 * 8));
    const { items } = await t.service.history(CAIO, PUBLIC_ID);
    expect(items.map((i) => i.id)).toEqual([m2.id, m1.id]);
    expect(items[1]).toMatchObject({ confirmed: 4, result: { mode: 'day', winner: 2 } });
    expect(items[0]?.confirmed).toBe(2);
    const r = items[0]?.result;
    expect(r?.mode === 'games' && r.dayWinners.map(who)).toEqual([PUB[ANA]]);
  });

  it('PAR-36: a partida sem resultado vem sem resumo', async () => {
    const t = setup();
    const m = await started(t);
    t.at(iso(END, 1));
    const { items } = await t.service.history(BIA, PUBLIC_ID);
    expect(items[0]?.id).toBe(m.id);
    expect(items[0]?.result).toBeUndefined();
  });

  it('PAR-36: a corrigir o resultado de uma partida antiga, o histórico mostra o novo', async () => {
    const t = setup();
    const m = await started(t);
    await record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    t.at(iso(END, 24 * 30));
    await record(t, ANA, m.id, day([[ref(ANA)], [ref(BIA)]], 2, 1));
    expect((await t.service.history(BIA, PUBLIC_ID)).items[0]?.result).toMatchObject({ winner: 2 });
  });

  it('PAR-36: páginas de 20, com o cursor para a próxima, sem repetir nem perder partidas', async () => {
    const t = setup();
    const first = await Promise.all(
      Array.from({ length: 20 }, (_, n) =>
        t.service.create(ANA, PUBLIC_ID, { startsAt: iso(START, n * 3), endsAt: iso(START, n * 3 + 2) }),
      ),
    );
    t.at(iso(START, 24 * 10));
    const second = await Promise.all(
      Array.from({ length: 2 }, (_, n) =>
        t.service.create(ANA, PUBLIC_ID, {
          startsAt: iso(START, 24 * 11 + n * 3),
          endsAt: iso(START, 24 * 11 + n * 3 + 2),
        }),
      ),
    );
    t.at(iso(START, 24 * 20));
    const page1 = await t.service.history(BIA, PUBLIC_ID);
    expect(page1.items).toHaveLength(20);
    expect(page1.nextCursor).toBeDefined();
    const page2 = await t.service.history(BIA, PUBLIC_ID, page1.nextCursor);
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).toBeUndefined();
    const all = [...page1.items, ...page2.items].map((i) => i.id);
    expect(new Set(all).size).toBe(22);
    expect(all.slice(0, 2).sort()).toEqual(second.map((m) => m.id).sort());
    expect(all).toEqual(expect.arrayContaining(first.map((m) => m.id)));
  });

  it('PAR-36: quem não participa do grupo recebe GROUP_NOT_FOUND', async () => {
    const t = setup();
    expect((await failure(t.service.history(STRANGER, PUBLIC_ID)))?.code).toBe('GROUP_NOT_FOUND');
  });

  it('PAR-36: mudar o fim da partida (PAR-06) muda onde ela aparece: a editada para o futuro sai do histórico quando ainda não terminou', async () => {
    const t = setup();
    const m = await t.service.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    await t.service.update(ANA, PUBLIC_ID, m.id, {
      ...input({ startsAt: iso(START, 24), endsAt: iso(END, 24) }),
      expectedVersion: m.version,
    });
    t.at(iso(END, 1));
    expect((await t.service.history(BIA, PUBLIC_ID)).items).toEqual([]);
    t.at(iso(END, 25));
    expect((await t.service.history(BIA, PUBLIC_ID)).items.map((i) => i.id)).toEqual([m.id]);
  });
});
