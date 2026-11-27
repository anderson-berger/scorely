import type { UserId } from '@scorely/api/src/lib/ids';
import {
  ANA,
  BIA,
  CAIO,
  DUDA,
  EDU,
  failure,
  POINTS,
  PUB,
  PUBLIC_ID,
  STRANGER,
  setup,
  type T,
} from '@scorely/api/src/modules/groups/competitions/tests/fixtures';
import {
  type CompetitionCut,
  type CreateCompetitionInput,
  CreateCompetitionInputSchema,
  type MatchTeamPlayerRef,
  type SaveMatchResultInput,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Competição (COM-01–11) e o "Vale para" das partidas (PAR-40, PAR-21, 22). Repositórios em memória, grupo falso e
// relógio fake. Nomes que o doc não fixa e que estes testes assumem:
//  - `createCompetitionService({ competitions, matches, groups, users, now })` com os métodos
//    create(user, publicId, input), list(user, publicId), get(user, publicId, id, cut), update(user, publicId, id, input),
//    close(user, publicId, id) e runLock() (a rotina diária que trava, COM-11);
//  - `memoryCompetitions(memoryMatches())` devolve `{ repo }` e compartilha o armazenamento das partidas (as duas
//    entidades gravam juntas, D5); o `createMatchService` recebe `competitions: repo`;
//  - `matchService.setCompetitions(user, publicId, matchId, { competitionIds, expectedVersion })` (PAR-40).

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ZONE = 'America/Sao_Paulo';
/** Sexta, 27/11, 19h em São Paulo. */
const START = '2026-11-27T22:00:00.000Z';
const END = '2026-11-28T00:00:00.000Z';
const END_DATE = '2026-12-31';
const UNKNOWN = '00000000-0000-4000-8000-000000000000';
const iso = (base: string, hours: number) => new Date(Date.parse(base) + hours * HOUR).toISOString();
const plusDays = (base: string, days: number) => new Date(Date.parse(base) + days * DAY).toISOString();

const season = (over: Partial<CreateCompetitionInput> = {}): CreateCompetitionInput => ({
  type: 'season',
  endDate: END_DATE,
  timeZone: ZONE,
  points: POINTS,
  seriesIds: [],
  ...over,
});
const open = (t: T, over: Partial<CreateCompetitionInput> = {}) =>
  t.service.create(ANA, PUBLIC_ID, season(over));

const ref = (id: UserId): MatchTeamPlayerRef => ({ kind: 'user', id: PUB[id] as never });
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

const FORMAT = {
  teams: 2,
  playersPerTeam: 3,
  membersHours: 72,
  reservesHours: 24,
  guestsHours: 6,
  noGuests: false,
  closeHours: 0,
};

/**
 * Cria a partida, configura (formato e jeito do resultado), liga o "Vale para", põe todos para dentro e deixa o
 * relógio depois do início. Devolve a partida pronta para `saveResult`.
 */
async function played(
  t: T,
  over: { competitionIds?: string[]; startsAt?: string; resultMode?: 'day' | 'games' } = {},
) {
  const startsAt = over.startsAt ?? START;
  const endsAt = iso(startsAt, 2);
  const first = await t.matches.create(ANA, PUBLIC_ID, { startsAt, endsAt });
  const m = await t.matches.update(ANA, PUBLIC_ID, first.id, {
    ...FORMAT,
    startsAt,
    endsAt,
    resultMode: over.resultMode ?? 'day',
    expectedVersion: first.version,
  });
  const tagged =
    over.competitionIds === undefined
      ? m
      : await t.matches.setCompetitions(ANA, PUBLIC_ID, m.id, {
          competitionIds: over.competitionIds,
          expectedVersion: m.version,
        });
  t.at(iso(startsAt, -1));
  for (const user of [ANA, BIA, CAIO, DUDA, EDU]) {
    await t.matches.setAttendance(user, PUBLIC_ID, m.id, { status: 'going' });
  }
  t.at(iso(startsAt, 0.5));
  await t.matches.start(ANA, PUBLIC_ID, m.id);
  return tagged;
}
const record = (t: T, matchId: string, body: SaveMatchResultInput) =>
  t.matches.saveResult(ANA, PUBLIC_ID, matchId, body);
const rows = async (t: T, id: string, cut: CompetitionCut = 'all') =>
  (await t.service.get(BIA, PUBLIC_ID, id, cut)).ranking;
const nicks = (list: { user: { id: string } }[]) => list.map((r) => r.user.id);

describe('COM-01: abrir a competição', () => {
  it('COM-01: quem tem competitions.manage abre; ela nasce aberta, do dia de hoje', async () => {
    const t = setup();
    const c = await open(t);
    expect(c).toMatchObject({ type: 'season', status: 'open', startDate: '2026-11-25', endDate: END_DATE });
    expect(c.points).toEqual(POINTS);
    expect(c.actions).toMatchObject({ manage: true, editPoints: true });
  });

  it('COM-01: quem participa sem a permissão recebe GROUP_PERMISSION_DENIED; quem não participa, GROUP_NOT_FOUND', async () => {
    const t = setup();
    expect((await failure(t.service.create(BIA, PUBLIC_ID, season())))?.code).toBe('GROUP_PERMISSION_DENIED');
    expect((await failure(t.service.create(STRANGER, PUBLIC_ID, season())))?.code).toBe('GROUP_NOT_FOUND');
  });

  it('COM-01: a 4ª competição aberta responde COMPETITION_LIMIT com o limite', async () => {
    const t = setup();
    await open(t);
    await open(t);
    await open(t);
    const err = await failure(open(t));
    expect(err).toMatchObject({ code: 'COMPETITION_LIMIT', status: 409, details: { limit: 3 } });
  });

  it('COM-01, 11: competição travada não conta para o limite', async () => {
    const t = setup();
    const first = await open(t, { endDate: '2026-12-02' });
    await open(t);
    await open(t);
    t.at('2026-12-10T15:00:00.000Z');
    await t.service.runLock();
    expect((await t.service.get(ANA, PUBLIC_ID, first.id, 'all')).status).toBe('locked');
    await expect(open(t, { endDate: '2027-01-20' })).resolves.toMatchObject({ status: 'open' });
  });

  it('COM-01, PAR-40: seriesIds marcam a repetição e a próxima partida dela com a competição', async () => {
    const t = setup();
    const first = await t.matches.create(ANA, PUBLIC_ID, {
      startsAt: START,
      endsAt: END,
      repeatWeekly: true,
      timeZone: ZONE,
    });
    const seriesId = first.series?.id as string;
    const c = await open(t, { seriesIds: [seriesId] });
    const match = await t.matches.get(BIA, PUBLIC_ID, first.id);
    expect(match.competitions.map((x) => x.id)).toEqual([c.id]);
    expect(match.series?.competitions.map((x) => x.id)).toEqual([c.id]);
  });

  it('COM-01: repetição que não existe responde MATCH_SERIES_NOT_FOUND, e a encerrada, MATCH_SERIES_ENDED', async () => {
    const t = setup();
    expect((await failure(open(t, { seriesIds: [UNKNOWN] })))?.code).toBe('MATCH_SERIES_NOT_FOUND');
    const first = await t.matches.create(ANA, PUBLIC_ID, {
      startsAt: START,
      endsAt: END,
      repeatWeekly: true,
      timeZone: ZONE,
    });
    await t.matches.endSeries(ANA, PUBLIC_ID, first.series?.id as string);
    expect((await failure(open(t, { seriesIds: [first.series?.id as string] })))?.code).toBe(
      'MATCH_SERIES_ENDED',
    );
  });
});

describe('COM-02: o período e o nome', () => {
  it('COM-02: sem nome é "Temporada N", N pela ordem de criação no grupo', async () => {
    const t = setup();
    const a = await open(t);
    const b = await open(t, { name: 'Ranking do ano' });
    const c = await open(t);
    expect([a.name, a.number]).toEqual([undefined, 1]);
    expect(b.name).toBe('Ranking do ano');
    expect(c.number).toBe(3);
  });

  it('COM-02: de 7 a 366 dias, contando os dois extremos; fora disso, VALIDATION_ERROR', async () => {
    const t = setup();
    expect((await open(t, { endDate: '2026-12-01' })).endDate).toBe('2026-12-01'); // 7 dias
    expect((await failure(open(t, { endDate: '2026-11-30' })))?.code).toBe('VALIDATION_ERROR'); // 6
    expect((await open(t, { endDate: '2027-11-25' })).endDate).toBe('2027-11-25'); // 366 dias
    expect((await failure(open(t, { endDate: '2027-11-26' })))?.code).toBe('VALIDATION_ERROR'); // 367
  });

  it('COM-02: o dia de hoje vale no fuso de quem abre, não em UTC', async () => {
    const t = setup();
    t.at('2026-11-26T01:00:00.000Z'); // 25/11, 22h em São Paulo
    expect((await open(t)).startDate).toBe('2026-11-25');
  });

  it('COM-02: o nome tem de 1 a 40 caracteres e o fuso precisa existir', () => {
    expect(CreateCompetitionInputSchema.safeParse(season({ name: 'x'.repeat(41) })).success).toBe(false);
    expect(CreateCompetitionInputSchema.safeParse(season({ name: '   ' })).success).toBe(false);
    expect(CreateCompetitionInputSchema.safeParse(season({ timeZone: 'Marte/Olimpo' })).success).toBe(false);
  });
});

describe('COM-03: os pontos', () => {
  it('COM-03: cada ponto é um inteiro de 0 a 10', () => {
    expect(
      CreateCompetitionInputSchema.safeParse(season({ points: { win: 10, draw: 0, loss: 0 } })).success,
    ).toBe(true);
    expect(
      CreateCompetitionInputSchema.safeParse(season({ points: { win: 11, draw: 1, loss: 0 } })).success,
    ).toBe(false);
    expect(
      CreateCompetitionInputSchema.safeParse(season({ points: { win: 3, draw: 1, loss: -1 } })).success,
    ).toBe(false);
    expect(
      CreateCompetitionInputSchema.safeParse(season({ points: { win: 2.5, draw: 1, loss: 0 } })).success,
    ).toBe(false);
  });

  it('COM-03, 05: os pontos do grupo valem na conta', async () => {
    const t = setup();
    const c = await open(t, { points: { win: 5, draw: 2, loss: 1 } });
    const m = await played(t, { competitionIds: [c.id] });
    await record(t, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    const list = await rows(t, c.id);
    expect(list.map((r) => [r.user.id, r.points])).toEqual([
      [PUB[ANA], 5],
      [PUB[BIA], 1],
    ]);
  });
});

describe('COM-04: editar', () => {
  it('COM-04: muda o nome, o fim e os pontos (sem resultado) e a version sobe', async () => {
    const t = setup();
    const c = await open(t);
    const next = await t.service.update(ANA, PUBLIC_ID, c.id, {
      name: 'Copa',
      endDate: '2026-12-20',
      points: { win: 2, draw: 1, loss: 0 },
      expectedVersion: c.version,
    });
    expect(next).toMatchObject({ name: 'Copa', endDate: '2026-12-20', points: { win: 2, draw: 1, loss: 0 } });
    expect(next.version).toBe(c.version + 1);
  });

  it('COM-04: sem competitions.manage, GROUP_PERMISSION_DENIED', async () => {
    const t = setup();
    const c = await open(t);
    const err = await failure(
      t.service.update(BIA, PUBLIC_ID, c.id, {
        endDate: END_DATE,
        points: POINTS,
        expectedVersion: c.version,
      }),
    );
    expect(err?.code).toBe('GROUP_PERMISSION_DENIED');
  });

  it('COM-04: o fim segue a duração de 7 a 366 dias e não fica antes de hoje', async () => {
    const t = setup();
    const c = await open(t);
    const edit = (endDate: string) =>
      failure(
        t.service.update(ANA, PUBLIC_ID, c.id, { endDate, points: POINTS, expectedVersion: c.version }),
      );
    expect((await edit('2026-11-30'))?.code).toBe('VALIDATION_ERROR');
    expect((await edit('2026-11-20'))?.code).toBe('VALIDATION_ERROR');
    expect((await edit('2027-11-26'))?.code).toBe('VALIDATION_ERROR');
  });

  it('COM-04: os pontos só mudam enquanto nenhum resultado soma: depois, COMPETITION_HAS_RESULTS', async () => {
    const t = setup();
    const c = await open(t);
    const m = await played(t, { competitionIds: [c.id] });
    await record(t, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    const view = await t.service.get(ANA, PUBLIC_ID, c.id, 'all');
    expect(view.actions).toMatchObject({ manage: true, editPoints: false });
    const err = await failure(
      t.service.update(ANA, PUBLIC_ID, c.id, {
        endDate: END_DATE,
        points: { win: 5, draw: 1, loss: 0 },
        expectedVersion: view.version,
      }),
    );
    expect(err).toMatchObject({ code: 'COMPETITION_HAS_RESULTS', status: 409 });
    // o nome e o fim ainda mudam
    const ok = await t.service.update(ANA, PUBLIC_ID, c.id, {
      name: 'Nova',
      endDate: END_DATE,
      points: POINTS,
      expectedVersion: view.version,
    });
    expect(ok.name).toBe('Nova');
  });

  it('COM-04: version velha responde VERSION_CONFLICT; competição que não existe, COMPETITION_NOT_FOUND', async () => {
    const t = setup();
    const c = await open(t);
    const body = { endDate: END_DATE, points: POINTS, expectedVersion: c.version };
    await t.service.update(ANA, PUBLIC_ID, c.id, body);
    expect((await failure(t.service.update(ANA, PUBLIC_ID, c.id, body)))?.code).toBe('VERSION_CONFLICT');
    const missing = await failure(t.service.update(ANA, PUBLIC_ID, UNKNOWN, body));
    expect(missing).toMatchObject({ code: 'COMPETITION_NOT_FOUND', status: 404 });
  });

  it('COM-04, 11: a travada responde COMPETITION_LOCKED', async () => {
    const t = setup();
    const c = await open(t, { endDate: '2026-12-02' });
    t.at('2026-12-10T15:00:00.000Z');
    await t.service.runLock();
    const err = await failure(
      t.service.update(ANA, PUBLIC_ID, c.id, {
        endDate: '2026-12-02',
        points: POINTS,
        expectedVersion: c.version,
      }),
    );
    expect(err).toMatchObject({ code: 'COMPETITION_LOCKED', status: 409 });
  });
});

describe('COM-05: quais partidas contam', () => {
  it('COM-05: pelo dia, o time vencedor ganha a vitória e o outro, a derrota', async () => {
    const t = setup();
    const c = await open(t);
    const m = await played(t, { competitionIds: [c.id] });
    await record(t, m.id, day([[ref(ANA), ref(BIA)], [ref(CAIO)]], 2));
    const list = await rows(t, c.id);
    expect(list.find((r) => r.user.id === PUB[CAIO])).toMatchObject({ points: 3, played: 1, wins: 1 });
    expect(list.find((r) => r.user.id === PUB[ANA])).toMatchObject({ points: 0, played: 1, losses: 1 });
  });

  it('COM-05: por jogo, o Edu vence 4 de 5 e soma 12 pontos em 5 jogos', async () => {
    const t = setup();
    const c = await open(t);
    const m = await played(t, { competitionIds: [c.id], resultMode: 'games' });
    const a: Team = [ref(EDU)];
    const b: Team = [ref(ANA)];
    await record(
      t,
      m.id,
      games([
        [a, b, 'a'],
        [a, b, 'a'],
        [a, b, 'a'],
        [a, b, 'a'],
        [a, b, 'b'],
      ]),
    );
    const edu = (await rows(t, c.id)).find((r) => r.user.id === PUB[EDU]);
    expect(edu).toMatchObject({ points: 12, played: 5, wins: 4, losses: 1 });
    expect(edu?.winRate).toBeCloseTo(0.8);
  });

  it('COM-05: a partida que não vale para a competição não soma', async () => {
    const t = setup();
    const c = await open(t);
    const m = await played(t); // avulsa: vale para nada (PAR-40)
    await record(t, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    expect(await rows(t, c.id)).toEqual([]);
  });

  it('COM-05: a partida sem resultado não soma', async () => {
    const t = setup();
    const c = await open(t);
    await played(t, { competitionIds: [c.id] });
    expect(await rows(t, c.id)).toEqual([]);
  });

  it('COM-05: a partida cancelada não soma', async () => {
    const t = setup();
    const c = await open(t);
    const m = await played(t, { competitionIds: [c.id] });
    await record(t, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    // PAR-07 só cancela antes de iniciar e PAR-32 só registra depois: o dado é montado direto no armazenamento.
    for (const [key, stored] of t.store.matches) {
      if (stored.id === m.id) t.store.matches.set(key, { ...stored, cancelledAt: iso(START, 1) });
    }
    expect(await rows(t, c.id)).toEqual([]);
  });

  it('COM-05: corrigir o resultado muda o ranking na hora', async () => {
    const t = setup();
    const c = await open(t);
    const m = await played(t, { competitionIds: [c.id] });
    const saved = await record(t, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    expect((await rows(t, c.id))[0]?.user.id).toBe(PUB[ANA]);
    await record(t, m.id, day([[ref(ANA)], [ref(BIA)]], 2, saved.result?.version ?? 1));
    expect((await rows(t, c.id))[0]?.user.id).toBe(PUB[BIA]);
  });

  it('COM-05: uma partida vale para mais de uma competição e soma nas duas', async () => {
    const t = setup();
    const a = await open(t);
    const b = await open(t, { name: 'Ranking do ano' });
    const m = await played(t, { competitionIds: [a.id, b.id] });
    await record(t, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    expect(nicks(await rows(t, a.id))).toEqual([PUB[ANA], PUB[BIA]]);
    expect(nicks(await rows(t, b.id))).toEqual([PUB[ANA], PUB[BIA]]);
  });

  it('COM-05: a partida que começa fora do período não soma', async () => {
    const t = setup();
    const c = await open(t, { endDate: '2026-12-02' }); // até quarta, 02/12
    const m = await played(t, { competitionIds: [] });
    // vale-para só se liga dentro do período (PAR-40), então a partida de 04/12 não consegue valer
    const late = await played(t, { startsAt: '2026-12-04T22:00:00.000Z' });
    const err = await failure(
      t.matches.setCompetitions(ANA, PUBLIC_ID, late.id, {
        competitionIds: [c.id],
        expectedVersion: late.version,
      }),
    );
    expect(err).toMatchObject({
      code: 'MATCH_OUTSIDE_COMPETITION',
      status: 422,
      details: { competitionId: c.id },
    });
    await record(t, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    expect(await rows(t, c.id)).toEqual([]);
  });
});

describe('COM-06: só os membros de agora', () => {
  it('COM-06: reserva e convidado jogam e vencem, mas não aparecem no ranking', async () => {
    const t = setup();
    const c = await open(t);
    const m = await played(t, { competitionIds: [c.id] });
    // PAR-12, 13: o convidado entra antes de iniciar (PAR-42 volta a partida para a lista, ainda sem resultado).
    t.at(iso(START, -1));
    await t.matches.unstart(ANA, PUBLIC_ID, m.id);
    await t.matches.requestGuest(BIA, PUBLIC_ID, m.id, { name: 'Primo' });
    const guestId = (await t.matches.get(ANA, PUBLIC_ID, m.id)).guestRequests[0]?.id as string;
    await t.matches.approveGuest(ANA, PUBLIC_ID, m.id, guestId);
    t.at(iso(START, 0.5));
    await t.matches.start(ANA, PUBLIC_ID, m.id);
    await record(t, m.id, day([[ref(DUDA), { kind: 'guest', id: guestId }], [ref(ANA)]], 1));
    expect(nicks(await rows(t, c.id))).toEqual([PUB[ANA]]);
  });

  it('COM-06: quem sai do grupo some do ranking', async () => {
    const t = setup();
    const c = await open(t);
    const m = await played(t, { competitionIds: [c.id] });
    await record(t, m.id, day([[ref(ANA)], [ref(CAIO)]], 1));
    t.state.participants.delete(CAIO);
    expect(nicks(await rows(t, c.id))).toEqual([PUB[ANA]]);
  });

  it('COM-06: quem vira membro aparece com tudo o que jogou, também antes de virar', async () => {
    const t = setup();
    const c = await open(t);
    const m = await played(t, { competitionIds: [c.id] });
    await record(t, m.id, day([[ref(DUDA)], [ref(ANA)]], 1));
    expect(nicks(await rows(t, c.id))).toEqual([PUB[ANA]]);
    t.state.participants.set(DUDA, 'member');
    expect(nicks(await rows(t, c.id))).toEqual([PUB[DUDA], PUB[ANA]]);
  });
});

describe('COM-07: a lista', () => {
  it('COM-07: abertas primeiro, pelo fim; depois as travadas, da mais recente para a mais antiga', async () => {
    const t = setup();
    const late = await open(t, { name: 'Tarde', endDate: '2027-03-01' });
    const early = await open(t, { name: 'Cedo', endDate: '2026-12-31' });
    const old = await open(t, { name: 'Velha', endDate: '2026-12-02' });
    t.at('2026-12-10T15:00:00.000Z');
    await t.service.runLock();
    const list = await t.service.list(BIA, PUBLIC_ID);
    expect(list.items.map((i) => i.id)).toEqual([early.id, late.id, old.id]);
    expect(list.items.map((i) => i.status)).toEqual(['open', 'open', 'locked']);
  });

  it('COM-07: cada uma vem com os 3 primeiros e o lugar de quem pede', async () => {
    const t = setup();
    const c = await open(t);
    const m = await played(t, { competitionIds: [c.id] });
    await record(t, m.id, day([[ref(ANA)], [ref(BIA)], [ref(CAIO)], [ref(EDU)]], 1));
    const [item] = (await t.service.list(EDU, PUBLIC_ID)).items;
    expect(item?.podium).toHaveLength(3);
    expect(item?.podium[0]?.user.id).toBe(PUB[ANA]);
    expect(item?.myPosition).toBe(2); // EDU perdeu como os outros 3: posição dividida logo atrás da Ana
  });

  it('COM-07: quem não participa do grupo não vê', async () => {
    const t = setup();
    expect((await failure(t.service.list(STRANGER, PUBLIC_ID)))?.code).toBe('GROUP_NOT_FOUND');
  });
});

describe('COM-08: o ranking', () => {
  it('COM-08: quem participa vê a competição, os pontos, a version e as linhas com o perfil', async () => {
    const t = setup();
    const c = await open(t);
    const m = await played(t, { competitionIds: [c.id] });
    await record(t, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    const view = await t.service.get(BIA, PUBLIC_ID, c.id, 'all');
    expect(view).toMatchObject({ points: POINTS, version: c.version, cut: 'all' });
    expect(view.actions).toMatchObject({ manage: false, editPoints: false });
    expect(view.ranking[0]).toMatchObject({
      position: 1,
      points: 3,
      played: 1,
      wins: 1,
      draws: 0,
      losses: 0,
      winRate: 1,
    });
  });

  it('COM-08: só aparece quem jogou', async () => {
    const t = setup();
    const c = await open(t);
    const m = await played(t, { competitionIds: [c.id] });
    await record(t, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    expect(nicks(await rows(t, c.id))).toEqual([PUB[ANA], PUB[BIA]]);
  });

  it('COM-08: o recorte masculino e o feminino usam o gênero de agora; sem gênero, só no geral', async () => {
    const t = setup();
    const c = await open(t);
    const m = await played(t, { competitionIds: [c.id] });
    await record(
      t,
      m.id,
      day(
        [
          [ref(ANA), ref(CAIO)],
          [ref(BIA), ref(EDU)],
        ],
        1,
      ),
    );
    expect((await rows(t, c.id, 'all')).map((r) => r.user.id).sort()).toEqual(
      [PUB[ANA], PUB[BIA], PUB[CAIO], PUB[EDU]].sort(),
    );
    expect(nicks(await rows(t, c.id, 'female')).sort()).toEqual([PUB[ANA], PUB[BIA]].sort());
    expect(nicks(await rows(t, c.id, 'male'))).toEqual([PUB[CAIO]]);
  });

  it('COM-08: competição que não existe responde COMPETITION_NOT_FOUND (404)', async () => {
    const t = setup();
    expect(await failure(t.service.get(BIA, PUBLIC_ID, UNKNOWN, 'all'))).toMatchObject({
      code: 'COMPETITION_NOT_FOUND',
      status: 404,
    });
  });

  it('COM-08: quem manage vê as ações de editar e de mudar os pontos antes do primeiro resultado', async () => {
    const t = setup();
    const c = await open(t);
    expect((await t.service.get(ANA, PUBLIC_ID, c.id, 'all')).actions).toEqual({
      manage: true,
      editPoints: true,
    });
  });
});

describe('COM-09: a ordem', () => {
  it('COM-09: mais pontos primeiro; empatados dividem a posição e a próxima pula', async () => {
    const t = setup();
    const c = await open(t);
    const m = await played(t, { competitionIds: [c.id] });
    // 2 times de 2: o time 1 vence; ANA e BIA com 3, CAIO e EDU com 0
    await record(
      t,
      m.id,
      day(
        [
          [ref(ANA), ref(BIA)],
          [ref(CAIO), ref(EDU)],
        ],
        1,
      ),
    );
    expect((await rows(t, c.id)).map((r) => r.position)).toEqual([1, 1, 3, 3]);
  });
});

describe('COM-10: encerrar', () => {
  it('COM-10: encerrar antes do fim faz o fim ser hoje; ela fica no prazo depois', async () => {
    const t = setup();
    const c = await open(t);
    t.at('2026-12-05T15:00:00.000Z');
    const closed = await t.service.close(ANA, PUBLIC_ID, c.id);
    expect(closed.endDate).toBe('2026-12-05');
    expect(closed.status).toBe('open');
    t.at('2026-12-06T15:00:00.000Z');
    expect((await t.service.get(BIA, PUBLIC_ID, c.id, 'all')).status).toBe('grace');
  });

  it('COM-10: encerrar uma que já passou do fim não muda nada', async () => {
    const t = setup();
    const c = await open(t, { endDate: '2026-12-02' });
    t.at('2026-12-03T15:00:00.000Z');
    const closed = await t.service.close(ANA, PUBLIC_ID, c.id);
    expect(closed.endDate).toBe('2026-12-02');
  });

  it('COM-10: sem competitions.manage, GROUP_PERMISSION_DENIED; travada, COMPETITION_LOCKED', async () => {
    const t = setup();
    const c = await open(t, { endDate: '2026-12-02' });
    expect((await failure(t.service.close(BIA, PUBLIC_ID, c.id)))?.code).toBe('GROUP_PERMISSION_DENIED');
    t.at('2026-12-10T15:00:00.000Z');
    await t.service.runLock();
    expect((await failure(t.service.close(ANA, PUBLIC_ID, c.id)))?.code).toBe('COMPETITION_LOCKED');
  });
});

describe('COM-11: situações e trava', () => {
  const END2 = '2026-12-02';
  it('COM-11: aberta até o fim do último dia, no prazo nos 3 dias seguintes, travada depois', async () => {
    const t = setup();
    const c = await open(t, { endDate: END2 });
    const status = async (when: string) => {
      t.at(when);
      return (await t.service.get(BIA, PUBLIC_ID, c.id, 'all')).status;
    };
    expect(await status('2026-12-03T02:00:00.000Z')).toBe('open'); // 02/12, 23h em SP
    expect(await status('2026-12-03T04:00:00.000Z')).toBe('grace'); // 03/12, 01h
    expect(await status('2026-12-06T02:00:00.000Z')).toBe('grace'); // 05/12, 23h
    expect(await status('2026-12-06T04:00:00.000Z')).toBe('locked'); // 06/12, 01h
  });

  it('COM-11: no prazo o ranking ainda acompanha os resultados corrigidos', async () => {
    const t = setup();
    const c = await open(t, { endDate: '2026-12-01' }); // 7 dias, o mínimo (COM-02)
    const m = await played(t, { competitionIds: [c.id] });
    const saved = await record(t, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    t.at('2026-12-04T15:00:00.000Z'); // no prazo
    await record(t, m.id, day([[ref(ANA)], [ref(BIA)]], 2, saved.result?.version ?? 1));
    expect((await rows(t, c.id))[0]?.user.id).toBe(PUB[BIA]);
  });

  it('COM-11: travada, o ranking final fica guardado e um resultado corrigido depois não muda', async () => {
    const t = setup();
    const c = await open(t, { endDate: '2026-12-01' }); // 7 dias, o mínimo (COM-02)
    const m = await played(t, { competitionIds: [c.id] });
    const saved = await record(t, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    t.at('2026-12-10T15:00:00.000Z');
    await t.service.runLock();
    const before = await t.service.get(BIA, PUBLIC_ID, c.id, 'all');
    expect(before.status).toBe('locked');
    expect(before.lockedAt).toBeDefined();
    await record(t, m.id, day([[ref(ANA)], [ref(BIA)]], 2, saved.result?.version ?? 1));
    t.state.participants.delete(ANA);
    const after = await t.service.get(BIA, PUBLIC_ID, c.id, 'all');
    expect(after.ranking).toEqual(before.ranking);
    expect(nicks(after.ranking)).toEqual([PUB[ANA], PUB[BIA]]);
  });

  it('COM-11: a primeira leitura depois do prazo também trava, e a rotina depois não grava de novo', async () => {
    const t = setup();
    const c = await open(t, { endDate: '2026-12-01' }); // 7 dias, o mínimo (COM-02)
    const m = await played(t, { competitionIds: [c.id] });
    await record(t, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    t.at('2026-12-10T15:00:00.000Z');
    const read = await t.service.get(BIA, PUBLIC_ID, c.id, 'all'); // trava na leitura
    await t.service.runLock();
    const again = await t.service.get(BIA, PUBLIC_ID, c.id, 'all');
    expect(again.lockedAt).toBe(read.lockedAt);
    expect(again.lockedAt).toBe('2026-12-10T15:00:00.000Z');
    expect(again.version).toBe(read.version);
  });

  it('COM-11: o ranking final guarda os três recortes', async () => {
    const t = setup();
    const c = await open(t, { endDate: '2026-12-01' }); // 7 dias, o mínimo (COM-02)
    const m = await played(t, { competitionIds: [c.id] });
    await record(t, m.id, day([[ref(ANA), ref(CAIO)], [ref(BIA)]], 1));
    t.at('2026-12-10T15:00:00.000Z');
    await t.service.runLock();
    expect(nicks(await rows(t, c.id, 'female'))).toEqual([PUB[ANA], PUB[BIA]]);
    expect(nicks(await rows(t, c.id, 'male'))).toEqual([PUB[CAIO]]);
  });
});

describe('PAR-40: o Vale para da partida', () => {
  it('PAR-40: a partida avulsa nasce valendo para nada', async () => {
    const t = setup();
    await open(t);
    const m = await t.matches.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    expect(m.competitions).toEqual([]);
  });

  it('PAR-40: quem tem matches.manage liga as competições e a version da partida sobe', async () => {
    const t = setup();
    const c = await open(t);
    const m = await t.matches.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    const next = await t.matches.setCompetitions(ANA, PUBLIC_ID, m.id, {
      competitionIds: [c.id],
      expectedVersion: m.version,
    });
    expect(next.competitions.map((x) => x.id)).toEqual([c.id]);
    expect(next.version).toBe(m.version + 1);
    expect((await t.matches.get(BIA, PUBLIC_ID, m.id)).competitions.map((x) => x.id)).toEqual([c.id]);
  });

  it('PAR-40: sem matches.manage, GROUP_PERMISSION_DENIED; version velha, VERSION_CONFLICT', async () => {
    const t = setup();
    const c = await open(t);
    const m = await t.matches.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    const body = { competitionIds: [c.id], expectedVersion: m.version };
    expect((await failure(t.matches.setCompetitions(BIA, PUBLIC_ID, m.id, body)))?.code).toBe(
      'GROUP_PERMISSION_DENIED',
    );
    await t.matches.setCompetitions(ANA, PUBLIC_ID, m.id, body);
    expect((await failure(t.matches.setCompetitions(ANA, PUBLIC_ID, m.id, body)))?.code).toBe(
      'VERSION_CONFLICT',
    );
  });

  it('PAR-40: competição que não existe, COMPETITION_NOT_FOUND; a travada, COMPETITION_LOCKED', async () => {
    const t = setup();
    const m = await t.matches.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    expect(
      (
        await failure(
          t.matches.setCompetitions(ANA, PUBLIC_ID, m.id, {
            competitionIds: [UNKNOWN],
            expectedVersion: m.version,
          }),
        )
      )?.code,
    ).toBe('COMPETITION_NOT_FOUND');
    const c = await open(t, { endDate: '2026-12-02' });
    t.at('2026-12-10T15:00:00.000Z');
    await t.service.runLock();
    const fresh = await t.matches.get(ANA, PUBLIC_ID, m.id);
    expect(
      (
        await failure(
          t.matches.setCompetitions(ANA, PUBLIC_ID, m.id, {
            competitionIds: [c.id],
            expectedVersion: fresh.version,
          }),
        )
      )?.code,
    ).toBe('COMPETITION_LOCKED');
  });

  it('PAR-40: partida fora do período responde MATCH_OUTSIDE_COMPETITION com o id', async () => {
    const t = setup();
    const c = await open(t, { endDate: '2026-12-02' });
    const m = await t.matches.create(ANA, PUBLIC_ID, {
      startsAt: '2026-12-04T22:00:00.000Z',
      endsAt: '2026-12-05T00:00:00.000Z',
    });
    const err = await failure(
      t.matches.setCompetitions(ANA, PUBLIC_ID, m.id, { competitionIds: [c.id], expectedVersion: m.version }),
    );
    expect(err).toMatchObject({
      code: 'MATCH_OUTSIDE_COMPETITION',
      status: 422,
      details: { competitionId: c.id },
    });
  });

  it('PAR-40: partida cancelada responde MATCH_CANCELLED', async () => {
    const t = setup();
    const c = await open(t);
    const m = await t.matches.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    const cancelled = await t.matches.cancel(ANA, PUBLIC_ID, m.id);
    const err = await failure(
      t.matches.setCompetitions(ANA, PUBLIC_ID, m.id, {
        competitionIds: [c.id],
        expectedVersion: cancelled.version,
      }),
    );
    expect(err?.code).toBe('MATCH_CANCELLED');
  });

  it('PAR-40: repetida ou mais de 3 competições, VALIDATION_ERROR', async () => {
    const t = setup();
    const c = await open(t);
    const m = await t.matches.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    const dup = await failure(
      t.matches.setCompetitions(ANA, PUBLIC_ID, m.id, {
        competitionIds: [c.id, c.id],
        expectedVersion: m.version,
      }),
    );
    expect(dup?.code).toBe('VALIDATION_ERROR');
    const four = await failure(
      t.matches.setCompetitions(ANA, PUBLIC_ID, m.id, {
        competitionIds: [
          c.id,
          UNKNOWN,
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002',
        ],
        expectedVersion: m.version,
      }),
    );
    expect(four?.code).toBe('VALIDATION_ERROR');
  });

  it('PAR-40: muda também depois do fim da partida, enquanto a competição não travou, e passa a somar', async () => {
    const t = setup();
    const c = await open(t);
    const m = await played(t);
    await record(t, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    expect(await rows(t, c.id)).toEqual([]);
    t.at(iso(END, 5)); // a partida já terminou
    const fresh = await t.matches.get(ANA, PUBLIC_ID, m.id);
    expect(fresh.actions.manageCompetitions).toBe(true);
    await t.matches.setCompetitions(ANA, PUBLIC_ID, m.id, {
      competitionIds: [c.id],
      expectedVersion: fresh.version,
    });
    expect(nicks(await rows(t, c.id))).toEqual([PUB[ANA], PUB[BIA]]);
  });

  it('PAR-40: tirar a partida de uma competição também a tira do ranking', async () => {
    const t = setup();
    const c = await open(t);
    const m = await played(t, { competitionIds: [c.id] });
    await record(t, m.id, day([[ref(ANA)], [ref(BIA)]], 1));
    const fresh = await t.matches.get(ANA, PUBLIC_ID, m.id);
    await t.matches.setCompetitions(ANA, PUBLIC_ID, m.id, {
      competitionIds: [],
      expectedVersion: fresh.version,
    });
    expect(await rows(t, c.id)).toEqual([]);
  });
});

describe('PAR-21, 22, 40: a repetição leva o Vale para', () => {
  /** A repetição de sexta, as partes editáveis dela como entram no PUT (PAR-22). */
  async function series(t: T) {
    const first = await t.matches.create(ANA, PUBLIC_ID, {
      startsAt: START,
      endsAt: END,
      repeatWeekly: true,
      timeZone: ZONE,
    });
    return { first, series: first.series as NonNullable<typeof first.series> };
  }
  const input = (s: NonNullable<Awaited<ReturnType<typeof series>>['series']>, competitionIds: string[]) => {
    const { id: _id, timeZone: _tz, endedAt: _end, competitions: _c, version, ...fields } = s;
    return { ...fields, competitionIds, expectedVersion: version };
  };

  it('PAR-22, 40: as competições entram no PUT da repetição e a repetição as mostra', async () => {
    const t = setup();
    const c = await open(t);
    const { series: s } = await series(t);
    await t.matches.updateSeries(ANA, PUBLIC_ID, s.id, input(s, [c.id]));
    const m = (await t.matches.list(BIA, PUBLIC_ID))[0];
    expect((await t.matches.get(BIA, PUBLIC_ID, m?.id ?? '')).series?.competitions.map((x) => x.id)).toEqual([
      c.id,
    ]);
  });

  it('PAR-22, 40: a repetição confere se a competição existe e se não está travada', async () => {
    const t = setup();
    const { series: s } = await series(t);
    expect((await failure(t.matches.updateSeries(ANA, PUBLIC_ID, s.id, input(s, [UNKNOWN]))))?.code).toBe(
      'COMPETITION_NOT_FOUND',
    );
  });

  it('PAR-21, 40: a próxima partida nasce com as competições da repetição cujo período tem o início dela', async () => {
    const t = setup();
    const inside = await open(t, { endDate: '2026-12-31' });
    const short = await open(t, { endDate: '2026-12-02' }); // não alcança 04/12
    const { first, series: s } = await series(t);
    await t.matches.updateSeries(ANA, PUBLIC_ID, s.id, input(s, [inside.id, short.id]));
    t.at(iso(END, 0.1)); // a primeira terminou e foi finalizada: a seguinte (04/12) nasce
    await t.matches.start(ANA, PUBLIC_ID, first.id);
    await t.matches.finish(ANA, PUBLIC_ID, first.id);
    const [next] = await t.matches.list(BIA, PUBLIC_ID);
    expect(next?.id).not.toBe(first.id);
    const view = await t.matches.get(BIA, PUBLIC_ID, next?.id ?? '');
    expect(view.competitions.map((x) => x.id)).toEqual([inside.id]);
  });

  it('PAR-21, 40: a mudança da repetição vale só para as partidas criadas depois dela', async () => {
    const t = setup();
    const c = await open(t);
    const { first, series: s } = await series(t);
    await t.matches.updateSeries(ANA, PUBLIC_ID, s.id, input(s, [c.id]));
    expect((await t.matches.get(BIA, PUBLIC_ID, first.id)).competitions).toEqual([]);
  });

  it('PAR-21, 40: a competição travada deixa de ir para a partida nova', async () => {
    const t = setup();
    const c = await open(t, { endDate: '2026-12-31' });
    const { first, series: s } = await series(t);
    await t.matches.updateSeries(ANA, PUBLIC_ID, s.id, input(s, [c.id]));
    t.at(plusDays(END, 70)); // passou muito do prazo: travada
    await t.service.runLock();
    await t.matches.start(ANA, PUBLIC_ID, first.id);
    await t.matches.finish(ANA, PUBLIC_ID, first.id);
    const list = await t.matches.list(BIA, PUBLIC_ID);
    expect(list).toHaveLength(1);
    for (const item of list) {
      expect((await t.matches.get(BIA, PUBLIC_ID, item.id)).competitions).toEqual([]);
    }
  });
});
