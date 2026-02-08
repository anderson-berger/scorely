import { z } from "zod";

export const $baseEntity = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const $lookups = z.object({
  email: z.email().optional(),
});

export const $attributesUser = z
  .object({
    name: z.string().min(3).max(50),
    avatar: z.string().min(1),
  })
  .partial();

export const $user = $baseEntity
  .extend($attributesUser.shape)
  .extend($lookups.shape);

export const $newUser = $attributesUser.extend($lookups.shape);

export type Lookups = z.infer<typeof $lookups>;
export type NewUser = z.infer<typeof $newUser>;
export type User = z.infer<typeof $user>;

export const $authProvider = z.enum(["magic_link"]);
export type AuthProvider = z.infer<typeof $authProvider>;
