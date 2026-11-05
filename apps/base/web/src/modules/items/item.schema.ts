import { z } from 'zod';

export const ItemSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  createdAt: z.iso.datetime(),
});
export type Item = z.infer<typeof ItemSchema>;

export const CreateItemInputSchema = ItemSchema.pick({ name: true, description: true });
export type CreateItemInput = z.infer<typeof CreateItemInputSchema>;

export const ItemListSchema = z.object({ items: z.array(ItemSchema) });
export type ItemList = z.infer<typeof ItemListSchema>;
