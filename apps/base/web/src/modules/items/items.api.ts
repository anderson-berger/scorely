import { request } from '@/lib/http';
import { type CreateItemInput, ItemListSchema, ItemSchema } from './item.schema';

export const itemsApi = {
  list: () => request({ url: '/items' }, ItemListSchema).then((r) => r.items),
  create: (input: CreateItemInput) => request({ url: '/items', method: 'POST', data: input }, ItemSchema),
};
