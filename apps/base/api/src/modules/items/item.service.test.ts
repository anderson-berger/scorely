import { describe, expect, it } from 'vitest';
import type { HttpError } from '../../lib/http';
import type { ItemRepository } from './item.repository';
import type { Item } from './item.schema';
import { createItemService } from './item.service';

function memoryRepo(): ItemRepository {
  const store = new Map<string, Item>();
  return {
    put: async (item) => void store.set(item.id, item),
    get: async (id) => store.get(id),
    list: async () => [...store.values()],
  };
}

describe('ItemService', () => {
  it('cria e busca um item', async () => {
    const service = createItemService(memoryRepo(), () => new Date('2026-01-01T00:00:00Z'));
    const created = await service.create({ name: 'Escudo' });
    expect(created.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(await service.get(created.id)).toEqual(created);
  });

  it('lança 404 para item inexistente', async () => {
    const service = createItemService(memoryRepo());
    await expect(service.get('nope')).rejects.toMatchObject({ status: 404 } satisfies Partial<HttpError>);
  });
});
