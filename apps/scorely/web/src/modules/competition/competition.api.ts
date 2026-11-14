import {
  type CloseGameInput,
  CompetitionGameDetailSchema,
  CompetitionGameSchema,
  type CompetitionRules,
  CompetitionSchema,
  type Gender,
  type MatchInput,
  PersonHistorySchema,
  RankingSchema,
  type SeasonInput,
  SeasonSchema,
  type SeasonUpdateInput,
  TrophySchema,
} from '@scorely/contracts';
import { request, send } from '@scorely/web/src/lib/http';

const url = (groupId: string) => `/groups/${groupId}/competition`;

/** Competição do grupo: estado, teste e regulamento (CMP-01–07) e os jogos (CMP-11–16). */
export const competitionApi = {
  get: (groupId: string) => request({ url: url(groupId) }, CompetitionSchema),
  startTrial: (groupId: string) =>
    request({ url: `${url(groupId)}/trial`, method: 'POST' }, CompetitionSchema),
  updateRules: (groupId: string, rules: CompetitionRules) =>
    request({ url: `${url(groupId)}/rules`, method: 'PUT', data: rules }, CompetitionSchema),

  games: (groupId: string) => request({ url: `${url(groupId)}/games` }, CompetitionGameSchema.array()),
  game: (groupId: string, date: string) =>
    request({ url: `${url(groupId)}/games/${date}` }, CompetitionGameDetailSchema),
  /** Fecha (1ª vez) ou corrige (CMP-11–15). */
  closeGame: (groupId: string, date: string, input: CloseGameInput) =>
    request(
      { url: `${url(groupId)}/games/${date}`, method: 'PUT', data: input },
      CompetitionGameDetailSchema,
    ),

  /** Partidas (CMP-19–21): cada uma devolve o jogo atualizado. */
  createMatch: (groupId: string, date: string, input: MatchInput) =>
    request(
      { url: `${url(groupId)}/games/${date}/matches`, method: 'POST', data: input },
      CompetitionGameDetailSchema,
    ),
  updateMatch: (groupId: string, date: string, matchId: string, input: MatchInput) =>
    request(
      { url: `${url(groupId)}/games/${date}/matches/${matchId}`, method: 'PUT', data: input },
      CompetitionGameDetailSchema,
    ),
  deleteMatch: (groupId: string, date: string, matchId: string) =>
    request(
      { url: `${url(groupId)}/games/${date}/matches/${matchId}`, method: 'DELETE' },
      CompetitionGameDetailSchema,
    ),

  /** Ranking do grupo (CMP-24–26), com o recorte por gênero, e o histórico de uma pessoa (CMP-27). */
  ranking: (groupId: string, gender?: Gender, season?: string) =>
    request(
      { url: `${url(groupId)}/ranking`, params: { ...(gender && { gender }), ...(season && { season }) } },
      RankingSchema,
    ),
  person: (groupId: string, userId: string) =>
    request({ url: `${url(groupId)}/people/${userId}` }, PersonHistorySchema),

  /** Temporadas (CMP-29–34). */
  seasons: (groupId: string) => request({ url: `${url(groupId)}/seasons` }, SeasonSchema.array()),
  createSeason: (groupId: string, input: SeasonInput) =>
    request({ url: `${url(groupId)}/seasons`, method: 'POST', data: input }, SeasonSchema),
  updateSeason: (groupId: string, seasonId: string, input: SeasonUpdateInput) =>
    request({ url: `${url(groupId)}/seasons/${seasonId}`, method: 'PUT', data: input }, SeasonSchema),
  deleteSeason: (groupId: string, seasonId: string) =>
    send({ url: `${url(groupId)}/seasons/${seasonId}`, method: 'DELETE' }),
  closeSeason: (groupId: string, seasonId: string) =>
    request({ url: `${url(groupId)}/seasons/${seasonId}/close`, method: 'POST' }, SeasonSchema),

  /** A sala de troféus de quem está logado, de todos os grupos (CMP-37). */
  myTrophies: () => request({ url: '/me/trophies' }, TrophySchema.array()),
};
