import type {
  Match,
  MatchEntry,
  MatchHistoryResult,
  MatchLineup,
  MatchResult,
  MatchResultMember,
  MatchTeamPlayerRef,
  PublicUserId,
  User,
} from '@scorely/contracts';
import {
  dayDraftFrom,
  dayInput,
  draftStandings,
  gameOut,
  gameReady,
  gamesDraftFrom,
  gamesInput,
  hasContent,
  listRefs,
  moveInGame,
  nextGame,
  resultHeadline,
  sideOf,
  sortedStandings,
  startMode,
  winnersText,
} from '@scorely/web/src/modules/matches/match.result';
import { describe, expect, it } from 'vitest';

// PAR-37 (Anteriores), PAR-38 (seção Resultado) e PAR-39 (tela do resultado): a parte pura.

const user = (nickname: string, id: string): User => ({
  id: id as PublicUserId,
  createdAt: '2026-01-01T00:00:00.000Z',
  nickname,
});
const u = (id: string): MatchTeamPlayerRef => ({ kind: 'user', id: id as PublicUserId });
const g = (id: string): MatchTeamPlayerRef => ({ kind: 'guest', id });
const entry = (nickname: string, id: string, tier: 'member' | 'reserve' = 'member'): MatchEntry => ({
  kind: 'player',
  user: user(nickname, id),
  tier,
});
const guestEntry = (name: string, id: string): MatchEntry => ({
  kind: 'guest',
  guestId: id,
  name,
  requestedBy: user('Edu', 'E1'),
  removable: false,
});
const rPlayer = (nickname: string, id: string): MatchResultMember => ({
  kind: 'player',
  user: user(nickname, id),
});
const rGuest = (name: string, id: string): MatchResultMember => ({
  kind: 'guest',
  guestId: id,
  name,
  requestedBy: user('Edu', 'E1'),
});
const gone: MatchResultMember = { kind: 'gone' };

const lineupOf = (list: MatchLineup['list']): MatchLineup => ({ list, unassigned: [], version: 1 });

type Base = Pick<Match, 'in' | 'queue' | 'lineup' | 'result' | 'resultMode'>;
const baseMatch = (over: Partial<Base> = {}): Base => ({
  in: [entry('Edu', 'E1'), entry('Bia', 'B1'), guestEntry('Joao', 'g1')],
  queue: [entry('Caio', 'C1', 'reserve')],
  lineup: undefined,
  result: undefined,
  resultMode: 'day',
  ...over,
});

describe('PAR-39: de onde a tela começa', () => {
  it('PAR-39: listRefs traz dentro e depois a fila, na ordem', () => {
    expect(listRefs(baseMatch())).toEqual([u('E1'), u('B1'), g('g1'), u('C1')]);
  });

  it('PAR-31, 39: começa no jeito do resultado registrado; sem resultado, no configurado', () => {
    const dayResult: MatchResult = { mode: 'day', teams: [[], []], winner: 1, dayWinners: [], version: 1 };
    const gamesResult: MatchResult = { mode: 'games', games: [], standings: [], dayWinners: [], version: 1 };
    expect(startMode(baseMatch({ resultMode: 'games' }))).toBe('games');
    expect(startMode(baseMatch({ resultMode: 'games', result: dayResult }))).toBe('day');
    expect(startMode(baseMatch({ resultMode: 'day', result: gamesResult }))).toBe('games');
  });

  it('PAR-39: pelo dia, sem resultado nem times salvos, abre com dois times vazios e todos De fora', () => {
    const d = dayDraftFrom(baseMatch());
    expect(d.teams).toEqual([[], []]);
    expect(d.unassigned).toEqual([u('E1'), u('B1'), g('g1'), u('C1')]);
    expect(d.winner).toBeUndefined();
  });

  it('PAR-39: pelo dia, sem resultado, começa nos times salvos sem quem saiu ou foi removido', () => {
    const lineup = lineupOf([
      [
        { kind: 'player', user: user('Edu', 'E1'), tier: 'member', left: false },
        { kind: 'player', user: user('Bia', 'B1'), tier: 'member', left: true },
        { kind: 'gone', left: true },
      ],
      [{ kind: 'guest', guestId: 'g1', name: 'Joao', requestedBy: user('Edu', 'E1'), left: false }],
      [],
    ]);
    const d = dayDraftFrom(baseMatch({ lineup }));
    expect(d.teams).toEqual([[u('E1')], [g('g1')], []]);
    expect(d.unassigned).toEqual([u('B1'), u('C1')]);
  });

  it('PAR-39: pelo dia, com um time salvo só, ainda há pelo menos dois times', () => {
    const lineup = lineupOf([[{ kind: 'player', user: user('Edu', 'E1'), tier: 'member', left: false }]]);
    const d = dayDraftFrom(baseMatch({ lineup }));
    expect(d.teams).toEqual([[u('E1')], []]);
  });

  it('PAR-39: pelo dia, o resultado registrado vence os times salvos, com o vencedor, sem a pessoa removida', () => {
    const lineup = lineupOf([[{ kind: 'player', user: user('Edu', 'E1'), tier: 'member', left: false }], []]);
    const result: MatchResult = {
      mode: 'day',
      teams: [
        [rPlayer('Bia', 'B1'), gone],
        [rGuest('Joao', 'g1'), rPlayer('Caio', 'C1')],
      ],
      winner: 2,
      dayWinners: [],
      version: 4,
    };
    const d = dayDraftFrom(baseMatch({ lineup, result }));
    expect(d.teams).toEqual([[u('B1')], [g('g1'), u('C1')]]);
    expect(d.unassigned).toEqual([u('E1')]);
    expect(d.winner).toBe(2);
  });

  it('PAR-39: pelo dia, um resultado por jogo não entra nos times: valem os salvos', () => {
    const lineup = lineupOf([[{ kind: 'player', user: user('Edu', 'E1'), tier: 'member', left: false }], []]);
    const result: MatchResult = { mode: 'games', games: [], standings: [], dayWinners: [], version: 1 };
    const d = dayDraftFrom(baseMatch({ lineup, result }));
    expect(d.teams).toEqual([[u('E1')], []]);
    expect(d.winner).toBeUndefined();
  });

  it('PAR-39: por jogo, os jogos do resultado registrado voltam como estão; sem resultado por jogo, nenhum', () => {
    const result: MatchResult = {
      mode: 'games',
      games: [
        { teams: [[rPlayer('Edu', 'E1'), gone], [rPlayer('Bia', 'B1')]], winner: 'a' },
        { teams: [[rPlayer('Edu', 'E1')], [rGuest('Joao', 'g1')]], winner: 'draw' },
      ],
      standings: [],
      dayWinners: [],
      version: 2,
    };
    expect(gamesDraftFrom({ result })).toEqual([
      { a: [u('E1')], b: [u('B1')], winner: 'a' },
      { a: [u('E1')], b: [g('g1')], winner: 'draw' },
    ]);
    expect(gamesDraftFrom({ result: undefined })).toEqual([]);
    expect(
      gamesDraftFrom({ result: { mode: 'day', teams: [], winner: 'draw', dayWinners: [], version: 1 } }),
    ).toEqual([]);
  });
});

describe('PAR-39: o jogo novo', () => {
  it('PAR-39: o jogo novo vem com os times do anterior, sem quem venceu', () => {
    const games = [
      { a: [u('E1')], b: [u('B1')], winner: 'a' as const },
      { a: [u('E1'), g('g1')], b: [u('C1')], winner: 'b' as const },
    ];
    expect(nextGame(games, baseMatch())).toEqual({ a: [u('E1'), g('g1')], b: [u('C1')] });
  });

  it('PAR-39: o jogo novo não compartilha a lista do anterior (mexer num não muda o outro)', () => {
    const last = { a: [u('E1')], b: [u('B1')], winner: 'a' as const };
    const next = nextGame([last], baseMatch());
    expect(next.a).not.toBe(last.a);
    expect(next.b).not.toBe(last.b);
  });

  it('PAR-39: o primeiro jogo vem com o Time 1 e o Time 2 salvos; os outros times ficam De fora', () => {
    const lineup = lineupOf([
      [
        { kind: 'player', user: user('Edu', 'E1'), tier: 'member', left: false },
        { kind: 'player', user: user('Bia', 'B1'), tier: 'member', left: true },
      ],
      [{ kind: 'guest', guestId: 'g1', name: 'Joao', requestedBy: user('Edu', 'E1'), left: false }],
      [{ kind: 'player', user: user('Caio', 'C1'), tier: 'reserve', left: false }],
    ]);
    const first = nextGame([], baseMatch({ lineup }));
    expect(first).toEqual({ a: [u('E1')], b: [g('g1')] });
    expect(sideOf(first, u('C1'))).toBeNull();
  });

  it('PAR-39: o primeiro jogo sem times salvos vem vazio', () => {
    expect(nextGame([], baseMatch())).toEqual({ a: [], b: [] });
  });
});

describe('PAR-39: o painel do jogo', () => {
  const game = { a: [u('E1')], b: [u('B1')] };

  it('PAR-39: sideOf diz o time da pessoa, ou null (De fora)', () => {
    expect(sideOf(game, u('E1'))).toBe('a');
    expect(sideOf(game, u('B1'))).toBe('b');
    expect(sideOf(game, u('C1'))).toBeNull();
  });

  it('PAR-39: moveInGame põe no fim do time escolhido, tirando do outro; null deixa De fora', () => {
    expect(moveInGame(game, u('E1'), 'b')).toEqual({ a: [], b: [u('B1'), u('E1')] });
    expect(moveInGame(game, u('C1'), 'a')).toEqual({ a: [u('E1'), u('C1')], b: [u('B1')] });
    expect(moveInGame(game, u('B1'), null)).toEqual({ a: [u('E1')], b: [] });
  });

  it('PAR-39: moveInGame não muta e guarda o vencedor', () => {
    const withWinner = { ...game, winner: 'a' as const };
    const copy = JSON.stringify(withWinner);
    const moved = moveInGame(withWinner, u('E1'), 'b');
    expect(JSON.stringify(withWinner)).toBe(copy);
    expect(moved.winner).toBe('a');
  });

  it('PAR-39: gameOut é quem está na lista e ficou fora do jogo, na ordem da lista', () => {
    expect(gameOut(game, [u('C1'), u('B1'), g('g1'), u('E1')])).toEqual([u('C1'), g('g1')]);
  });

  it('PAR-34, 39: o jogo só está pronto com os dois times com alguém e quem venceu escolhido', () => {
    expect(gameReady({ a: [u('E1')], b: [u('B1')], winner: 'a' })).toBe(true);
    expect(gameReady({ a: [u('E1')], b: [u('B1')], winner: 'draw' })).toBe(true);
    expect(gameReady({ a: [u('E1')], b: [u('B1')] })).toBe(false);
    expect(gameReady({ a: [], b: [u('B1')], winner: 'b' })).toBe(false);
    expect(gameReady({ a: [u('E1')], b: [], winner: 'a' })).toBe(false);
  });
});

describe('PAR-39: trocar de jeito e salvar', () => {
  const emptyDay = { teams: [[], []], unassigned: [u('E1')] };

  it('PAR-39: hasContent: pelo dia, com alguém num time ou vencedor; por jogo, com algum jogo', () => {
    expect(hasContent('day', emptyDay, [])).toBe(false);
    expect(hasContent('day', { ...emptyDay, teams: [[u('E1')], []] }, [])).toBe(true);
    expect(hasContent('day', { ...emptyDay, winner: 'draw' }, [])).toBe(true);
    expect(hasContent('games', emptyDay, [])).toBe(false);
    expect(hasContent('games', emptyDay, [{ a: [], b: [] }])).toBe(true);
  });

  it('PAR-39: hasContent olha só o jeito de agora', () => {
    expect(hasContent('games', { ...emptyDay, winner: 1 }, [])).toBe(false);
    expect(hasContent('day', emptyDay, [{ a: [u('E1')], b: [u('B1')], winner: 'a' }])).toBe(false);
  });

  it('PAR-32, 33: dayInput leva os times, o vencedor (1 = Time 1) e a versão; sem vencedor, não salva', () => {
    const day = { teams: [[u('E1')], [u('B1')]], unassigned: [u('C1')], winner: 2 as const };
    expect(dayInput(day, 3)).toEqual({
      mode: 'day',
      teams: [[u('E1')], [u('B1')]],
      winner: 2,
      expectedVersion: 3,
    });
    expect(dayInput({ ...day, winner: 'draw' }, 0)).toMatchObject({ winner: 'draw', expectedVersion: 0 });
    expect(dayInput({ teams: day.teams, unassigned: day.unassigned }, 3)).toBeUndefined();
  });

  it('PAR-32, 34: gamesInput leva todos os jogos como [Time A, Time B]; jogo incompleto ou nenhum, não salva', () => {
    const ready = { a: [u('E1')], b: [u('B1')], winner: 'b' as const };
    expect(gamesInput([ready, { ...ready, winner: 'draw' }], 5)).toEqual({
      mode: 'games',
      games: [
        { teams: [[u('E1')], [u('B1')]], winner: 'b' },
        { teams: [[u('E1')], [u('B1')]], winner: 'draw' },
      ],
      expectedVersion: 5,
    });
    expect(gamesInput([ready, { a: [u('E1')], b: [u('B1')] }], 5)).toBeUndefined();
    expect(gamesInput([], 5)).toBeUndefined();
  });

  it('PAR-34, 39: draftStandings conta só os jogos prontos, enquanto se anota', () => {
    const s = draftStandings([
      { a: [u('E1'), u('B1')], b: [u('C1')], winner: 'a' },
      { a: [u('E1')], b: [u('C1')] },
    ]);
    const of = (id: string) => s.find((x) => x.member.id === id);
    expect(of('E1')).toMatchObject({ played: 1, wins: 1, draws: 0, losses: 0 });
    expect(of('C1')).toMatchObject({ played: 1, wins: 0, draws: 0, losses: 1 });
    expect(draftStandings([])).toEqual([]);
  });
});

describe('PAR-38: a contagem', () => {
  it('PAR-38: de quem mais venceu para quem menos venceu; no empate, pelo apelido', () => {
    const rows = [
      { name: 'Zeca', wins: 2 },
      { name: 'Bia', wins: 1 },
      { name: 'Ana', wins: 1 },
      { name: 'Edu', wins: 3 },
    ];
    const sorted = sortedStandings(rows, (r) => r.name);
    expect(sorted.map((r) => r.name)).toEqual(['Edu', 'Zeca', 'Ana', 'Bia']);
    expect(rows[0]?.name).toBe('Zeca');
  });
});

describe('PAR-37: quem venceu, numa linha', () => {
  it('PAR-37: winnersText com 1, 2 e mais de 2 pessoas', () => {
    expect(winnersText(['Edu'])).toBe('Edu venceu o dia');
    expect(winnersText(['Edu', 'Bia'])).toBe('Edu e Bia venceram o dia');
    expect(winnersText(['Edu', 'Bia', 'Caio', 'Dani', 'Eva'])).toBe('Edu, Bia e mais 3 venceram o dia');
    expect(winnersText(['Edu', 'Bia', 'Caio'])).toBe('Edu, Bia e mais 1 venceram o dia');
  });

  it('PAR-37: pelo dia, "Time 2 venceu" ou "Empate"', () => {
    expect(resultHeadline({ mode: 'day', winner: 2 })).toBe('Time 2 venceu');
    expect(resultHeadline({ mode: 'day', winner: 'draw' })).toBe('Empate');
  });

  it('PAR-37, 38: por jogo, quem venceu o dia (convidado pelo nome, pessoa removida como "Pessoa removida")', () => {
    const r = (dayWinners: MatchResultMember[]): MatchHistoryResult => ({ mode: 'games', dayWinners });
    expect(resultHeadline(r([rPlayer('Edu', 'E1')]))).toBe('Edu venceu o dia');
    expect(resultHeadline(r([rPlayer('Edu', 'E1'), rGuest('Joao', 'g1')]))).toBe('Edu e Joao venceram o dia');
    expect(resultHeadline(r([rPlayer('Edu', 'E1'), gone, rPlayer('Bia', 'B1'), rPlayer('Caio', 'C1')]))).toBe(
      'Edu, Pessoa removida e mais 2 venceram o dia',
    );
  });

  it('PAR-38: por jogo sem ninguém na frente (só empates), "Ninguém venceu o dia"', () => {
    expect(resultHeadline({ mode: 'games', dayWinners: [] })).toBe('Ninguém venceu o dia');
  });
});
