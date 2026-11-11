import type { AWS } from '@serverless/typescript';
import { AUTHORIZER } from '../../lib/auth';

const handler = (name: string) => `src/modules/teams/handlers.${name}`;
const route = (method: string, path: string) => [
  { httpApi: { method, path, authorizer: { name: AUTHORIZER } } },
];

/** Posições de cada pessoa no grupo (TIM-01–04, docs/modules/times.md): todos do grupo veem, só o dono muda. */
export const teamsFunctions: AWS['functions'] = {
  teamsPlayers: { handler: handler('listPlayers'), events: route('GET', '/groups/{id}/players') },
  teamsUpdatePlayer: {
    handler: handler('updatePlayer'),
    events: route('PUT', '/groups/{id}/players/{userId}'),
  },
};
