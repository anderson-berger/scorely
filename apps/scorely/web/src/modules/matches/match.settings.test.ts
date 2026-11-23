import type { Match } from '@scorely/contracts';
import {
  durationLabel,
  durationOf,
  endFrom,
  settingsOf,
  withSettings,
} from '@scorely/web/src/modules/matches/match.settings';
import { describe, expect, it } from 'vitest';

const match = {
  startsAt: '2026-11-27T22:00:00.000Z',
  endsAt: '2026-11-28T00:00:00.000Z',
  note: 'FERIADO!',
  teams: 2,
  playersPerTeam: 6,
  membersHours: 72,
  reservesHours: 24,
  guestsHours: 6,
  closeHours: 0,
  version: 3,
} as Match;

describe('configurações da partida', () => {
  it('PAR-06: o PUT leva todas as configurações e a version mostrada', () => {
    expect(settingsOf(match)).toEqual({
      startsAt: match.startsAt,
      endsAt: match.endsAt,
      note: 'FERIADO!',
      teams: 2,
      playersPerTeam: 6,
      membersHours: 72,
      reservesHours: 24,
      guestsHours: 6,
      closeHours: 0,
      expectedVersion: 3,
    });
  });

  it('PAR-06: cada painel muda só a sua parte; undefined tira o recado ou desliga os convidados', () => {
    const next = withSettings(match, {
      teams: 2,
      playersPerTeam: 7,
      note: undefined,
      guestsHours: undefined,
    });
    expect(next.playersPerTeam).toBe(7);
    expect(next.membersHours).toBe(72);
    expect('note' in next).toBe(false);
    expect('guestsHours' in next).toBe(false);
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
});
