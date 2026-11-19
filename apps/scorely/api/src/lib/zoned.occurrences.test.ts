import { occurrenceOn, occurrenceOnDate } from '@scorely/api/src/lib/zoned';
import { describe, expect, it } from 'vitest';

// O jogo de um horário numa data (GRP-10, 12; ADR 0015, `.claude/work/horarios-jogo.md`). A lista dos jogos desde a
// ativação da competição saiu daqui: ela vem do lookup dos jogos do grupo (competicao.md, seção 3).

const iso = (value: string | Date) => new Date(value).toISOString();

/** Vôlei de sexta 19:00–22:00; São Paulo não tem horário de verão (UTC−3). */
const friday = (timeZone = 'America/Sao_Paulo', start = '19:00', end = '22:00') => ({
  weekday: 5,
  start,
  end,
  timeZone,
  listOpensHoursBefore: 48,
});

describe('o jogo de uma data (GRP-10)', () => {
  it('GRP-10: data que não é o dia da semana do horário → não é um jogo dele (undefined)', () => {
    expect(occurrenceOnDate(friday(), '2026-11-12')).toBeUndefined();
    expect(occurrenceOnDate(friday(), '2026-11-14')).toBeUndefined();
  });

  it('GRP-10: a sexta é um jogo do horário, com o início, a abertura e o fim em UTC', () => {
    const occ = occurrenceOnDate(friday(), '2026-11-06');
    expect(occ?.date).toBe('2026-11-06');
    expect(iso(occ?.startsAt ?? '')).toBe('2026-11-06T22:00:00.000Z');
    expect(iso(occ?.opensAt ?? '')).toBe('2026-11-04T22:00:00.000Z');
    expect(iso(occ?.endsAt ?? '')).toBe('2026-11-07T01:00:00.000Z');
  });

  it('GRP-10: o occurrenceOnDate é o occurrenceOn quando o dia bate', () => {
    expect(occurrenceOnDate(friday(), '2026-11-06')).toEqual(occurrenceOn(friday(), '2026-11-06'));
  });

  it('GRP-10: jogo às 23h em São Paulo começa no sábado em UTC, e continua sendo o jogo da sexta', () => {
    const late = friday('America/Sao_Paulo', '23:00', '23:59');
    const occ = occurrenceOnDate(late, '2026-11-06');
    expect(iso(occ?.startsAt ?? '')).toBe('2026-11-07T02:00:00.000Z');
    expect(iso(occ?.endsAt ?? '')).toBe('2026-11-07T02:59:00.000Z');
    expect(occurrenceOnDate(late, '2026-11-07')).toBeUndefined();
  });

  it('GRP-12: na virada do horário de verão (Nova York, 01/11/2026), o início e o fim acompanham o fuso', () => {
    const ny = friday('America/New_York');
    // 19h EDT (UTC−4) e 19h EST (UTC−5).
    expect(iso(occurrenceOn(ny, '2026-10-30').startsAt)).toBe('2026-10-30T23:00:00.000Z');
    expect(iso(occurrenceOn(ny, '2026-10-30').endsAt)).toBe('2026-10-31T02:00:00.000Z');
    expect(iso(occurrenceOn(ny, '2026-11-06').startsAt)).toBe('2026-11-07T00:00:00.000Z');
    expect(iso(occurrenceOn(ny, '2026-11-06').endsAt)).toBe('2026-11-07T03:00:00.000Z');
  });
});
