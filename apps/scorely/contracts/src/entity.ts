import { z } from 'zod';

/**
 * Campos que toda entidade tem. Os schemas de entidade estendem este (`EntitySchema.extend({...})`).
 * `createdAt` é ISO 8601 em UTC (`2026-11-05T14:32:10.123Z`); o web converte para o fuso do usuário.
 */
export const EntitySchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type Entity = z.infer<typeof EntitySchema>;
