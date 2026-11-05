import { randomUUID } from 'node:crypto';
import { notFound } from '../../lib/http';
import type { ItemRepository } from './item.repository';
import type { CreateItemInput, Item } from './item.schema';

export function createItemService(repo: ItemRepository, now: () => Date = () => new Date()) {
  return {
    async create(input: CreateItemInput): Promise<Item> {
      const item: Item = { id: randomUUID(), ...input, createdAt: now().toISOString() };
      await repo.put(item);
      return item;
    },
    async get(id: string): Promise<Item> {
      const item = await repo.get(id);
      if (!item) throw notFound('Item');
      return item;
    },
    list: () => repo.list(),
  };
}
export type ItemService = ReturnType<typeof createItemService>;
