import { i18n } from '@scorely/web/src/i18n';
import { detectTimeZone, formatDateTime, setDisplayTimeZone } from '@scorely/web/src/lib/datetime';
import { describe, expect, it } from 'vitest';

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

describe('formatDateTime com fuso desconhecido (caso 15)', () => {
  it("caso 15: setDisplayTimeZone('Mars/Olympus') → não lança e usa o fuso detectado", () => {
    setDisplayTimeZone('Mars/Olympus');
    const text = (() => {
      try {
        return formatDateTime(ISO);
      } finally {
        setDisplayTimeZone(detectTimeZone());
      }
    })();
    expect(text).toBe(formatDateTime(ISO, 'dateTime', { timeZone: detectTimeZone() }));
  });

  it("caso 15: setDisplayTimeZone('Mars/Olympus') → também nos estilos 'date' e 'time'", () => {
    setDisplayTimeZone('Mars/Olympus');
    const texts = (() => {
      try {
        return [formatDateTime(ISO, 'date'), formatDateTime(ISO, 'time')];
      } finally {
        setDisplayTimeZone(detectTimeZone());
      }
    })();
    expect(texts).toEqual([
      formatDateTime(ISO, 'date', { timeZone: detectTimeZone() }),
      formatDateTime(ISO, 'time', { timeZone: detectTimeZone() }),
    ]);
  });

  it("caso 15: opts.timeZone 'Mars/Olympus' → não lança e usa o fuso detectado", () => {
    setDisplayTimeZone(detectTimeZone());
    expect(() => formatDateTime(ISO, 'dateTime', { timeZone: 'Mars/Olympus' })).not.toThrow();
    expect(formatDateTime(ISO, 'dateTime', { timeZone: 'Mars/Olympus' })).toBe(
      formatDateTime(ISO, 'dateTime', { timeZone: detectTimeZone() }),
    );
  });
});

// Plano 015 (D5).
describe("formatDateTime com o estilo 'weekday'", () => {
  const FRIDAY = '2026-11-13T22:00:00.000Z';

  it('caso 8: pt-BR → "sexta-feira"', () => {
    expect(formatDateTime(FRIDAY, 'weekday', { timeZone: 'America/Sao_Paulo', locale: 'pt-BR' })).toBe(
      'sexta-feira',
    );
  });

  it('caso 8: en → "Friday"', () => {
    expect(formatDateTime(FRIDAY, 'weekday', { timeZone: 'America/Sao_Paulo', locale: 'en' })).toBe('Friday');
  });
});
