import { AUTHORIZER } from '@scorely/api/src/lib/auth';
import type { AWS } from '@serverless/typescript';

// Grupo v2 (ADR 0017): rotas em `/v2` e funções com o sufixo `V2`, para não colidir com o grupo antigo.
const handler = (name: string) => `src/modules/groups-v2/handlers.${name}`;
const route = (method: string, path: string) => [
  { httpApi: { method, path, authorizer: { name: AUTHORIZER } } },
];

export const groupsV2Functions: AWS['functions'] = {
  createGroupV2: { handler: handler('createGroupV2'), events: route('POST', '/v2/groups') },
  getGroupV2: { handler: handler('getGroupV2'), events: route('GET', '/v2/groups/{publicId}') },
  myGroupsV2: { handler: handler('myGroupsV2'), events: route('GET', '/v2/me/groups') },
};
