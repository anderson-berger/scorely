import { CreateItemInputSchema } from '@base/api/src/modules/items/item.schema';
import { describe, expect, it } from 'vitest';

describe('CreateItemInputSchema', () => {
  it('aceita input válido', () => {
    expect(CreateItemInputSchema.safeParse({ name: 'Espada' }).success).toBe(true);
  });
  it('rejeita nome vazio', () => {
    expect(CreateItemInputSchema.safeParse({ name: '' }).success).toBe(false);
  });
});
