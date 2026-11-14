import { occurrenceOnDate, occurrencesBetween } from '@scorely/api/src/lib/zoned';
import { describe, expect, it } from 'vitest';

// Competição, etapa 2 (`.claude/work/competicao-2.md`, D4 e D10): as ocorrências semanais do grupo entre a ativação
// (`trialStartedAt`) e agora, no fuso do grupo. São a base dos jogos desde a ativação (CMP-11, 16).

const iso = (value: string | Date) => new Date(value).toISOString();
const dates = (list: { date: string }[]) => list.map((o) => o.date);

/** Vôlei de sexta 19h; São Paulo não tem horário de verão (UTC−3). */
const friday = (timeZone = 'America/Sao_Paulo', time = '19:00') => ({
  weekday: 5,
  time,
  timeZone,
  listOpensHoursBefore: 48,
});

describe('o jogo de uma data (CMP-11)', () => {
  it('CMP-11: data que não é o dia da semana do grupo → não é um jogo do grupo (undefined)', () => {
    expect(occurrenceOnDate(friday(), '2026-11-12')).toBeUndefined();
    expect(occurrenceOnDate(friday(), '2026-11-14')).toBeUndefined();
  });

  it('CMP-11: a sexta é um jogo do grupo, com o início, a abertura e o fim em UTC', () => {
    const occ = occurrenceOnDate(friday(), '2026-11-06');
    expect(occ?.date).toBe('2026-11-06');
    expect(iso(occ?.startsAt ?? '')).toBe('2026-11-06T22:00:00.000Z');
    expect(iso(occ?.opensAt ?? '')).toBe('2026-11-04T22:00:00.000Z');
    expect(iso(occ?.endsAt ?? '')).toBe('2026-11-07T01:00:00.000Z');
  });

  it('CMP-11: jogo às 23h em São Paulo começa no sábado em UTC, e continua sendo o jogo da sexta', () => {
    const occ = occurrenceOnDate(friday('America/Sao_Paulo', '23:00'), '2026-11-06');
    expect(iso(occ?.startsAt ?? '')).toBe('2026-11-07T02:00:00.000Z');
    expect(occurrenceOnDate(friday('America/Sao_Paulo', '23:00'), '2026-11-07')).toBeUndefined();
  });
});

describe('os jogos desde a ativação (CMP-11, CMP-16)', () => {
  it('CMP-16: as sextas entre a ativação e agora, da mais recente para a mais antiga', () => {
    const list = occurrencesBetween(
      friday(),
      new Date('2026-10-20T00:00:00.000Z'),
      new Date('2026-11-14T12:00:00.000Z'),
    );
    expect(dates(list)).toEqual(['2026-11-13', '2026-11-06', '2026-10-30', '2026-10-23']);
    expect(list.map((o) => iso(o.startsAt))).toEqual([
      '2026-11-13T22:00:00.000Z',
      '2026-11-06T22:00:00.000Z',
      '2026-10-30T22:00:00.000Z',
      '2026-10-23T22:00:00.000Z',
    ]);
  });

  it('CMP-11: o 1º jogo é o primeiro que começou a partir da ativação: começou antes dela, fica de fora', () => {
    const now = new Date('2026-11-14T12:00:00.000Z');
    // Ativada no exato início do jogo de 23/10: ele entra.
    expect(dates(occurrencesBetween(friday(), new Date('2026-10-23T22:00:00.000Z'), now)).at(-1)).toBe(
      '2026-10-23',
    );
    // Ativada 1 ms depois do início (jogo já em andamento): ele não entra.
    expect(dates(occurrencesBetween(friday(), new Date('2026-10-23T22:00:00.001Z'), now)).at(-1)).toBe(
      '2026-10-30',
    );
  });

  it('CMP-11: o jogo entra a partir do início dele: em andamento entra, 1 ms antes do início não', () => {
    const from = new Date('2026-11-01T00:00:00.000Z');
    expect(dates(occurrencesBetween(friday(), from, new Date('2026-11-13T22:00:00.000Z')))).toEqual([
      '2026-11-13',
      '2026-11-06',
    ]);
    expect(dates(occurrencesBetween(friday(), from, new Date('2026-11-13T23:30:00.000Z')))).toEqual([
      '2026-11-13',
      '2026-11-06',
    ]);
    expect(dates(occurrencesBetween(friday(), from, new Date('2026-11-13T21:59:59.999Z')))).toEqual([
      '2026-11-06',
    ]);
  });

  it('CMP-16: ativada agora, antes do 1º jogo → nenhum jogo', () => {
    const at = new Date('2026-11-10T12:00:00.000Z');
    expect(occurrencesBetween(friday(), at, at)).toEqual([]);
  });

  it('CMP-16: na virada do horário de verão (Nova York, 01/11/2026) as datas continuam as sextas, e o início acompanha o fuso', () => {
    const list = occurrencesBetween(
      friday('America/New_York'),
      new Date('2026-10-25T00:00:00.000Z'),
      new Date('2026-11-10T00:00:00.000Z'),
    );
    expect(dates(list)).toEqual(['2026-11-06', '2026-10-30']);
    // 19h EST (UTC−5) e 19h EDT (UTC−4).
    expect(list.map((o) => iso(o.startsAt))).toEqual([
      '2026-11-07T00:00:00.000Z',
      '2026-10-30T23:00:00.000Z',
    ]);
  });

  it('CMP-16: na entrada do horário de verão (Nova York, 08/03/2026) também', () => {
    const list = occurrencesBetween(
      friday('America/New_York'),
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-03-15T00:00:00.000Z'),
    );
    expect(dates(list)).toEqual(['2026-03-13', '2026-03-06']);
    expect(list.map((o) => iso(o.startsAt))).toEqual([
      '2026-03-13T23:00:00.000Z',
      '2026-03-07T00:00:00.000Z',
    ]);
  });

  it('CMP-16: cada ocorrência é a mesma do jogo daquela data', () => {
    const list = occurrencesBetween(
      friday(),
      new Date('2026-10-20T00:00:00.000Z'),
      new Date('2026-11-14T12:00:00.000Z'),
    );
    for (const occ of list) expect(occ).toEqual(occurrenceOnDate(friday(), occ.date));
  });
});
