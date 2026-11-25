import { AUTHORIZER } from '@scorely/api/src/lib/auth';
import type { AWS } from '@serverless/typescript';

// Partida (docs/modules/partidas.md). Toda rota pede login.
const handler = (name: string) => `src/modules/groups/matches/handlers.${name}`;
const route = (method: string, path: string) => [
  { httpApi: { method, path, authorizer: { name: AUTHORIZER } } },
];
const MATCH = '/groups/{publicId}/matches/{matchId}';
const SERIES = '/groups/{publicId}/match-series/{seriesId}';

export const matchesFunctions: AWS['functions'] = {
  createMatch: { handler: handler('createMatch'), events: route('POST', '/groups/{publicId}/matches') },
  listMatches: { handler: handler('listMatches'), events: route('GET', '/groups/{publicId}/matches') },
  getMatch: { handler: handler('getMatch'), events: route('GET', MATCH) },
  updateMatch: { handler: handler('updateMatch'), events: route('PUT', MATCH) },
  advanceMatch: { handler: handler('advanceMatch'), events: route('POST', `${MATCH}/advance`) },
  cancelMatch: { handler: handler('cancelMatch'), events: route('POST', `${MATCH}/cancel`) },
  startMatch: { handler: handler('startMatch'), events: route('POST', `${MATCH}/start`) },
  unstartMatch: { handler: handler('unstartMatch'), events: route('POST', `${MATCH}/unstart`) },
  finishMatch: { handler: handler('finishMatch'), events: route('POST', `${MATCH}/finish`) },
  setMatchAttendance: { handler: handler('setAttendance'), events: route('PUT', `${MATCH}/attendance`) },
  // Convidados (PAR-11–14)
  requestMatchGuest: { handler: handler('requestGuest'), events: route('POST', `${MATCH}/guests`) },
  approveMatchGuest: {
    handler: handler('approveGuest'),
    events: route('POST', `${MATCH}/guests/{guestId}/approve`),
  },
  declineMatchGuest: {
    handler: handler('declineGuest'),
    events: route('POST', `${MATCH}/guests/{guestId}/decline`),
  },
  removeMatchGuest: { handler: handler('removeGuest'), events: route('DELETE', `${MATCH}/guests/{guestId}`) },
  // Times (PAR-25)
  saveMatchTeams: { handler: handler('saveMatchTeams'), events: route('PUT', `${MATCH}/teams`) },
  // Resultado e histórico (PAR-31–36). A rota estática `history` vence a `{matchId}` no HTTP API.
  saveMatchResult: { handler: handler('saveMatchResult'), events: route('PUT', `${MATCH}/result`) },
  // Vale para (PAR-40)
  setMatchCompetitions: {
    handler: handler('setMatchCompetitions'),
    events: route('PUT', `${MATCH}/competitions`),
  },
  matchHistory: {
    handler: handler('matchHistory'),
    events: route('GET', '/groups/{publicId}/matches/history'),
  },
  // Repetição (PAR-22, 23)
  updateMatchSeries: { handler: handler('updateMatchSeries'), events: route('PUT', SERIES) },
  endMatchSeries: { handler: handler('endMatchSeries'), events: route('POST', `${SERIES}/end`) },
  // Rotina da agenda (PAR-21, 24; ADR 0012): evento `schedule`, sem recurso de infra.
  matchesAgenda: { handler: handler('matchesAgenda'), events: [{ schedule: 'rate(15 minutes)' }] },
};
