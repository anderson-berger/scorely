import { describe, expect, it } from 'vitest';
import { currentOccurrence, GAME_DURATION_HOURS, localDate, timeStatus, zonedToUtc } from './zoned';

/** Normaliza o ISO (com ou sem milissegundos) para comparar instantes. */
const iso = (value: string | Date) => new Date(value).toISOString();
const HOUR = 60 * 60 * 1000;

/** Vôlei de sexta 19h em São Paulo (UTC−3, sem horário de verão). */
const friday = (listOpensHoursBefore: number, timeZone = 'America/Sao_Paulo') => ({
  weekday: 5,
  time: '19:00',
  timeZone,
  listOpensHoursBefore,
});

/** Quinta 2026-11-05 10:00 em São Paulo. */
const THURSDAY_10H = new Date('2026-11-05T13:00:00.000Z');
/** Sexta 2026-11-06 20:00 em São Paulo. */
const FRIDAY_20H = new Date('2026-11-06T23:00:00.000Z');
/** Sexta 2026-11-06 22:01 em São Paulo (1 min depois do fim da janela de 3 h). */
const FRIDAY_22H01 = new Date('2026-11-07T01:01:00.000Z');

describe('zoned: jogo da semana (caso 4, parte de datas)', () => {
  it('caso 4: a janela do jogo em andamento é de 3 h', () => {
    expect(GAME_DURATION_HOURS).toBe(3);
  });

  it('caso 4: quinta 10h, jogo sexta 19h → ocorrência de sexta com startsAt/endsAt em UTC', () => {
    const occ = currentOccurrence(friday(48), THURSDAY_10H);
    expect(occ.date).toBe('2026-11-06');
    expect(occ.startsAt).toMatch(/Z$/);
    expect(occ.opensAt).toMatch(/Z$/);
    expect(occ.endsAt).toMatch(/Z$/);
    expect(iso(occ.startsAt)).toBe('2026-11-06T22:00:00.000Z');
    expect(iso(occ.endsAt)).toBe('2026-11-07T01:00:00.000Z');
  });

  it('caso 4: quinta 10h, antecedência 48h → opensAt 48h antes e status open', () => {
    const occ = currentOccurrence(friday(48), THURSDAY_10H);
    expect(iso(occ.opensAt)).toBe('2026-11-04T22:00:00.000Z');
    expect(timeStatus(occ, THURSDAY_10H)).toBe('open');
  });

  it('caso 4: quinta 10h, antecedência 24h → status scheduled (lista ainda não abriu)', () => {
    const occ = currentOccurrence(friday(24), THURSDAY_10H);
    expect(iso(occ.opensAt)).toBe('2026-11-05T22:00:00.000Z');
    expect(timeStatus(occ, THURSDAY_10H)).toBe('scheduled');
  });

  it('caso 4: sexta 20h → o atual ainda é o de sexta, in_progress', () => {
    const occ = currentOccurrence(friday(48), FRIDAY_20H);
    expect(occ.date).toBe('2026-11-06');
    expect(timeStatus(occ, FRIDAY_20H)).toBe('in_progress');
  });

  it('caso 4: sexta 22h01 → o atual é o da sexta seguinte', () => {
    const occ = currentOccurrence(friday(48), FRIDAY_22H01);
    expect(occ.date).toBe('2026-11-13');
    expect(iso(occ.startsAt)).toBe('2026-11-13T22:00:00.000Z');
    expect(iso(occ.opensAt)).toBe('2026-11-11T22:00:00.000Z');
    expect(timeStatus(occ, FRIDAY_22H01)).toBe('scheduled');
  });

  it('caso 4: exatamente às 22h de sexta (endsAt == now) → já é o da sexta seguinte', () => {
    const occ = currentOccurrence(friday(48), new Date('2026-11-07T01:00:00.000Z'));
    expect(occ.date).toBe('2026-11-13');
  });

  it('caso 4: sexta 18h (antes do início, mesmo dia) → ocorrência de hoje, open', () => {
    const now = new Date('2026-11-06T21:00:00.000Z');
    const occ = currentOccurrence(friday(48), now);
    expect(occ.date).toBe('2026-11-06');
    expect(timeStatus(occ, now)).toBe('open');
  });

  it('caso 4: limites do timeStatus (opensAt → open; startsAt → in_progress)', () => {
    const occ = currentOccurrence(friday(24), THURSDAY_10H);
    const opensAt = new Date(occ.opensAt);
    const startsAt = new Date(occ.startsAt);
    expect(timeStatus(occ, new Date(opensAt.getTime() - 1))).toBe('scheduled');
    expect(timeStatus(occ, opensAt)).toBe('open');
    expect(timeStatus(occ, new Date(startsAt.getTime() - 1))).toBe('open');
    expect(timeStatus(occ, startsAt)).toBe('in_progress');
    expect(timeStatus(occ, new Date(startsAt.getTime() + GAME_DURATION_HOURS * HOUR - 1))).toBe(
      'in_progress',
    );
  });
});

describe('zoned: fusos e horário de verão (caso 9)', () => {
  it('caso 9: mesmo now, grupo em America/Sao_Paulo e outro em Europe/Lisbon → startsAt em UTC corretos', () => {
    const now = new Date('2026-10-21T12:00:00.000Z');
    const sp = currentOccurrence(friday(48, 'America/Sao_Paulo'), now);
    const lisbon = currentOccurrence(friday(48, 'Europe/Lisbon'), now);
    expect(sp.date).toBe('2026-10-23');
    expect(lisbon.date).toBe('2026-10-23');
    expect(iso(sp.startsAt)).toBe('2026-10-23T22:00:00.000Z');
    // Lisboa ainda em horário de verão (WEST, UTC+1).
    expect(iso(lisbon.startsAt)).toBe('2026-10-23T18:00:00.000Z');
  });

  it('caso 9: depois da troca de horário de Lisboa (WET, UTC+0) → 19h local = 19:00Z', () => {
    const now = new Date('2026-10-28T12:00:00.000Z');
    const lisbon = currentOccurrence(friday(144, 'Europe/Lisbon'), now);
    expect(lisbon.date).toBe('2026-10-30');
    expect(iso(lisbon.startsAt)).toBe('2026-10-30T19:00:00.000Z');
    // opensAt = startsAt − 144 h exatas, mesmo atravessando a troca de horário.
    expect(iso(lisbon.opensAt)).toBe('2026-10-24T19:00:00.000Z');
    expect(timeStatus(lisbon, now)).toBe('open');
  });

  it('caso 9: zonedToUtc em São Paulo (sem horário de verão)', () => {
    expect(zonedToUtc('2026-11-06', '19:00', 'America/Sao_Paulo').toISOString()).toBe(
      '2026-11-06T22:00:00.000Z',
    );
    expect(zonedToUtc('2026-01-16', '19:00', 'America/Sao_Paulo').toISOString()).toBe(
      '2026-01-16T22:00:00.000Z',
    );
  });

  it('caso 9: zonedToUtc em Lisboa, verão e inverno', () => {
    expect(zonedToUtc('2026-07-10', '19:00', 'Europe/Lisbon').toISOString()).toBe('2026-07-10T18:00:00.000Z');
    expect(zonedToUtc('2026-12-11', '19:00', 'Europe/Lisbon').toISOString()).toBe('2026-12-11T19:00:00.000Z');
  });

  it('caso 9: hora que não existe (pulo 01→02 em Lisboa, 2026-03-29) → avança o pulo (01:30 vira 02:30 WEST)', () => {
    expect(zonedToUtc('2026-03-29', '01:30', 'Europe/Lisbon').toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  it('caso 9: hora que existe duas vezes (volta 02→01 em Lisboa, 2026-10-25) → a primeira (WEST)', () => {
    expect(zonedToUtc('2026-10-25', '01:30', 'Europe/Lisbon').toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('caso 9: currentOccurrence no domingo da troca de horário de Lisboa', () => {
    const sunday = { weekday: 0, time: '01:30', timeZone: 'Europe/Lisbon', listOpensHoursBefore: 24 };
    const autumn = currentOccurrence(sunday, new Date('2026-10-24T12:00:00.000Z'));
    expect(autumn.date).toBe('2026-10-25');
    expect(iso(autumn.startsAt)).toBe('2026-10-25T00:30:00.000Z');
    const spring = currentOccurrence(sunday, new Date('2026-03-28T12:00:00.000Z'));
    expect(spring.date).toBe('2026-03-29');
    expect(iso(spring.startsAt)).toBe('2026-03-29T01:30:00.000Z');
  });

  it('caso 9: o dia da semana é o do fuso do grupo (sexta 08h em Tóquio ainda é quinta em UTC)', () => {
    const tokyo = { weekday: 5, time: '07:00', timeZone: 'Asia/Tokyo', listOpensHoursBefore: 48 };
    const now = new Date('2026-11-05T23:00:00.000Z');
    const occ = currentOccurrence(tokyo, now);
    expect(occ.date).toBe('2026-11-06');
    expect(iso(occ.startsAt)).toBe('2026-11-05T22:00:00.000Z');
    expect(timeStatus(occ, now)).toBe('in_progress');
  });

  it('caso 9: localDate devolve a data local do instante no fuso', () => {
    const instant = new Date('2026-11-07T01:00:00.000Z');
    expect(localDate(instant, 'America/Sao_Paulo')).toBe('2026-11-06');
    expect(localDate(instant, 'Europe/Lisbon')).toBe('2026-11-07');
    expect(localDate(new Date('2026-11-05T23:00:00.000Z'), 'Asia/Tokyo')).toBe('2026-11-06');
  });
});
