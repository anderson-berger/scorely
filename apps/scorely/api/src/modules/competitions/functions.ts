import { AUTHORIZER } from '@scorely/api/src/lib/auth';
import type { AWS } from '@serverless/typescript';

// Competição (docs/modules/competicao.md). Toda rota pede login.
const handler = (name: string) => `src/modules/competitions/handlers.${name}`;
const route = (method: string, path: string) => [
  { httpApi: { method, path, authorizer: { name: AUTHORIZER } } },
];
const LIST = '/groups/{publicId}/competitions';
const ONE = `${LIST}/{competitionId}`;

export const competitionsFunctions: AWS['functions'] = {
  createCompetition: { handler: handler('createCompetition'), events: route('POST', LIST) },
  listCompetitions: { handler: handler('listCompetitions'), events: route('GET', LIST) },
  getCompetition: { handler: handler('getCompetition'), events: route('GET', ONE) },
  updateCompetition: { handler: handler('updateCompetition'), events: route('PUT', ONE) },
  closeCompetition: { handler: handler('closeCompetition'), events: route('POST', `${ONE}/close`) },
  // Rotina da trava (COM-11; ADR 0012): evento `schedule`, sem recurso de infra.
  competitionsLock: { handler: handler('competitionsLock'), events: [{ schedule: 'rate(1 day)' }] },
};
