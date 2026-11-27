import type { HttpError } from '@base/api/src/lib/http';
import { setup } from '@base/api/src/modules/items/tests/fixtures';
import { describe, expect, it } from 'vitest';

describe('ItemService', () => {
  it('cria e busca um item', async () => {
    const service = setup(() => new Date('2026-01-01T00:00:00Z'));
    const created = await service.create({ name: 'Escudo' });
    expect(created.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(await service.get(created.id)).toEqual(created);
  });

  it('lança 404 para item inexistente', async () => {
    const service = setup();
    await expect(service.get('nope')).rejects.toMatchObject({ status: 404 } satisfies Partial<HttpError>);
  });
});
