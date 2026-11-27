import type { ItemRepository } from '@base/api/src/modules/items/data/items.repository';
import type { Item } from '@base/api/src/modules/items/item.schema';

/** Repositório em memória, com a mesma interface do DynamoDB. */
export function memoryItems(): ItemRepository {
  const store = new Map<string, Item>();
  return {
    put: async (item) => void store.set(item.id, item),
    get: async (id) => store.get(id),
    list: async () => [...store.values()],
  };
}
