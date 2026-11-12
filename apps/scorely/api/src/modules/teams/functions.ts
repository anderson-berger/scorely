import { AUTHORIZER } from '@scorely/api/src/lib/auth';
import type { AWS } from '@serverless/typescript';

const handler = (name: string) => `src/modules/teams/handlers.${name}`;
const route = (method: string, path: string) => [
  { httpApi: { method, path, authorizer: { name: AUTHORIZER } } },
];

/**
 * Posições de cada pessoa no grupo (TIM-01–04) e times do jogo atual (TIM-06–13), docs/modules/times.md.
 * Os times do convidado vêm pelo link do jogo (GRP-09).
 */
export const teamsFunctions: AWS['functions'] = {
  teamsPlayers: { handler: handler('listPlayers'), events: route('GET', '/groups/{id}/players') },
  teamsUpdatePlayer: {
    handler: handler('updatePlayer'),
    events: route('PUT', '/groups/{id}/players/{userId}'),
  },
  teamsGet: { handler: handler('getTeams'), events: route('GET', '/groups/{id}/games/{date}/teams') },
  teamsSave: { handler: handler('saveTeams'), events: route('PUT', '/groups/{id}/games/{date}/teams') },
  teamsPublish: {
    handler: handler('publishTeams'),
    events: route('POST', '/groups/{id}/games/{date}/teams/publish'),
  },
  teamSettingsGet: {
    handler: handler('getTeamSettings'),
    events: route('GET', '/groups/{id}/team-settings'),
  },
  teamSettingsUpdate: {
    handler: handler('updateTeamSettings'),
    events: route('PUT', '/groups/{id}/team-settings'),
  },
  teamsDraw: {
    handler: handler('drawTeams'),
    events: route('POST', '/groups/{id}/games/{date}/teams/draw'),
  },
  teamsUnpublish: {
    handler: handler('unpublishTeams'),
    events: route('POST', '/groups/{id}/games/{date}/teams/unpublish'),
  },
  teamsDiscard: {
    handler: handler('discardTeams'),
    events: route('DELETE', '/groups/{id}/games/{date}/teams'),
  },
  teamsGuest: { handler: handler('guestTeams'), events: route('GET', '/play/{token}/teams') },
};
