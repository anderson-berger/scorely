import { activeSchedules, scheduleText } from '@scorely/web/src/modules/groups/schedules';
import { describe, expect, it } from 'vitest';

const s = (weekday: number, start: string, extra: { archivedAt?: string } = {}) => ({
  weekday,
  start,
  end: '22:00',
  ...extra,
});

describe('horários do grupo (GRP-64)', () => {
  it('GRP-64: o texto do horário leva o dia traduzido, o início e o fim', () => {
    expect(scheduleText({ start: '19:00', end: '21:00' }, 'Ter')).toBe('Ter 19:00–21:00');
  });

  it('GRP-64, 67: só os ativos, por dia e início; o arquivado fica de fora', () => {
    const list = [
      s(6, '09:00'),
      s(2, '20:00'),
      s(2, '19:00'),
      s(4, '19:00', { archivedAt: '2026-11-01T00:00:00.000Z' }),
    ];
    expect(activeSchedules(list).map((x) => [x.weekday, x.start])).toEqual([
      [2, '19:00'],
      [2, '20:00'],
      [6, '09:00'],
    ]);
  });
});
