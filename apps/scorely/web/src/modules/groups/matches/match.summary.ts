import type { Match, MatchSeries } from '@scorely/contracts';
import { t } from '@scorely/web/src/i18n';
import { durationLabel, slotsOf } from '@scorely/web/src/modules/groups/matches/match.settings';

// PAR-18: o valor atual das linhas Formato, Abertura da lista e Repetição. A partida e a repetição têm os mesmos
// campos de formato e abertura (PAR-20).

type Setup = Pick<
  Match,
  'teams' | 'playersPerTeam' | 'membersHours' | 'reservesHours' | 'guestsHours' | 'noGuests' | 'closeHours'
>;

/** "2 times de 6 · 12 vagas", ou "Sem limite de vagas". */
export function formatSummary(setup: Setup): string {
  const slots = slotsOf(setup);
  return slots === undefined
    ? t('matches.settings.noLimit')
    : t('matches.settings.formatSummary', { teams: setup.teams, players: setup.playersPerTeam, slots });
}

/** "Membros 72 h antes · Reservas 24 h antes · Convidados 6 h antes", ou "Aberta a todos". */
export function openingSummary(setup: Setup): string {
  const parts = [
    ...(setup.membersHours !== undefined
      ? [t('matches.settings.membersAt', { hours: setup.membersHours })]
      : []),
    ...(setup.reservesHours !== undefined
      ? [t('matches.settings.reservesAt', { hours: setup.reservesHours })]
      : []),
    ...(setup.noGuests
      ? [t('matches.settings.noGuests')]
      : setup.guestsHours !== undefined
        ? [t('matches.settings.guestsAt', { hours: setup.guestsHours })]
        : []),
    ...(setup.closeHours > 0 ? [t('matches.settings.closeAt', { hours: setup.closeHours })] : []),
  ];
  return parts.length > 0 ? parts.join(' · ') : t('matches.settings.openToAll');
}

/** "Toda sexta" (PAR-17, 18). */
export function everyLabel(weekday: number): string {
  return t(`matches.series.every.${weekday}`);
}

/** "Toda sexta · 19:00 · 2 h", ou "Encerrada" (PAR-18). */
export function seriesSummary(series: MatchSeries): string {
  if (series.endedAt) return t('matches.series.ended');
  return t('matches.series.summary', {
    every: everyLabel(series.weekday),
    time: series.time,
    duration: durationLabel(series.durationMinutes),
  });
}
