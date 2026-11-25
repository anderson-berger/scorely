import { dayWinners, resultStandings, SaveMatchResultInputSchema } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// As funções puras do contrato que a tela do resultado usa para mostrar a contagem (PAR-33, 34).

type G = { teams: readonly [readonly string[], readonly string[]]; winner: 'a' | 'b' | 'draw' };
const key = (p: string) => p;
const rounds: G[] = [
  { teams: [['ana', 'bia'], ['caio']], winner: 'a' },
  { teams: [['ana'], ['duda']], winner: 'a' },
  { teams: [['bia'], ['caio']], winner: 'draw' },
];

describe('PAR-34: contagem por jogo', () => {
  it('PAR-34: jogos, vitórias, empates e derrotas de cada pessoa, de quem mais venceu para quem menos', () => {
    const s = resultStandings(rounds, key);
    expect(s.map((x) => x.member)[0]).toBe('ana');
    expect(s.find((x) => x.member === 'ana')).toMatchObject({ played: 2, wins: 2, draws: 0, losses: 0 });
    expect(s.find((x) => x.member === 'bia')).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0 });
    expect(s.find((x) => x.member === 'caio')).toMatchObject({ played: 2, wins: 0, draws: 1, losses: 1 });
    expect(s.find((x) => x.member === 'duda')).toMatchObject({ played: 1, wins: 0, draws: 0, losses: 1 });
  });

  it('PAR-34: venceu o dia quem tem mais vitórias; empate nas vitórias, todos; só empates, ninguém', () => {
    expect(dayWinners({ mode: 'games', games: rounds }, key)).toEqual(['ana']);
    const tie: G[] = [
      { teams: [['ana'], ['bia']], winner: 'a' },
      { teams: [['bia'], ['ana']], winner: 'a' },
    ];
    expect(dayWinners({ mode: 'games', games: tie }, key).sort()).toEqual(['ana', 'bia']);
    expect(
      dayWinners({ mode: 'games', games: [{ teams: [['ana'], ['bia']], winner: 'draw' }] }, key),
    ).toEqual([]);
  });

  it('PAR-34: não muta a entrada', () => {
    const copy = JSON.stringify(rounds);
    resultStandings(rounds, key);
    expect(JSON.stringify(rounds)).toBe(copy);
  });
});

describe('PAR-33: vencedor do dia', () => {
  it('PAR-33: pelo dia, o time do winner (1 = Time 1); no empate, ninguém', () => {
    const teams = [['ana'], ['bia', 'caio']];
    expect(dayWinners({ mode: 'day', teams, winner: 2 }, key)).toEqual(['bia', 'caio']);
    expect(dayWinners({ mode: 'day', teams, winner: 'draw' }, key)).toEqual([]);
  });
});

describe('PAR-32, 33, 34: o corpo do PUT .../result', () => {
  const p = (id: string) => ({ kind: 'user' as const, id: `${id.repeat(8)}` });
  it('PAR-33: winner além dos times, time vencedor vazio e pessoa repetida não passam', () => {
    const base = { mode: 'day', expectedVersion: 0 };
    const ok = { ...base, teams: [[p('A')], [p('B')]], winner: 2 };
    expect(SaveMatchResultInputSchema.safeParse(ok).success).toBe(true);
    expect(SaveMatchResultInputSchema.safeParse({ ...ok, winner: 3 }).success).toBe(false);
    expect(SaveMatchResultInputSchema.safeParse({ ...ok, teams: [[p('A')], []] }).success).toBe(false);
    expect(SaveMatchResultInputSchema.safeParse({ ...ok, teams: [[p('A')], [p('A')]] }).success).toBe(false);
  });

  it('PAR-34: de 1 a 30 jogos, times não vazios e ninguém nos dois times', () => {
    const game = { teams: [[p('A')], [p('B')]], winner: 'a' };
    const ok = { mode: 'games', games: [game], expectedVersion: 0 };
    expect(SaveMatchResultInputSchema.safeParse(ok).success).toBe(true);
    expect(SaveMatchResultInputSchema.safeParse({ ...ok, games: [] }).success).toBe(false);
    expect(SaveMatchResultInputSchema.safeParse({ ...ok, games: Array(31).fill(game) }).success).toBe(false);
    expect(
      SaveMatchResultInputSchema.safeParse({ ...ok, games: [{ ...game, teams: [[p('A')], [p('A')]] }] })
        .success,
    ).toBe(false);
  });
});
