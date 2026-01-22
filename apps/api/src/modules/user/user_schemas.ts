import { z } from "zod";

export const $user = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string().min(3).max(50).optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type User = z.infer<typeof $user>;
