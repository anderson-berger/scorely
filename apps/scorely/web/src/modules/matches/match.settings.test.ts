import type { Match, MatchSeries } from '@scorely/contracts';
import {
  durationLabel,
  durationOf,
  endFrom,
  joinDuration,
  seriesWhenOf,
  settingsOf,
  splitDuration,
  weekdayOfDate,
  withSeriesSettings,
  withSettings,
} from '@scorely/web/src/modules/matches/match.settings';
import { describe, expect, it } from 'vitest';

const match = {
  startsAt: '2026-11-27T22:00:00.000Z',
  endsAt: '2026-11-28T00:00:00.000Z',
  teams: 2,
  playersPerTeam: 6,
  membersHours: 72,
  reservesHours: 24,
  guestsHours: 6,
  noGuests: false,
  closeHours: 0,
  version: 3,
} as Match;

/** A partida limpa (PAR-01): sem formato, sem horas. */
const clean = {
  startsAt: '2026-11-27T22:00:00.000Z',
  endsAt: '2026-11-28T00:00:00.000Z',
  noGuests: false,
  closeHours: 0,
  version: 1,
} as Match;

describe('configurações da partida', () => {
  it('PAR-06: o PUT leva todas as configurações e a version mostrada', () => {
    expect(settingsOf(match)).toEqual({
      startsAt: match.startsAt,
      endsAt: match.endsAt,
      teams: 2,
      playersPerTeam: 6,
      membersHours: 72,
      reservesHours: 24,
      guestsHours: 6,
      noGuests: false,
      closeHours: 0,
      expectedVersion: 3,
    });
    expect(settingsOf(match)).not.toHaveProperty('note');
  });

  it('PAR-06: a partida limpa manda só o início, o fim, "sem convidados", o fechamento e a version', () => {
    const body = settingsOf(clean);
    expect(
      Object.keys(body)
        .filter((k) => (body as Record<string, unknown>)[k] !== undefined)
        .sort(),
    ).toEqual(['closeHours', 'endsAt', 'expectedVersion', 'noGuests', 'startsAt']);
  });

  it('PAR-06: cada painel muda só a sua parte; undefined tira a hora configurada', () => {
    const next = withSettings(match, {
      teams: 2,
      playersPerTeam: 7,
      guestsHours: undefined,
      noGuests: true,
    });
    expect(next.playersPerTeam).toBe(7);
    expect(next.membersHours).toBe(72);
    expect(next.noGuests).toBe(true);
    expect('guestsHours' in next).toBe(false);
  });

  it('PAR-02: o painel do formato tira o formato inteiro (sem limite de vagas), e o resto fica', () => {
    const next = withSettings(match, { teams: undefined, playersPerTeam: undefined });
    expect('teams' in next).toBe(false);
    expect('playersPerTeam' in next).toBe(false);
    expect(next.membersHours).toBe(72);
    expect(next.expectedVersion).toBe(3);
  });

  it('PAR-03: o painel da abertura tira as horas configuradas e a partida volta a abrir a todos', () => {
    const next = withSettings(match, {
      membersHours: undefined,
      reservesHours: undefined,
      guestsHours: undefined,
    });
    expect('membersHours' in next).toBe(false);
    expect('reservesHours' in next).toBe(false);
    expect('guestsHours' in next).toBe(false);
    expect(next.teams).toBe(2);
  });

  it('PAR-01: a duração é a diferença do fim e do início, e o fim sai do início mais a duração', () => {
    expect(durationOf(match)).toBe(120);
    expect(endFrom(match.startsAt, 90)).toBe('2026-11-27T23:30:00.000Z');
  });

  it('PAR-17: a duração aparece em horas e minutos', () => {
    expect(durationLabel(120)).toBe('2 h');
    expect(durationLabel(90)).toBe('1 h 30');
    expect(durationLabel(30)).toBe('30 min');
  });

  it('PAR-17: 105 minutos aparecem como 1 h 45, e os extremos como 1 min e 24 h', () => {
    expect(durationLabel(105)).toBe('1 h 45');
    expect(durationLabel(1)).toBe('1 min');
    expect(durationLabel(60)).toBe('1 h');
    expect(durationLabel(1440)).toBe('24 h');
  });

  it('PAR-17: splitDuration separa os minutos em horas e minutos', () => {
    expect(splitDuration(105)).toEqual({ hours: 1, minutes: 45 });
    expect(splitDuration(120)).toEqual({ hours: 2, minutes: 0 });
    expect(splitDuration(45)).toEqual({ hours: 0, minutes: 45 });
    expect(splitDuration(1440)).toEqual({ hours: 24, minutes: 0 });
  });

  it('PAR-17: joinDuration junta horas e minutos, de 1 min a 24 h', () => {
    expect(joinDuration(1, 45)).toBe(105);
    expect(joinDuration(2, 0)).toBe(120);
    expect(joinDuration(0, 1)).toBe(1);
    expect(joinDuration(24, 0)).toBe(1440);
  });

  it('PAR-17: joinDuration devolve undefined abaixo de 1 min ou acima de 24 h', () => {
    expect(joinDuration(0, 0)).toBeUndefined();
    expect(joinDuration(24, 1)).toBeUndefined();
    expect(joinDuration(25, 0)).toBeUndefined();
  });

  it('PAR-17: splitDuration e joinDuration são inversas', () => {
    const { hours, minutes } = splitDuration(105);
    expect(joinDuration(hours, minutes)).toBe(105);
  });
});

describe('repetição (PAR-20, 22)', () => {
  const series: MatchSeries = {
    id: '00000000-0000-4000-8000-000000000001',
    weekday: 5,
    time: '19:00',
    durationMinutes: 120,
    timeZone: 'America/Sao_Paulo',
    teams: 2,
    playersPerTeam: 6,
    membersHours: 72,
    noGuests: false,
    closeHours: 0,
    resultMode: 'day',
    version: 3,
  };

  it('PAR-20: weekdayOfDate conta de segunda (1) a domingo (7)', () => {
    expect(weekdayOfDate('2026-11-23')).toBe(1);
    expect(weekdayOfDate('2026-11-27')).toBe(5);
    expect(weekdayOfDate('2026-11-29')).toBe(7);
  });

  it('PAR-22: seriesWhenOf lê o dia e a hora no fuso da repetição, não no de quem vê', () => {
    // 22:00 UTC de sexta = 19:00 em São Paulo; 01:00 de sábado em Lisboa não conta.
    expect(seriesWhenOf('2026-11-27T22:00:00.000Z', 105, 'America/Sao_Paulo')).toEqual({
      weekday: 5,
      time: '19:00',
      durationMinutes: 105,
    });
  });

  it('PAR-22: withSeriesSettings manda tudo menos o fuso, com a version, e tira o formato desligado', () => {
    const input = withSeriesSettings(series, {
      teams: undefined,
      playersPerTeam: undefined,
      reservesHours: 24,
    });
    expect(input).toEqual({
      weekday: 5,
      time: '19:00',
      durationMinutes: 120,
      membersHours: 72,
      reservesHours: 24,
      noGuests: false,
      closeHours: 0,
      resultMode: 'day',
      expectedVersion: 3,
    });
  });
});
