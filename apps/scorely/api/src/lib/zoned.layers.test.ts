import { currentOccurrence, layerOpensAt } from '@scorely/api/src/lib/zoned';
import { describe, expect, it } from 'vitest';

// Plano 007 (E2), tarefa 3: abertura de cada camada da lista (casos 5 e 6, parte de datas).

const iso = (value: string | Date) => new Date(value).toISOString();

/** Quinta 2026-11-05 10:00 em São Paulo. */
const THURSDAY_10H = new Date('2026-11-05T13:00:00.000Z');
/** Sexta 2026-11-06 19:00 em São Paulo. */
const FRIDAY_19H = '2026-11-06T22:00:00.000Z';

describe('zoned: abertura das camadas (plano 007, casos 5 e 6)', () => {
  it('caso 5: reservas 24 h antes do jogo de sexta 19h → quinta 19h (em UTC)', () => {
    expect(iso(layerOpensAt(FRIDAY_19H, 24))).toBe('2026-11-05T22:00:00.000Z');
    expect(layerOpensAt(FRIDAY_19H, 24)).toMatch(/Z$/);
  });

  it('caso 6: convidados 6 h antes → sexta 13h; 0 h → no início do jogo', () => {
    expect(iso(layerOpensAt(FRIDAY_19H, 6))).toBe('2026-11-06T16:00:00.000Z');
    expect(iso(layerOpensAt(FRIDAY_19H, 0))).toBe(FRIDAY_19H);
  });

  it('caso 6: a camada dos membros bate com o opensAt da ocorrência', () => {
    const schedule = { weekday: 5, time: '19:00', timeZone: 'America/Sao_Paulo', listOpensHoursBefore: 48 };
    const occ = currentOccurrence(schedule, THURSDAY_10H);
    expect(iso(layerOpensAt(occ.startsAt, 48))).toBe(iso(occ.opensAt));
  });
});
