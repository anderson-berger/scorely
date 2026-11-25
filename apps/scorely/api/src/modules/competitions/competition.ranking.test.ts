import { competitionRanking, type RankingResult } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Função pura do ranking (COM-05, 06, 09). Pessoa = string; `eligible` diz quem é membro de agora.

const POINTS = { win: 3, draw: 1, loss: 0 };
const key = (p: string) => p;
const everyone = () => true;
const rank = (
  results: RankingResult<string>[],
  eligible: (p: string) => boolean = everyone,
  points = POINTS,
) => competitionRanking(results, points, key, eligible);
const dayResult = (teams: string[][], winner: number | 'draw'): RankingResult<string> => ({
  mode: 'day',
  teams,
  winner,
});

describe('COM-05: o que é um jogo', () => {
  it('COM-05: pelo dia, a partida é 1 jogo: vitória para o time vencedor, derrota para os outros', () => {
    const lines = rank([dayResult([['ana', 'bia'], ['caio']], 1)]);
    expect(lines.find((l) => l.member === 'ana')).toMatchObject({ points: 3, played: 1, wins: 1, losses: 0 });
    expect(lines.find((l) => l.member === 'caio')).toMatchObject({
      points: 0,
      played: 1,
      wins: 0,
      losses: 1,
    });
  });

  it('COM-05: pelo dia, no empate todos dos times ganham o empate', () => {
    const lines = rank([dayResult([['ana'], ['bia'], ['caio']], 'draw')]);
    expect(lines.map((l) => [l.points, l.draws])).toEqual([
      [1, 1],
      [1, 1],
      [1, 1],
    ]);
  });

  it('COM-05: por jogo, cada jogo conta: o Edu vence 4 de 5 e soma 12 pontos em 5 jogos', () => {
    const win = { teams: [['edu'], ['ana']] as const, winner: 'a' as const };
    const lose = { teams: [['edu'], ['ana']] as const, winner: 'b' as const };
    const lines = rank([{ mode: 'games', games: [win, win, win, win, lose] }]);
    expect(lines.find((l) => l.member === 'edu')).toMatchObject({
      points: 12,
      played: 5,
      wins: 4,
      losses: 1,
      winRate: 0.8,
    });
    expect(lines.find((l) => l.member === 'ana')).toMatchObject({ points: 3, played: 5, wins: 1 });
  });

  it('COM-05: soma partidas de modos diferentes na mesma pessoa', () => {
    const lines = rank([
      dayResult([['ana'], ['bia']], 1),
      { mode: 'games', games: [{ teams: [['ana'], ['bia']], winner: 'draw' }] },
    ]);
    expect(lines.find((l) => l.member === 'ana')).toMatchObject({ points: 4, played: 2, wins: 1, draws: 1 });
  });

  it('COM-03, 05: usa os pontos da competição', () => {
    const lines = rank([dayResult([['ana'], ['bia']], 1)], everyone, { win: 5, draw: 2, loss: 1 });
    expect(lines.map((l) => [l.member, l.points])).toEqual([
      ['ana', 5],
      ['bia', 1],
    ]);
  });
});

describe('COM-06: só quem é elegível', () => {
  it('COM-06: quem não é elegível (reserva, convidado) não aparece', () => {
    const lines = rank([dayResult([['ana', 'guest:1'], ['duda']], 1)], (p) => p === 'ana');
    expect(lines.map((l) => l.member)).toEqual(['ana']);
  });
});

describe('COM-09: a ordem e as posições', () => {
  it('COM-09: mais pontos primeiro', () => {
    const lines = rank([dayResult([['ana'], ['bia']], 2)]);
    expect(lines.map((l) => [l.member, l.position])).toEqual([
      ['bia', 1],
      ['ana', 2],
    ]);
  });

  it('COM-09: empatados em pontos, o maior aproveitamento vem antes', () => {
    // ana: 1 vitória em 1 jogo (3 pts, 100%). bia: 3 empates em 3 jogos (3 pts, 0%).
    const draw = { teams: [['bia'], ['caio']] as const, winner: 'draw' as const };
    const lines = rank([dayResult([['ana'], ['duda']], 1), { mode: 'games', games: [draw, draw, draw] }]);
    const order = lines.map((l) => l.member);
    expect(order.indexOf('ana')).toBeLessThan(order.indexOf('bia'));
    expect(lines.find((l) => l.member === 'ana')?.points).toBe(3);
    expect(lines.find((l) => l.member === 'bia')?.points).toBe(3);
  });

  it('COM-09: pontos e aproveitamento iguais, quem jogou mais vem antes', () => {
    // Com 0 ponto para tudo, ana (1 jogo) e bia (2 jogos) empatam em pontos e aproveitamento.
    const lines = rank(
      [
        { mode: 'games', games: [{ teams: [['ana'], ['x']], winner: 'draw' }] },
        {
          mode: 'games',
          games: [
            { teams: [['bia'], ['x']], winner: 'draw' },
            { teams: [['bia'], ['x']], winner: 'draw' },
          ],
        },
      ],
      (p) => p !== 'x',
      { win: 0, draw: 0, loss: 0 },
    );
    expect(lines.map((l) => [l.member, l.position])).toEqual([
      ['bia', 1],
      ['ana', 2],
    ]);
  });

  it('COM-09: empate total divide a posição e a próxima pula (1, 2, 2, 4)', () => {
    // ana vence mais; bia e caio idênticos; duda perde.
    const lines = rank([
      dayResult([['ana'], ['bia'], ['caio'], ['duda']], 1),
      dayResult([['ana'], ['bia'], ['caio'], ['duda']], 'draw'),
    ]);
    // ana 4 pts; bia/caio/duda 1 pt cada, mesmos jogos e aproveitamento: três divididos.
    expect(lines.map((l) => l.position)).toEqual([1, 2, 2, 2]);
    const four = rank([
      dayResult([['ana'], ['bia'], ['caio'], ['duda']], 1),
      dayResult([['bia'], ['caio']], 'draw'),
    ]);
    expect(four.map((l) => [l.member, l.position])).toEqual([
      ['ana', 1],
      ['bia', 2],
      ['caio', 2],
      ['duda', 4],
    ]);
  });
});
