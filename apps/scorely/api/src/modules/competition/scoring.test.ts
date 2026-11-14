import { gamePoints } from '@scorely/api/src/modules/competition/scoring';
import type { CompetitionRules } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Competição, etapa 2 (`.claude/work/competicao-2.md`, D7 e D10): os pontos do jogo, puros (CMP-14).
// `gamePoints(input, rules)` devolve, só para os membros de `input.members`, o evento e os pontos.

/** Valores diferentes entre si, para cada acontecimento ser reconhecível pelo ponto. */
const RULES: CompetitionRules = {
  points: { win: 5, draw: 2, loss: 1, notConfirmed: -1, noShow: -3, cancelled: 4 },
  unit: 'day',
  tiebreak: [],
};

// Membros
const M_WIN = 'aaaa0001-0000-4000-8000-000000000001';
const M_LOSS = 'aaaa0002-0000-4000-8000-000000000002';
const M_OUT = 'aaaa0003-0000-4000-8000-000000000003'; // veio, fora dos times
const M_NOSHOW = 'aaaa0004-0000-4000-8000-000000000004'; // dentro e faltou
const M_QUEUE_ABSENT = 'aaaa0005-0000-4000-8000-000000000005'; // fila e faltou
const M_QUEUE_PLAYED = 'aaaa0006-0000-4000-8000-000000000006'; // fila, veio e jogou no time vencedor
const M_NOT_CONFIRMED = 'aaaa0007-0000-4000-8000-000000000007'; // fora da lista
// Não membros
const RESERVE = 'bbbb0001-0000-4000-8000-000000000001';
const GUEST = 'bbbb0002-0000-4000-8000-000000000002';
const EXTRA = 'cccc0001-0000-4000-8000-000000000001'; // avulso: só nos times

const MEMBERS = [M_WIN, M_LOSS, M_OUT, M_NOSHOW, M_QUEUE_ABSENT, M_QUEUE_PLAYED, M_NOT_CONFIRMED];

const LIST = [
  { id: M_WIN, inside: true },
  { id: M_LOSS, inside: true },
  { id: RESERVE, inside: true },
  { id: GUEST, inside: true },
  { id: M_OUT, inside: true },
  { id: M_NOSHOW, inside: true },
  { id: M_QUEUE_ABSENT, inside: false },
  { id: M_QUEUE_PLAYED, inside: false },
];

const ATTENDANCE = {
  [M_WIN]: 'present',
  [M_LOSS]: 'present',
  [RESERVE]: 'present',
  [GUEST]: 'present',
  [M_OUT]: 'present',
  [M_NOSHOW]: 'absent',
  [M_QUEUE_ABSENT]: 'absent',
  [M_QUEUE_PLAYED]: 'present',
} as const;

const TEAMS = [
  [M_WIN, RESERVE, M_QUEUE_PLAYED, EXTRA],
  [M_LOSS, GUEST],
];

function input(extra: Partial<Parameters<typeof gamePoints>[0]> = {}): Parameters<typeof gamePoints>[0] {
  return {
    cancelled: false,
    friendly: false,
    members: MEMBERS,
    list: LIST,
    attendance: { ...ATTENDANCE },
    teams: TEAMS,
    winner: 0,
    unit: 'day',
    ...extra,
  };
}

describe('pontos do jogo (CMP-14)', () => {
  it('CMP-14: com um time vencedor, cada situação do membro dá o seu ponto', () => {
    expect(gamePoints(input(), RULES)).toEqual({
      [M_WIN]: { event: 'win', points: 5 },
      [M_LOSS]: { event: 'loss', points: 1 },
      [M_OUT]: { event: 'loss', points: 1 },
      [M_NOSHOW]: { event: 'noShow', points: -3 },
      [M_QUEUE_ABSENT]: { event: 'absentQueue', points: 0 },
      [M_QUEUE_PLAYED]: { event: 'win', points: 5 },
      [M_NOT_CONFIRMED]: { event: 'notConfirmed', points: -1 },
    });
  });

  it('CMP-14: o vencedor é o índice do time: Time 2 vence → quem estava no Time 1 perde', () => {
    const res = gamePoints(input({ winner: 1 }), RULES);
    expect(res[M_LOSS]).toEqual({ event: 'win', points: 5 });
    expect(res[M_WIN]).toEqual({ event: 'loss', points: 1 });
    expect(res[M_QUEUE_PLAYED]).toEqual({ event: 'loss', points: 1 });
    expect(res[M_OUT]).toEqual({ event: 'loss', points: 1 });
  });

  it('CMP-14: dia empatado → todos que vieram ficam com o empate, dentro ou fora dos times', () => {
    const res = gamePoints(input({ winner: 'draw' }), RULES);
    for (const id of [M_WIN, M_LOSS, M_OUT, M_QUEUE_PLAYED])
      expect(res[id]).toEqual({ event: 'draw', points: 2 });
    expect(res[M_NOSHOW]).toEqual({ event: 'noShow', points: -3 });
    expect(res[M_QUEUE_ABSENT]).toEqual({ event: 'absentQueue', points: 0 });
    expect(res[M_NOT_CONFIRMED]).toEqual({ event: 'notConfirmed', points: -1 });
  });

  it('CMP-14: sem times publicados (e sem vencedor) → quem veio fica sem resultado, com 0', () => {
    const res = gamePoints(input({ teams: [], winner: undefined }), RULES);
    for (const id of [M_WIN, M_LOSS, M_OUT, M_QUEUE_PLAYED])
      expect(res[id]).toEqual({ event: 'noResult', points: 0 });
    expect(res[M_NOSHOW]).toEqual({ event: 'noShow', points: -3 });
    expect(res[M_NOT_CONFIRMED]).toEqual({ event: 'notConfirmed', points: -1 });
  });

  it('CMP-14: com times e sem vencedor ("sem winner = sem resultado") → quem veio fica com 0', () => {
    const res = gamePoints(input({ winner: undefined }), RULES);
    for (const id of [M_WIN, M_LOSS, M_OUT, M_QUEUE_PLAYED])
      expect(res[id]).toEqual({ event: 'noResult', points: 0 });
  });

  it('CMP-14: unidade por partida → o fechamento é só a chamada: quem veio fica sem resultado, e a falta conta', () => {
    const res = gamePoints(input({ unit: 'match', winner: undefined }), RULES);
    for (const id of [M_WIN, M_LOSS, M_OUT, M_QUEUE_PLAYED])
      expect(res[id]).toEqual({ event: 'noResult', points: 0 });
    expect(res[M_NOSHOW]).toEqual({ event: 'noShow', points: -3 });
    expect(res[M_QUEUE_ABSENT]).toEqual({ event: 'absentQueue', points: 0 });
    expect(res[M_NOT_CONFIRMED]).toEqual({ event: 'notConfirmed', points: -1 });
  });

  it('CMP-14: jogo cancelado → quem estava dentro recebe o ponto de cancelado; fila e quem não confirmou, 0', () => {
    const res = gamePoints(input({ cancelled: true, attendance: {}, winner: undefined }), RULES);
    for (const id of [M_WIN, M_LOSS, M_OUT, M_NOSHOW])
      expect(res[id]).toEqual({ event: 'cancelled', points: 4 });
    expect(res[M_QUEUE_ABSENT]?.points).toBe(0);
    expect(res[M_QUEUE_PLAYED]?.points).toBe(0);
    expect(res[M_NOT_CONFIRMED]?.points).toBe(0);
  });

  it('CMP-14: só os membros da lista guardada pontuam: reserva, convidado e avulso ficam de fora', () => {
    const res = gamePoints(input(), RULES);
    expect(Object.keys(res).sort()).toEqual([...MEMBERS].sort());
    for (const id of [RESERVE, GUEST, EXTRA]) expect(res[id]).toBeUndefined();
  });

  it('CMP-14: quem é membro é o que vem em `members`: a mesma pessoa, fora dela, não pontua', () => {
    const res = gamePoints(input({ members: [M_WIN, RESERVE] }), RULES);
    expect(Object.keys(res).sort()).toEqual([M_WIN, RESERVE].sort());
    expect(res[RESERVE]).toEqual({ event: 'win', points: 5 });
  });

  it('CMP-14: o jogo mostra o valor como ele é (negativo não vira 0 no jogo)', () => {
    expect(gamePoints(input(), RULES)[M_NOSHOW]?.points).toBe(-3);
  });

  it('CMP-14: os pontos saem do regulamento recebido (a cópia do jogo)', () => {
    const other: CompetitionRules = {
      ...RULES,
      points: { win: 10, draw: 0, loss: -1, notConfirmed: 0, noShow: -10, cancelled: 0 },
    };
    const res = gamePoints(input(), other);
    expect(res[M_WIN]).toEqual({ event: 'win', points: 10 });
    expect(res[M_LOSS]).toEqual({ event: 'loss', points: -1 });
    expect(res[M_NOSHOW]).toEqual({ event: 'noShow', points: -10 });
  });
});

describe('amistoso (CMP-15)', () => {
  it('CMP-15: amistoso → os eventos continuam, com 0 ponto para todos', () => {
    const res = gamePoints(input({ friendly: true }), RULES);
    expect(res).toEqual({
      [M_WIN]: { event: 'win', points: 0 },
      [M_LOSS]: { event: 'loss', points: 0 },
      [M_OUT]: { event: 'loss', points: 0 },
      [M_NOSHOW]: { event: 'noShow', points: 0 },
      [M_QUEUE_ABSENT]: { event: 'absentQueue', points: 0 },
      [M_QUEUE_PLAYED]: { event: 'win', points: 0 },
      [M_NOT_CONFIRMED]: { event: 'notConfirmed', points: 0 },
    });
  });
});
