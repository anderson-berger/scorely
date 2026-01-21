import { z } from "zod";

export const $user = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const $newUser = $user.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const $updateUser = $user.pick({
  name: true,
});

export type User = z.infer<typeof $user>;
export type NewUser = z.infer<typeof $newUser>;
export type UpdateUser = z.infer<typeof $updateUser>;
