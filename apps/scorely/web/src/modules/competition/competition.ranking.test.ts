import { type PersonGame, PublicUserIdSchema, type RankingRow } from '@scorely/contracts';
import { i18n } from '@scorely/web/src/i18n/index';
import { personGameParts, positionText, rankingLine } from '@scorely/web/src/modules/competition/competition';
import { describe, expect, it } from 'vitest';

// Competição, etapa 4 (`.claude/work/competicao-4.md`, D7): as funções puras do ranking na aba Competição (CMP-28)
// e do histórico da pessoa (CMP-27). Os textos são conferidos em pt-BR.

interface Text {
  key: string;
  params?: Record<string, string | number>;
}

function render(text: string | Text): string {
  if (typeof text === 'string') return text;
  i18n.global.locale.value = 'pt-BR';
  return i18n.global.t(text.key, text.params ?? {});
}
/** Aceita um texto pronto, um `Text` ou uma lista de partes ("a · b"). */
const line = (value: string | Text | (string | Text)[]) =>
  Array.isArray(value) ? value.map(render).join(' · ') : render(value);

const ME = PublicUserIdSchema.parse('BBBB2222');

function row(extra: Partial<RankingRow> = {}): RankingRow {
  return {
    userId: ME,
    name: 'Ana',
    position: 1,
    points: 20,
    attendance: 12,
    streak: 5,
    record: { wins: 6, draws: 0, losses: 6 },
    ...extra,
  };
}

function personGame(extra: Partial<PersonGame> = {}): PersonGame {
  return {
    date: '2026-11-13',
    startsAt: '2026-11-13T22:00:00.000Z',
    friendly: false,
    cancelled: false,
    member: true,
    ...extra,
  };
}

describe('as linhas do ranking (CMP-28)', () => {
  it('CMP-28: a posição aparece como "1º"', () => {
    expect(line(positionText(row({ position: 1 })))).toBe('1º');
    expect(line(positionText(row({ position: 4 })))).toBe('4º');
  });

  it('CMP-28: no empate, a posição dividida aparece igual nas duas linhas ("2º" duas vezes)', () => {
    expect(line(positionText(row({ position: 2 })))).toBe('2º');
    expect(line(positionText(row({ userId: PublicUserIdSchema.parse('CCCC3333'), position: 2 })))).toBe('2º');
  });

  it('CMP-28: embaixo do nome, "12 presenças · sequência 5"', () => {
    expect(line(rankingLine(row()))).toBe('12 presenças · sequência 5');
  });
});

describe('o histórico da pessoa (CMP-27)', () => {
  it('CMP-27: veio e estava num time: "veio · Time 2"', () => {
    const g = personGame({ event: 'win', points: 3, attendance: 'present', team: 1 });
    expect(line(personGameParts(g))).toBe('veio · Time 2');
  });

  it('CMP-27: faltou: "faltou"', () => {
    const g = personGame({ event: 'noShow', points: -2, attendance: 'absent' });
    expect(line(personGameParts(g))).toBe('faltou');
  });

  it('CMP-27: com a unidade por partida, as partidas da pessoa: "3 V · 1 E · 1 D"', () => {
    const g = personGame({
      event: 'played',
      points: 11,
      attendance: 'present',
      record: { wins: 3, draws: 1, losses: 1 },
    });
    expect(line(personGameParts(g))).toContain('3 V · 1 E · 1 D');
  });
});
