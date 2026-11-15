import type { AWS } from '@serverless/typescript';

const handler = (name: string) => `src/modules/sports/handlers.${name}`;

/** ESP-07: o catálogo é público (sem authorizer). */
export const sportsFunctions: AWS['functions'] = {
  sportsList: {
    handler: handler('listSports'),
    events: [{ httpApi: { method: 'GET', path: '/sports' } }],
  },
};
