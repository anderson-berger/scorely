import { z } from "zod";

export const $baseEntity = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type BaseEntity = z.infer<typeof $baseEntity>;
