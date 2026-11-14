import { highlightsOf, trophiesOf } from '@scorely/api/src/modules/competition/awards';
import type { StoredFinal, StoredFinalRow } from '@scorely/api/src/modules/competition/season.repository';
import { describe, expect, it } from 'vitest';

// Competição, etapa 6 (`.claude/work/competicao-6.md`, D2, D8): os troféus de uma temporada travada, puros (CMP-36).
// `trophiesOf(final)` → `{ userId, kind }[]` e `highlightsOf(final)` → `{ kind, ids }[]`, a partir do ranking final.

function row(id: string, position: number, extra: Partial<StoredFinalRow> = {}): StoredFinalRow {
  return {
    id,
    position,
    points: 0,
    attendance: 1,
    streak: 1,
    record: { wins: 0, draws: 0, losses: 0 },
    ...extra,
  };
}

const final = (rows: StoredFinalRow[], games = 3): StoredFinal => ({
  rows,
  games,
  savedAt: '2026-11-13T23:30:00.000Z',
});

const key = (t: { userId: string; kind: string }) => `${t.kind}:${t.userId}`;
const podiumKinds = new Set(['champion', 'second', 'third']);
const podiumOf = (f: StoredFinal) =>
  trophiesOf(f)
    .filter((t) => podiumKinds.has(t.kind))
    .map(key)
    .sort();
const highlightTrophies = (f: StoredFinal) =>
  trophiesOf(f)
    .filter((t) => !podiumKinds.has(t.kind))
    .map(key)
    .sort();
const idsOf = (f: StoredFinal, kind: 'attendance' | 'streak') =>
  [...(highlightsOf(f).find((h) => h.kind === kind)?.ids ?? [])].sort();

describe('o pódio (CMP-36)', () => {
  it('CMP-36: campeão (1º), vice (2º) e 3º; do 4º para baixo, nada', () => {
    const f = final([row('a', 1), row('b', 2), row('c', 3), row('d', 4), row('e', 5)]);
    expect(podiumOf(f)).toEqual(['champion:a', 'second:b', 'third:c'].sort());
  });

  it('CMP-36: empate no 1º: todos os empatados são campeões, e o próximo é o 3º (não há vice)', () => {
    const f = final([row('a', 1), row('b', 1), row('c', 3), row('d', 4)]);
    expect(podiumOf(f)).toEqual(['champion:a', 'champion:b', 'third:c'].sort());
  });

  it('CMP-36: empate no 2º: todos os empatados são vice, e o 4º fica sem troféu', () => {
    const f = final([row('a', 1), row('b', 2), row('c', 2), row('d', 4)]);
    expect(podiumOf(f)).toEqual(['champion:a', 'second:b', 'second:c'].sort());
  });

  it('CMP-36: empate no 3º: todos recebem o troféu do 3º (o pódio pode passar de 3 pessoas)', () => {
    const f = final([row('a', 1), row('b', 2), row('c', 3), row('d', 3), row('e', 5)]);
    expect(podiumOf(f)).toEqual(['champion:a', 'second:b', 'third:c', 'third:d'].sort());
  });
});

describe('os destaques (CMP-36)', () => {
  it('CMP-36: mais presente e maior sequência vão para quem tem o máximo', () => {
    const f = final([
      row('a', 1, { attendance: 3, streak: 2 }),
      row('b', 2, { attendance: 2, streak: 2 }),
      row('c', 3, { attendance: 1, streak: 1 }),
    ]);
    // A sequência empata entre a e b: os dois levam.
    expect(idsOf(f, 'attendance')).toEqual(['a']);
    expect(idsOf(f, 'streak')).toEqual(['a', 'b']);
    expect(highlightTrophies(f)).toEqual(['attendance:a', 'streak:a', 'streak:b'].sort());
  });

  it('CMP-36: empate no destaque: todos os empatados recebem', () => {
    const f = final([
      row('a', 1, { attendance: 2, streak: 2 }),
      row('b', 2, { attendance: 2, streak: 1 }),
      row('c', 3, { attendance: 2, streak: 1 }),
    ]);
    expect(idsOf(f, 'attendance')).toEqual(['a', 'b', 'c']);
    expect(highlightTrophies(f)).toEqual(['attendance:a', 'attendance:b', 'attendance:c', 'streak:a'].sort());
  });

  it('CMP-36: o destaque precisa de pelo menos 1 presença', () => {
    const f = final(
      [row('a', 1, { attendance: 0, streak: 0 }), row('b', 1, { attendance: 0, streak: 0 })],
      1,
    );
    expect(idsOf(f, 'attendance')).toEqual([]);
    expect(idsOf(f, 'streak')).toEqual([]);
    expect(highlightTrophies(f)).toEqual([]);
  });

  it('CMP-36: um troféu de pódio e os dois destaques podem ir para a mesma pessoa', () => {
    const f = final([row('a', 1, { attendance: 4, streak: 4 }), row('b', 2, { attendance: 3, streak: 3 })]);
    expect(
      trophiesOf(f)
        .filter((t) => t.userId === 'a')
        .map((t) => t.kind)
        .sort(),
    ).toEqual(['attendance', 'champion', 'streak']);
  });
});

describe('a temporada sem jogo (CMP-36)', () => {
  it('CMP-36: temporada sem nenhum jogo fechado não entrega troféus', () => {
    const f = final(
      [row('a', 1, { attendance: 0, streak: 0 }), row('b', 1, { attendance: 0, streak: 0 })],
      0,
    );
    expect(trophiesOf(f)).toEqual([]);
    expect(highlightsOf(f).flatMap((h) => h.ids)).toEqual([]);
  });

  it('CMP-36: ranking final sem linhas não entrega troféus', () => {
    expect(trophiesOf(final([], 0))).toEqual([]);
  });
});
