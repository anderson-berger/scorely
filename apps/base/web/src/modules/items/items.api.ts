import { request } from '@base/web/src/lib/http';
import { type CreateItemInput, ItemListSchema, ItemSchema } from '@base/web/src/modules/items/item.schema';

export const itemsApi = {
  list: () => request({ url: '/items' }, ItemListSchema).then((r) => r.items),
  create: (input: CreateItemInput) => request({ url: '/items', method: 'POST', data: input }, ItemSchema),
};
