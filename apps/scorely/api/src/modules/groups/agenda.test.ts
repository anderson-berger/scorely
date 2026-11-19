import { findOverlap, nextOccurrenceStart, overlaps } from '@scorely/api/src/modules/groups/agenda';
import type { Schedule } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

const at = (startsAt: string, endsAt: string) => ({ startsAt, endsAt });
const SCHEDULE_ID = '11111111-aaaa-4aaa-8aaa-111111111111';
const schedule = (weekday: number, start: string, end: string): Schedule => ({
  id: SCHEDULE_ID,
  weekday,
  start,
  end,
  version: 1,
});

describe('agenda (GRP-70): sobreposição', () => {
  it('GRP-70: o fim é exclusivo → um jogo que começa quando o outro acaba não bate', () => {
    const a = at('2026-11-10T19:00:00.000Z', '2026-11-10T21:00:00.000Z');
    expect(overlaps(a, at('2026-11-10T21:00:00.000Z', '2026-11-10T22:00:00.000Z'))).toBe(false);
    expect(overlaps(at('2026-11-10T18:00:00.000Z', '2026-11-10T19:00:00.000Z'), a)).toBe(false);
  });

  it('GRP-70: um minuto de intersecção, o contido e o idêntico batem, nos dois sentidos', () => {
    const a = at('2026-11-10T19:00:00.000Z', '2026-11-10T21:00:00.000Z');
    const cases = [
      at('2026-11-10T20:59:00.000Z', '2026-11-10T22:00:00.000Z'),
      at('2026-11-10T18:00:00.000Z', '2026-11-10T19:01:00.000Z'),
      at('2026-11-10T19:30:00.000Z', '2026-11-10T20:00:00.000Z'),
      a,
    ];
    for (const b of cases) {
      expect(overlaps(a, b)).toBe(true);
      expect(overlaps(b, a)).toBe(true);
    }
  });

  it('GRP-70: findOverlap devolve o id do 1º que bate, e undefined sem batida', () => {
    const others = [
      { id: 'cedo', ...at('2026-11-10T10:00:00.000Z', '2026-11-10T11:00:00.000Z') },
      { id: 'bate-1', ...at('2026-11-10T20:00:00.000Z', '2026-11-10T22:00:00.000Z') },
      { id: 'bate-2', ...at('2026-11-10T19:00:00.000Z', '2026-11-10T20:30:00.000Z') },
    ];
    expect(findOverlap(at('2026-11-10T19:30:00.000Z', '2026-11-10T20:30:00.000Z'), others)).toBe('bate-1');
    expect(findOverlap(at('2026-11-10T12:00:00.000Z', '2026-11-10T13:00:00.000Z'), others)).toBeUndefined();
  });

  it('GRP-70: o próprio jogo não conta (candidate.gameId é ignorado)', () => {
    const others = [{ id: 'g1', ...at('2026-11-10T19:00:00.000Z', '2026-11-10T21:00:00.000Z') }];
    const candidate = at('2026-11-10T20:00:00.000Z', '2026-11-10T22:00:00.000Z');
    expect(findOverlap({ gameId: 'g1', ...candidate }, others)).toBeUndefined();
    expect(findOverlap({ gameId: 'g2', ...candidate }, others)).toBe('g1');
  });
});

describe('agenda (GRP-69): o jogo seguinte do horário', () => {
  it('GRP-69: é a ocorrência da semana seguinte à data, no fuso do grupo', () => {
    // 2026-11-06 é sexta; São Paulo é UTC-3.
    expect(nextOccurrenceStart(schedule(5, '19:00', '22:00'), 'America/Sao_Paulo', '2026-11-06')).toBe(
      '2026-11-13T22:00:00.000Z',
    );
  });

  it('GRP-69: a virada do horário de verão muda o instante UTC, não a hora local', () => {
    // Lisboa deixa o horário de verão em 25/10/2026: sábado 24/10 20:00 = 19:00Z, sábado 31/10 20:00 = 20:00Z.
    expect(nextOccurrenceStart(schedule(6, '20:00', '22:00'), 'Europe/Lisbon', '2026-10-24')).toBe(
      '2026-10-31T20:00:00.000Z',
    );
  });
});
