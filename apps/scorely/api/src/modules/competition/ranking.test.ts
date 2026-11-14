import { memberStats, rankingRows, type ScoredGame } from '@scorely/api/src/modules/competition/ranking';
import type { MemberScore } from '@scorely/api/src/modules/competition/scoring';
import type { AttendanceMark } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Competição, etapa 4 (`.claude/work/competicao-4.md`, D3): o ranking e as contagens, puros (CMP-24–26).
// `ScoredGame = { startsAt, friendly, cancelled, members, attendance, scores }` (o `scores` sai do `gamePoints`).
// `memberStats(games, id)`: a soma sem o mínimo, a presença e a sequência só nos jogos em que é membro, sem amistoso
// nem cancelado. `rankingRows(games, people, tiebreak)`: o mínimo 0, a ordem, o desempate e a posição dividida.
// Os jogos vão na ordem em que aconteceram (do mais antigo para o mais recente), como o `listByGroup` devolve.

const P1 = 'aaaa0001-0000-4000-8000-000000000001';
const P2 = 'aaaa0002-0000-4000-8000-000000000002';
const P3 = 'aaaa0003-0000-4000-8000-000000000003';
const P4 = 'aaaa0004-0000-4000-8000-000000000004';

const win = (points: number): MemberScore => ({ event: 'win', points });
const loss = (points: number): MemberScore => ({ event: 'loss', points });
const draw = (points: number): MemberScore => ({ event: 'draw', points });
const noShow = (points: number): MemberScore => ({ event: 'noShow', points });
const notConfirmed = (points: number): MemberScore => ({ event: 'notConfirmed', points });

function game(
  day: number,
  members: string[],
  attendance: Record<string, AttendanceMark>,
  scores: Record<string, MemberScore>,
  extra: Partial<ScoredGame> = {},
): ScoredGame {
  return {
    startsAt: new Date(Date.UTC(2026, 9, day, 22)).toISOString(),
    friendly: false,
    cancelled: false,
    members,
    attendance,
    scores,
    ...extra,
  };
}

const byId = <T extends { id: string }>(rows: readonly T[]) => Object.fromEntries(rows.map((r) => [r.id, r]));

describe('a soma dos pontos (CMP-24)', () => {
  it('CMP-24: memberStats soma os pontos de todos os jogos, sem o mínimo 0', () => {
    const games = [
      game(2, [P1], { [P1]: 'present' }, { [P1]: win(3) }),
      game(9, [P1], { [P1]: 'absent' }, { [P1]: noShow(-2) }),
      game(16, [P1], { [P1]: 'absent' }, { [P1]: noShow(-2) }),
    ];
    expect(memberStats(games, P1).points).toBe(-1);
  });

  it('CMP-24: no ranking, o total abaixo de 0 vira 0', () => {
    const games = [
      game(2, [P1, P2], { [P1]: 'absent', [P2]: 'present' }, { [P1]: noShow(-2), [P2]: win(3) }),
    ];
    const rows = byId(rankingRows(games, [P1, P2], []));
    expect(rows[P1]?.points).toBe(0);
    expect(rows[P2]?.points).toBe(3);
  });

  it('CMP-24: o mínimo 0 vale para o total, e não jogo a jogo (−2 e +3 dão 1)', () => {
    const games = [
      game(2, [P1], { [P1]: 'absent' }, { [P1]: noShow(-2) }),
      game(9, [P1], { [P1]: 'present' }, { [P1]: win(3) }),
    ];
    expect(byId(rankingRows(games, [P1], []))[P1]?.points).toBe(1);
  });

  it('CMP-24: as vitórias, empates e derrotas somam os do dia e os das partidas', () => {
    const games = [
      game(2, [P1], { [P1]: 'present' }, { [P1]: win(3) }),
      game(9, [P1], { [P1]: 'present' }, { [P1]: loss(1) }),
      game(16, [P1], { [P1]: 'present' }, { [P1]: draw(2) }),
      game(
        23,
        [P1],
        { [P1]: 'present' },
        { [P1]: { event: 'played', points: 9, record: { wins: 2, draws: 1, losses: 3 } } },
      ),
    ];
    expect(memberStats(games, P1).record).toEqual({ wins: 3, draws: 2, losses: 4 });
  });
});

describe('quem aparece (CMP-25)', () => {
  it('CMP-25: aparece uma linha por pessoa de `people`, também com 0 e sem nenhum jogo', () => {
    const games = [game(2, [P1, P3], { [P1]: 'present' }, { [P1]: win(3), [P3]: notConfirmed(0) })];
    const rows = rankingRows(games, [P1, P2], []);
    expect(rows.map((r) => r.id).sort()).toEqual([P1, P2].sort());
    expect(byId(rows)[P2]).toMatchObject({ points: 0, attendance: 0, streak: 0 });
  });

  it('CMP-25: sem nenhum jogo fechado, todos aparecem com 0, na mesma posição', () => {
    const rows = rankingRows([], [P1, P2, P3], ['attendance', 'streak']);
    expect(rows).toHaveLength(3);
    for (const row of rows)
      expect(row).toMatchObject({
        position: 1,
        points: 0,
        attendance: 0,
        streak: 0,
        record: { wins: 0, draws: 0, losses: 0 },
      });
  });

  it('CMP-25: a presença só conta nos jogos em que a pessoa era membro no fechamento', () => {
    const games = [
      // Ainda reserva: veio, mas não era membro.
      game(2, [P1], { [P1]: 'present', [P2]: 'present' }, { [P1]: win(3) }),
      game(9, [P1, P2], { [P1]: 'present', [P2]: 'present' }, { [P1]: win(3), [P2]: loss(1) }),
    ];
    expect(memberStats(games, P2)).toMatchObject({ points: 1, attendance: 1, streak: 1 });
  });
});

describe('presença e sequência (CMP-26)', () => {
  it('CMP-26: mais presente = jogos com "veio" na chamada; faltou e não confirmou não contam', () => {
    const games = [
      game(2, [P1], { [P1]: 'present' }, { [P1]: win(3) }),
      game(9, [P1], { [P1]: 'absent' }, { [P1]: noShow(-2) }),
      game(16, [P1], {}, { [P1]: notConfirmed(0) }),
      game(23, [P1], { [P1]: 'present' }, { [P1]: loss(1) }),
    ];
    expect(memberStats(games, P1).attendance).toBe(2);
  });

  it('CMP-26: a maior sequência de presenças seguidas, na ordem dos jogos; a falta quebra', () => {
    const games = [
      game(2, [P1], { [P1]: 'present' }, { [P1]: win(3) }),
      game(9, [P1], { [P1]: 'present' }, { [P1]: win(3) }),
      game(16, [P1], { [P1]: 'absent' }, { [P1]: noShow(-2) }),
      game(23, [P1], { [P1]: 'present' }, { [P1]: win(3) }),
      game(30, [P1], { [P1]: 'present' }, { [P1]: win(3) }),
      game(31, [P1], { [P1]: 'present' }, { [P1]: win(3) }),
    ];
    expect(memberStats(games, P1)).toMatchObject({ attendance: 5, streak: 3 });
  });

  it('CMP-26: não estar na lista (não confirmou) quebra a sequência', () => {
    const games = [
      game(2, [P1], { [P1]: 'present' }, { [P1]: win(3) }),
      game(9, [P1], {}, { [P1]: notConfirmed(0) }),
      game(16, [P1], { [P1]: 'present' }, { [P1]: win(3) }),
    ];
    expect(memberStats(games, P1)).toMatchObject({ attendance: 2, streak: 1 });
  });

  it('CMP-26: o amistoso não soma presença nem sequência, e não quebra a sequência', () => {
    const games = [
      game(2, [P1], { [P1]: 'present' }, { [P1]: win(3) }),
      game(9, [P1], { [P1]: 'present' }, { [P1]: win(0) }, { friendly: true }),
      game(16, [P1], { [P1]: 'absent' }, { [P1]: noShow(0) }, { friendly: true }),
      game(23, [P1], { [P1]: 'present' }, { [P1]: win(3) }),
    ];
    expect(memberStats(games, P1)).toMatchObject({ points: 6, attendance: 2, streak: 2 });
  });

  it('CMP-26: o cancelado não soma presença nem sequência, e não quebra a sequência', () => {
    const games = [
      game(2, [P1], { [P1]: 'present' }, { [P1]: win(3) }),
      game(9, [P1], {}, { [P1]: { event: 'cancelled', points: 1 } }, { cancelled: true }),
      game(16, [P1], { [P1]: 'present' }, { [P1]: win(3) }),
    ];
    expect(memberStats(games, P1)).toMatchObject({ points: 7, attendance: 2, streak: 2 });
  });

  it('CMP-26: o jogo em que a pessoa não era membro não soma nem quebra a sequência', () => {
    const games = [
      game(2, [P1, P2], { [P2]: 'present' }, { [P1]: notConfirmed(0), [P2]: win(3) }),
      game(9, [P1], { [P1]: 'present', [P2]: 'absent' }, { [P1]: win(3) }),
      game(16, [P1, P2], { [P1]: 'present', [P2]: 'present' }, { [P1]: win(3), [P2]: win(3) }),
    ];
    expect(memberStats(games, P2)).toMatchObject({ attendance: 2, streak: 2 });
  });
});

describe('a ordem, o desempate e a posição dividida (CMP-26)', () => {
  /**
   * P1, P2 e P3 com 6 pontos, P4 com 3.
   * P1: veio, faltou, veio, faltou, veio → 3 presenças, sequência 1.
   * P2: faltou, veio, veio, não confirmou, não confirmou → 2 presenças, sequência 2.
   * P3: veio, faltou, veio, não confirmou, não confirmou → 2 presenças, sequência 1.
   */
  const ALL = [P1, P2, P3, P4];
  const games = [
    game(
      2,
      ALL,
      { [P1]: 'present', [P2]: 'absent', [P3]: 'present', [P4]: 'present' },
      { [P1]: win(2), [P2]: noShow(0), [P3]: win(3), [P4]: win(3) },
    ),
    game(
      9,
      ALL,
      { [P1]: 'absent', [P2]: 'present', [P3]: 'absent', [P4]: 'absent' },
      { [P1]: noShow(0), [P2]: win(3), [P3]: noShow(0), [P4]: noShow(0) },
    ),
    game(
      16,
      ALL,
      { [P1]: 'present', [P2]: 'present', [P3]: 'present' },
      { [P1]: win(2), [P2]: win(3), [P3]: win(3), [P4]: notConfirmed(0) },
    ),
    game(
      23,
      ALL,
      { [P1]: 'absent' },
      { [P1]: noShow(0), [P2]: notConfirmed(0), [P3]: notConfirmed(0), [P4]: notConfirmed(0) },
    ),
    game(
      30,
      ALL,
      { [P1]: 'present' },
      { [P1]: win(2), [P2]: notConfirmed(0), [P3]: notConfirmed(0), [P4]: notConfirmed(0) },
    ),
  ];
  const people = [P4, P3, P2, P1];

  it('CMP-26: as contagens do cenário', () => {
    const rows = byId(rankingRows(games, people, []));
    expect(rows[P1]).toMatchObject({ points: 6, attendance: 3, streak: 1 });
    expect(rows[P2]).toMatchObject({ points: 6, attendance: 2, streak: 2 });
    expect(rows[P3]).toMatchObject({ points: 6, attendance: 2, streak: 1 });
    expect(rows[P4]).toMatchObject({ points: 3, attendance: 1, streak: 1 });
  });

  it('CMP-26: mais pontos primeiro', () => {
    const rows = rankingRows(games, people, ['attendance', 'streak']);
    expect(rows.at(-1)?.id).toBe(P4);
    expect(rows.slice(0, 3).every((r) => r.points === 6)).toBe(true);
  });

  it('CMP-26: desempate "mais presente → maior sequência": P1 (3 presenças), P2 (sequência 2), P3', () => {
    const rows = rankingRows(games, people, ['attendance', 'streak']);
    expect(rows.map((r) => [r.id, r.position])).toEqual([
      [P1, 1],
      [P2, 2],
      [P3, 3],
      [P4, 4],
    ]);
  });

  it('CMP-26: a ordem dos critérios é a do grupo: "maior sequência → mais presente" põe P2, P1, P3', () => {
    const rows = rankingRows(games, people, ['streak', 'attendance']);
    expect(rows.map((r) => [r.id, r.position])).toEqual([
      [P2, 1],
      [P1, 2],
      [P3, 3],
      [P4, 4],
    ]);
  });

  it('CMP-26: só "maior sequência": P2 em 1º, P1 e P3 dividem o 2º, P4 em 4º', () => {
    const rows = byId(rankingRows(games, people, ['streak']));
    expect([P1, P2, P3, P4].map((id) => rows[id]?.position)).toEqual([2, 1, 2, 4]);
  });

  it('CMP-26: sem critérios, os empatados dividem a posição e a próxima pula (1º, 1º, 1º, 4º)', () => {
    const rows = byId(rankingRows(games, people, []));
    expect([P1, P2, P3, P4].map((id) => rows[id]?.position)).toEqual([1, 1, 1, 4]);
  });

  it('CMP-26: empate que sobra depois de todos os critérios divide a posição (1º, 2º, 2º, 4º)', () => {
    const tied = [
      game(
        2,
        [P1, P2, P3, P4],
        { [P1]: 'present', [P2]: 'present', [P3]: 'present', [P4]: 'present' },
        { [P1]: win(5), [P2]: win(3), [P3]: win(3), [P4]: loss(1) },
      ),
    ];
    const rows = rankingRows(tied, people, ['attendance', 'streak']);
    expect(rows[0]).toMatchObject({ id: P1, position: 1 });
    expect(
      rows
        .slice(1, 3)
        .map((r) => r.id)
        .sort(),
    ).toEqual([P2, P3].sort());
    expect(rows.slice(1, 3).map((r) => r.position)).toEqual([2, 2]);
    expect(rows[3]).toMatchObject({ id: P4, position: 4 });
  });
});
