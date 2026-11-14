import { AUTHORIZER } from '@scorely/api/src/lib/auth';
import type { AWS } from '@serverless/typescript';

const handler = (name: string) => `src/modules/competition/handlers.${name}`;
const route = (method: string, path: string) => [
  { httpApi: { method, path, authorizer: { name: AUTHORIZER } } },
];

/** Competição do grupo: ativação e regulamento (CMP-01–07) , fechar os jogos (CMP-11–16), as partidas (CMP-19–22), o ranking (CMP-24–27) e as temporadas (CMP-29–34), docs/modules/competicao.md. */
export const competitionFunctions: AWS['functions'] = {
  // CMP-39 (ADR 0012): a rotina diária que trava as temporadas. Gatilho da lambda, sem recurso de infra.
  competitionLockSeasons: {
    handler: 'src/modules/competition/jobs.lockSeasons',
    events: [{ schedule: 'rate(1 day)' }],
  },
  competitionGet: { handler: handler('getCompetition'), events: route('GET', '/groups/{id}/competition') },
  competitionStartTrial: {
    handler: handler('startCompetitionTrial'),
    events: route('POST', '/groups/{id}/competition/trial'),
  },
  competitionUpdateRules: {
    handler: handler('updateCompetitionRules'),
    events: route('PUT', '/groups/{id}/competition/rules'),
  },
  competitionGames: {
    handler: handler('listCompetitionGames'),
    events: route('GET', '/groups/{id}/competition/games'),
  },
  competitionGame: {
    handler: handler('getCompetitionGame'),
    events: route('GET', '/groups/{id}/competition/games/{date}'),
  },
  competitionCloseGame: {
    handler: handler('closeCompetitionGame'),
    events: route('PUT', '/groups/{id}/competition/games/{date}'),
  },
  competitionCreateMatch: {
    handler: handler('createCompetitionMatch'),
    events: route('POST', '/groups/{id}/competition/games/{date}/matches'),
  },
  competitionUpdateMatch: {
    handler: handler('updateCompetitionMatch'),
    events: route('PUT', '/groups/{id}/competition/games/{date}/matches/{matchId}'),
  },
  competitionDeleteMatch: {
    handler: handler('deleteCompetitionMatch'),
    events: route('DELETE', '/groups/{id}/competition/games/{date}/matches/{matchId}'),
  },
  competitionRanking: {
    handler: handler('getCompetitionRanking'),
    events: route('GET', '/groups/{id}/competition/ranking'),
  },
  competitionPerson: {
    handler: handler('getCompetitionPerson'),
    events: route('GET', '/groups/{id}/competition/people/{userId}'),
  },
  competitionSeasons: {
    handler: handler('listCompetitionSeasons'),
    events: route('GET', '/groups/{id}/competition/seasons'),
  },
  competitionCreateSeason: {
    handler: handler('createCompetitionSeason'),
    events: route('POST', '/groups/{id}/competition/seasons'),
  },
  competitionUpdateSeason: {
    handler: handler('updateCompetitionSeason'),
    events: route('PUT', '/groups/{id}/competition/seasons/{seasonId}'),
  },
  competitionDeleteSeason: {
    handler: handler('deleteCompetitionSeason'),
    events: route('DELETE', '/groups/{id}/competition/seasons/{seasonId}'),
  },
  competitionCloseSeason: {
    handler: handler('closeCompetitionSeason'),
    events: route('POST', '/groups/{id}/competition/seasons/{seasonId}/close'),
  },
  competitionTrophies: { handler: handler('myTrophies'), events: route('GET', '/me/trophies') },
};
