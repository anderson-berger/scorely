import { AppError } from '@scorely/api/src/lib/errors';
import {
  checkSeasonDates,
  isLocked,
  seasonOfDate,
  seasonState,
} from '@scorely/api/src/modules/competition/seasons';
import { SEASON_LIMITS, SeasonInputSchema } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Competição, etapa 5 (`.claude/work/competicao-5.md`, D3): as funções puras das temporadas.
// `seasonState(season, now, timeZone)`, `seasonOfDate(seasons, date)`, `isLocked(season, now, timeZone)` e
// `checkSeasonDates(input, today, others)`. A temporada aqui é só `{ startDate, endDate, closedAt? }` (datas locais).

const TZ = 'America/Sao_Paulo';

/** A data local de São Paulo é a UTC − 3: `sp('2026-11-14', '00:30')` = 14/11 00:30 em São Paulo. */
const sp = (date: string, time: string) => new Date(`${date}T${time}:00.000-03:00`);

function reasonOf(fn: () => unknown): unknown {
  const err = (() => {
    try {
      fn();
      return undefined;
    } catch (e: unknown) {
      return e;
    }
  })();
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({ code: 'SEASON_INVALID', status: 422 });
  return (err as AppError).details;
}

describe('a temporada e as datas locais (CMP-29)', () => {
  it('CMP-29: a temporada começa no início do dia de início, no fuso do grupo', () => {
    const season = { startDate: '2026-11-14', endDate: '2026-12-13' };
    // 13/11 23:00 em São Paulo (já é 14/11 em UTC): ainda não começou.
    expect(seasonState(season, sp('2026-11-13', '23:00'), TZ)).toBe('scheduled');
    expect(seasonState(season, sp('2026-11-14', '00:30'), TZ)).toBe('open');
  });

  it('CMP-29: a data de fim é inclusive: aberta até o fim do dia de fim, no fuso do grupo', () => {
    const season = { startDate: '2026-11-01', endDate: '2026-11-20' };
    expect(seasonState(season, sp('2026-11-20', '23:59'), TZ)).toBe('open');
    expect(seasonState(season, sp('2026-11-21', '00:01'), TZ)).not.toBe('open');
  });

  it('CMP-29: o jogo é da temporada se o dia dele está entre as duas datas, inclusive', () => {
    const seasons = [
      { startDate: '2026-10-26', endDate: '2026-11-08' },
      { startDate: '2026-11-20', endDate: '2026-12-20' },
    ];
    expect(seasonOfDate(seasons, '2026-10-26')).toMatchObject({ startDate: '2026-10-26' });
    expect(seasonOfDate(seasons, '2026-11-08')).toMatchObject({ startDate: '2026-10-26' });
    expect(seasonOfDate(seasons, '2026-11-20')).toMatchObject({ startDate: '2026-11-20' });
  });

  it('CMP-29: jogo de fora de qualquer temporada não é de nenhuma', () => {
    const seasons = [
      { startDate: '2026-10-26', endDate: '2026-11-08' },
      { startDate: '2026-11-20', endDate: '2026-12-20' },
    ];
    expect(seasonOfDate(seasons, '2026-11-13')).toBeUndefined();
    expect(seasonOfDate(seasons, '2026-10-25')).toBeUndefined();
    expect(seasonOfDate([], '2026-11-13')).toBeUndefined();
  });

  it('CMP-29: duração de 7 dias a 1 ano; fora disso, SEASON_INVALID (duration)', () => {
    const today = '2026-11-14';
    expect(() => checkSeasonDates({ startDate: today, endDate: '2026-11-21' }, today, [])).not.toThrow();
    expect(() => checkSeasonDates({ startDate: today, endDate: '2027-11-14' }, today, [])).not.toThrow();
    expect(reasonOf(() => checkSeasonDates({ startDate: today, endDate: '2026-11-16' }, today, []))).toEqual({
      reason: 'duration',
    });
    expect(reasonOf(() => checkSeasonDates({ startDate: today, endDate: '2027-12-31' }, today, []))).toEqual({
      reason: 'duration',
    });
    // Fim antes do início.
    expect(reasonOf(() => checkSeasonDates({ startDate: '2026-11-30', endDate: today }, today, []))).toEqual({
      reason: 'duration',
    });
  });

  it('CMP-29: o nome tem de 1 a 40 caracteres, e pode faltar', () => {
    const dates = { startDate: '2026-11-14', endDate: '2026-12-14' };
    expect(SeasonInputSchema.safeParse(dates).success).toBe(true);
    expect(SeasonInputSchema.safeParse({ ...dates, name: 'Verão 2027' }).success).toBe(true);
    expect(SeasonInputSchema.safeParse({ ...dates, name: 'x'.repeat(SEASON_LIMITS.name.max) }).success).toBe(
      true,
    );
    expect(
      SeasonInputSchema.safeParse({ ...dates, name: 'x'.repeat(SEASON_LIMITS.name.max + 1) }).success,
    ).toBe(false);
    expect(SeasonInputSchema.safeParse({ ...dates, name: '   ' }).success).toBe(false);
  });
});

describe('abrir e programar (CMP-30)', () => {
  it('CMP-30: abrir agora começa hoje; início no passado: SEASON_INVALID (past_start)', () => {
    const today = '2026-11-14';
    expect(() => checkSeasonDates({ startDate: today, endDate: '2026-12-14' }, today, [])).not.toThrow();
    expect(
      reasonOf(() => checkSeasonDates({ startDate: '2026-11-13', endDate: '2026-12-14' }, today, [])),
    ).toEqual({ reason: 'past_start' });
  });

  it('CMP-30: programar até 1 ano à frente; mais longe: SEASON_INVALID (too_far)', () => {
    const today = '2026-11-14';
    expect(() =>
      checkSeasonDates({ startDate: '2026-12-14', endDate: '2027-01-14' }, today, []),
    ).not.toThrow();
    expect(
      reasonOf(() => checkSeasonDates({ startDate: '2027-12-20', endDate: '2028-01-20' }, today, [])),
    ).toEqual({ reason: 'too_far' });
  });

  it('CMP-30: uma por vez: datas que se cruzam com outra dão SEASON_INVALID (overlap)', () => {
    const today = '2026-11-14';
    const others = [{ startDate: '2026-11-01', endDate: '2026-11-30' }];
    expect(
      reasonOf(() => checkSeasonDates({ startDate: '2026-11-20', endDate: '2026-12-20' }, today, others)),
    ).toEqual({ reason: 'overlap' });
    // O dia de fim é inclusive: começar no último dia da outra também cruza.
    expect(
      reasonOf(() => checkSeasonDates({ startDate: '2026-11-30', endDate: '2026-12-20' }, today, others)),
    ).toEqual({ reason: 'overlap' });
    // Uma programada que engloba a outra.
    const scheduled = [{ startDate: '2026-12-10', endDate: '2026-12-20' }];
    expect(
      reasonOf(() => checkSeasonDates({ startDate: '2026-12-01', endDate: '2027-01-31' }, today, scheduled)),
    ).toEqual({ reason: 'overlap' });
  });

  it('CMP-30: logo depois do fim da outra, ou com um período sem temporada no meio, vale', () => {
    const today = '2026-11-14';
    const others = [{ startDate: '2026-11-01', endDate: '2026-11-30' }];
    expect(() =>
      checkSeasonDates({ startDate: '2026-12-01', endDate: '2026-12-31' }, today, others),
    ).not.toThrow();
    expect(() =>
      checkSeasonDates({ startDate: '2027-01-15', endDate: '2027-02-15' }, today, others),
    ).not.toThrow();
  });
});

describe('encerrar, o prazo e a trava (CMP-32)', () => {
  const season = { startDate: '2026-11-01', endDate: '2026-11-20' };

  it('CMP-32: depois do fim, 3 dias de prazo (até o fim do dia fim + 3, no fuso do grupo)', () => {
    expect(SEASON_LIMITS.graceDays).toBe(3);
    expect(seasonState(season, sp('2026-11-21', '00:30'), TZ)).toBe('grace');
    expect(seasonState(season, sp('2026-11-23', '23:30'), TZ)).toBe('grace');
    expect(isLocked(season, sp('2026-11-23', '23:30'), TZ)).toBe(false);
  });

  it('CMP-32: passado o prazo, a temporada trava', () => {
    expect(seasonState(season, sp('2026-11-24', '00:30'), TZ)).toBe('closed');
    expect(isLocked(season, sp('2026-11-24', '00:30'), TZ)).toBe(true);
    expect(seasonState(season, sp('2027-02-01', '12:00'), TZ)).toBe('closed');
  });

  it('CMP-32: aberta e programada não estão travadas', () => {
    expect(isLocked(season, sp('2026-11-10', '12:00'), TZ)).toBe(false);
    expect(isLocked(season, sp('2026-10-20', '12:00'), TZ)).toBe(false);
  });

  it('CMP-32: encerrada antes da data trava na hora, sem prazo', () => {
    // Encerrar passa o fim para hoje e grava `closedAt`.
    const closed = {
      startDate: '2026-11-01',
      endDate: '2026-11-14',
      closedAt: sp('2026-11-14', '10:00').toISOString(),
    };
    expect(seasonState(closed, sp('2026-11-14', '10:01'), TZ)).toBe('closed');
    expect(isLocked(closed, sp('2026-11-14', '10:01'), TZ)).toBe(true);
    expect(seasonState(closed, sp('2026-11-15', '12:00'), TZ)).toBe('closed');
  });
});
