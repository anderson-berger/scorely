import type { AWS } from '@serverless/typescript';

const handler = (name: string) => `src/modules/items/handlers.${name}`;

export const itemsFunctions: AWS['functions'] = {
  itemsCreate: {
    handler: handler('create'),
    events: [{ httpApi: { method: 'POST', path: '/items' } }],
  },
  itemsList: {
    handler: handler('list'),
    events: [{ httpApi: { method: 'GET', path: '/items' } }],
  },
  itemsGet: {
    handler: handler('get'),
    events: [{ httpApi: { method: 'GET', path: '/items/{id}' } }],
  },
};
