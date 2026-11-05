import { describe, expect, it } from 'vitest';
import { CreateItemInputSchema } from './item.schema';

describe('CreateItemInputSchema', () => {
  it('aceita input válido', () => {
    expect(CreateItemInputSchema.safeParse({ name: 'Espada' }).success).toBe(true);
  });
  it('rejeita nome vazio', () => {
    expect(CreateItemInputSchema.safeParse({ name: '' }).success).toBe(false);
  });
});
