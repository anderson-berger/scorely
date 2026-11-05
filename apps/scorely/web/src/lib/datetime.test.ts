import { describe, expect, it } from 'vitest';
import { i18n } from '@/i18n';
import { detectTimeZone, formatDateTime, setDisplayTimeZone } from './datetime';

const ISO = '2026-11-06T22:00:00.000Z';

describe('formatDateTime', () => {
  it('caso 10: 22:00Z em America/Sao_Paulo → 19:00', () => {
    expect(formatDateTime(ISO, 'time', { timeZone: 'America/Sao_Paulo', locale: 'pt-BR' })).toBe('19:00');
  });

  it('caso 10: 22:00Z em Europe/Lisbon → 22:00', () => {
    expect(formatDateTime(ISO, 'time', { timeZone: 'Europe/Lisbon', locale: 'pt-BR' })).toBe('22:00');
  });

  it('caso 10: sempre 24 h, também em inglês', () => {
    expect(formatDateTime(ISO, 'time', { timeZone: 'America/Sao_Paulo', locale: 'en' })).toBe('19:00');
  });

  it("caso 10: 'dateTime' é o padrão (dia/mês com 2 dígitos + hora:minuto)", () => {
    const opts = { timeZone: 'America/Sao_Paulo', locale: 'pt-BR' } as const;
    const text = formatDateTime(ISO, undefined, opts);
    expect(text).toBe(formatDateTime(ISO, 'dateTime', opts));
    expect(text).toContain('06/11');
    expect(text).toContain('19:00');
    expect(text).not.toContain('2026');
  });

  it("caso 10: 'date' tem dia, mês e ano, sem hora", () => {
    const text = formatDateTime(ISO, 'date', { timeZone: 'America/Sao_Paulo', locale: 'pt-BR' });
    expect(text).toContain('06');
    expect(text).toContain('2026');
    expect(text).not.toContain('19:00');
  });

  it('caso 11: fuso do perfil Asia/Tokyo, idioma en → 07:00 do dia seguinte no formato en', () => {
    setDisplayTimeZone('Asia/Tokyo');
    i18n.global.locale.value = 'en';
    const text = formatDateTime(ISO);
    i18n.global.locale.value = 'pt-BR';
    expect(text).toContain('11/07');
    expect(text).toContain('07:00');
    expect(text).toBe(formatDateTime(ISO, 'dateTime', { timeZone: 'Asia/Tokyo', locale: 'en' }));
  });

  it('caso 11: mesmo instante com idioma pt-BR → formato pt (dia/mês)', () => {
    setDisplayTimeZone('Asia/Tokyo');
    i18n.global.locale.value = 'pt-BR';
    const text = formatDateTime(ISO);
    expect(text).toContain('07/11');
    expect(text).toContain('07:00');
  });

  it('caso 11: opts.timeZone vence o fuso padrão', () => {
    setDisplayTimeZone('Asia/Tokyo');
    expect(formatDateTime(ISO, 'time', { timeZone: 'Europe/Lisbon' })).toBe('22:00');
  });

  it('caso 12: detectTimeZone devolve o fuso do sistema', () => {
    expect(detectTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});
