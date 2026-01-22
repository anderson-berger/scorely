import { z } from "zod";

export const $user = z.object({
  id: z.uuid(),
  version: z.number(),
  email: z.email(),
  name: z.string().min(3).max(50).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const $newUser = z.object({
  email: z.email(),
});

export const $updateUser = $user.omit({
  id: true,
  version: true,
  email: true,
  createdAt: true,
  updatedAt: true,
});

export type User = z.infer<typeof $user>;
export type NewUser = z.infer<typeof $newUser>;
