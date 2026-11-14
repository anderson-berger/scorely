import { dayWinners, gamePoints } from '@scorely/api/src/modules/competition/scoring';
import type { CompetitionRules } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Competição, etapa 3 (`.claude/work/competicao-3.md`, D4): os pontos por partida e o vencedor do dia (CMP-22).
// `ScoringInput` ganha `matches`; com `unit: 'match'`, quem veio soma as partidas (evento `played` e o `record`).
// `dayWinners(matches)` devolve quem tem mais vitórias (pelo menos 1).

const RULES: CompetitionRules = {
  points: { win: 5, draw: 2, loss: 1, notConfirmed: -1, noShow: -3, cancelled: 4 },
  unit: 'match',
  tiebreak: [],
};

// Membros
const M1 = 'aaaa0001-0000-4000-8000-000000000001';
const M2 = 'aaaa0002-0000-4000-8000-000000000002';
const M3 = 'aaaa0003-0000-4000-8000-000000000003';
const M_BENCH = 'aaaa0004-0000-4000-8000-000000000004'; // veio e não jogou nenhuma partida
const M_NOSHOW = 'aaaa0005-0000-4000-8000-000000000005'; // dentro e faltou
const M_QUEUE_ABSENT = 'aaaa0006-0000-4000-8000-000000000006'; // fila e faltou
const M_NOT_CONFIRMED = 'aaaa0007-0000-4000-8000-000000000007';
// Não membros
const RESERVE = 'bbbb0001-0000-4000-8000-000000000001';
const EXTRA = 'cccc0001-0000-4000-8000-000000000001';

const MEMBERS = [M1, M2, M3, M_BENCH, M_NOSHOW, M_QUEUE_ABSENT, M_NOT_CONFIRMED];

const LIST = [
  { id: M1, inside: true },
  { id: M2, inside: true },
  { id: RESERVE, inside: true },
  { id: M_NOSHOW, inside: true },
  { id: M3, inside: false },
  { id: M_BENCH, inside: false },
  { id: M_QUEUE_ABSENT, inside: false },
];

const ATTENDANCE = {
  [M1]: 'present',
  [M2]: 'present',
  [RESERVE]: 'present',
  [M_NOSHOW]: 'absent',
  [M3]: 'present',
  [M_BENCH]: 'present',
  [M_QUEUE_ABSENT]: 'absent',
} as const;

type Matches = NonNullable<Parameters<typeof gamePoints>[0]['matches']>;

/**
 * M1: V, V, E → 5 + 5 + 2 = 12 (2 V · 1 E · 0 D).
 * M2: D, D, E → 1 + 1 + 2 = 4 (0 V · 1 E · 2 D).
 * M3: D, V, E → 1 + 5 + 2 = 8 (1 V · 1 E · 1 D).
 */
const MATCHES: Matches = [
  {
    teams: [
      [M1, RESERVE],
      [M2, M3],
    ],
    winner: 0,
  },
  { teams: [[M3, M1, EXTRA], [M2]], winner: 0 },
  {
    teams: [
      [M1, M2],
      [M3, RESERVE],
    ],
    winner: 'draw',
  },
];

function input(extra: Partial<Parameters<typeof gamePoints>[0]> = {}): Parameters<typeof gamePoints>[0] {
  return {
    cancelled: false,
    friendly: false,
    members: MEMBERS,
    list: LIST,
    attendance: { ...ATTENDANCE },
    teams: [],
    unit: 'match',
    matches: MATCHES,
    ...extra,
  };
}

describe('os pontos por partida (CMP-22)', () => {
  it('CMP-22: cada membro que veio soma vitória, empate ou derrota de cada partida que jogou', () => {
    const res = gamePoints(input(), RULES);
    expect(res[M1]).toMatchObject({ event: 'played', points: 12 });
    expect(res[M2]).toMatchObject({ event: 'played', points: 4 });
    expect(res[M3]).toMatchObject({ event: 'played', points: 8 });
  });

  it('CMP-22: o membro leva as vitórias, empates e derrotas das partidas (record)', () => {
    const res = gamePoints(input(), RULES);
    expect(res[M1]?.record).toEqual({ wins: 2, draws: 1, losses: 0 });
    expect(res[M2]?.record).toEqual({ wins: 0, draws: 1, losses: 2 });
    expect(res[M3]?.record).toEqual({ wins: 1, draws: 1, losses: 1 });
  });

  it('CMP-22: quem veio e não jogou nenhuma partida fica com 0', () => {
    const res = gamePoints(input(), RULES);
    expect(res[M_BENCH]).toMatchObject({ event: 'noResult', points: 0 });
  });

  it('CMP-22: sem nenhuma partida, quem veio fica com 0', () => {
    const res = gamePoints(input({ matches: [] }), RULES);
    for (const id of [M1, M2, M3, M_BENCH]) expect(res[id]).toMatchObject({ event: 'noResult', points: 0 });
  });

  it('CMP-22: não confirmou, falta e fila que faltou valem uma vez por jogo, como na CMP-14', () => {
    const res = gamePoints(input(), RULES);
    expect(res[M_NOSHOW]).toMatchObject({ event: 'noShow', points: -3 });
    expect(res[M_QUEUE_ABSENT]).toMatchObject({ event: 'absentQueue', points: 0 });
    expect(res[M_NOT_CONFIRMED]).toMatchObject({ event: 'notConfirmed', points: -1 });
  });

  it('CMP-22: jogo cancelado → o ponto de cancelado para quem estava dentro, uma vez, sem somar partidas', () => {
    const res = gamePoints(input({ cancelled: true, attendance: {} }), RULES);
    for (const id of [M1, M2, M_NOSHOW]) expect(res[id]).toMatchObject({ event: 'cancelled', points: 4 });
    for (const id of [M3, M_BENCH, M_QUEUE_ABSENT, M_NOT_CONFIRMED]) expect(res[id]?.points).toBe(0);
  });

  it('CMP-22: só membros pontuam: reserva e avulso que jogaram ficam de fora', () => {
    const res = gamePoints(input(), RULES);
    expect(Object.keys(res).sort()).toEqual([...MEMBERS].sort());
    expect(res[RESERVE]).toBeUndefined();
    expect(res[EXTRA]).toBeUndefined();
  });

  it('CMP-22: os pontos saem do regulamento recebido (a cópia do fechamento)', () => {
    const other: CompetitionRules = {
      ...RULES,
      points: { win: 1, draw: 0, loss: -1, notConfirmed: 0, noShow: 0, cancelled: 0 },
    };
    const res = gamePoints(input(), other);
    expect(res[M1]?.points).toBe(2);
    expect(res[M2]?.points).toBe(-2);
    expect(res[M3]?.points).toBe(0);
  });

  it('CMP-22: amistoso → as partidas contam no record, e ninguém pontua', () => {
    const res = gamePoints(input({ friendly: true }), RULES);
    for (const id of MEMBERS) expect(res[id]?.points).toBe(0);
    expect(res[M1]).toMatchObject({ event: 'played' });
    expect(res[M1]?.record).toEqual({ wins: 2, draws: 1, losses: 0 });
  });

  it('CMP-22: com a unidade pelo dia, as partidas não contam (vale o resultado do dia)', () => {
    const res = gamePoints(input({ unit: 'day', teams: [[M1], [M2, M3]], winner: 0 }), {
      ...RULES,
      unit: 'day',
    });
    expect(res[M1]).toMatchObject({ event: 'win', points: 5 });
    expect(res[M2]).toMatchObject({ event: 'loss', points: 1 });
  });
});

describe('o vencedor do dia (CMP-22)', () => {
  it('CMP-22: o vencedor do dia é quem tem mais vitórias', () => {
    // M1: 2 vitórias; RESERVE, M3, EXTRA: 1.
    expect(dayWinners(MATCHES)).toEqual([M1]);
  });

  it('CMP-22: empate em vitórias → todos os empatados', () => {
    const matches: Matches = [
      { teams: [[M1], [M3]], winner: 0 },
      { teams: [[M2], [M3]], winner: 0 },
    ];
    expect([...dayWinners(matches)].sort()).toEqual([M1, M2].sort());
  });

  it('CMP-22: qualquer pessoa pode ser vencedor do dia: reserva e avulso também', () => {
    const matches: Matches = [
      { teams: [[RESERVE, EXTRA], [M1]], winner: 0 },
      { teams: [[RESERVE, EXTRA], [M2]], winner: 0 },
      { teams: [[M1], [M2]], winner: 0 },
    ];
    expect([...dayWinners(matches)].sort()).toEqual([RESERVE, EXTRA].sort());
  });

  it('CMP-22: sem nenhuma vitória (sem partidas ou só empates) → sem vencedor do dia', () => {
    expect(dayWinners([])).toEqual([]);
    expect(dayWinners([{ teams: [[M1], [M2]], winner: 'draw' }])).toEqual([]);
  });
});
