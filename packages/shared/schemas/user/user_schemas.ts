import { z } from "zod";

export const $baseEntity = z.object({
  id: z.uuid(),
  version: z.number(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const $nickname = z
  .string()
  .min(3)
  .max(20)
  .regex(
    /^[a-z0-9_-]+$/,
    "Nickname deve conter apenas letras minúsculas, números, _ ou -",
  );

export const $query = z.object({
  email: z.email(),
  nickname: $nickname.optional(),
});

export const $attributes = z
  .object({
    name: z.string().min(3).max(50),
    avatar: z.url(),
    bio: z.string().max(200),
    birthdate: z.iso.datetime(),
    contacts: z.array(z.string()),
  })
  .partial();

export const $user = $baseEntity.extend($query.shape).extend($attributes.shape);

export const $newUser = z.object({
  email: z.email(),
});

export type User = z.infer<typeof $user>;
export type NewUser = z.infer<typeof $newUser>;
