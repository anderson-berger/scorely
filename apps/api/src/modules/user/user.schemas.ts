import { z } from "zod";
import { $baseEntity } from "../../infra/db/base.schemas";

export const $lookupUser = z.object({
  email: z.email().optional(),
  nickname: z
    .string()
    .min(3)
    .max(20)
    .regex(
      /^[a-z0-9_-]+$/,
      "Nickname deve conter apenas letras minúsculas, números, _ ou -",
    )
    .optional(),
});

export const $attributesUser = z
  .object({
    name: z.string().min(3).max(50),
    avatar: z.string().min(1),
    bio: z.string().max(200),
    birthdate: z.iso.datetime(),
    contacts: z.array(z.string()),
  })
  .partial();

export const $user = $baseEntity
  .extend($lookupUser.shape)
  .extend($attributesUser.shape);

export const $newUser = $lookupUser.extend($attributesUser.shape);

export const $authProvider = z.enum(["magic_link"]);

export const $lookupType = z.enum(["email", "nickname"]);

export type User = z.infer<typeof $user>;
export type NewUser = z.infer<typeof $newUser>;
export type AuthProvider = z.infer<typeof $authProvider>;
export type LookupType = z.infer<typeof $lookupType>;
