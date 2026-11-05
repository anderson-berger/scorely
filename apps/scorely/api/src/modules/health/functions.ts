import type { AWS } from '@serverless/typescript';

export const healthFunctions: AWS['functions'] = {
  health: {
    handler: 'src/modules/health/handlers.health',
    events: [{ httpApi: { method: 'GET', path: '/health' } }],
  },
};
