import { z } from "zod";

export const $user = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),

  name: z.string().min(3).max(50).optional(),
  email: z.email().optional(),
  avatar: z.string().min(1).optional(),
});
