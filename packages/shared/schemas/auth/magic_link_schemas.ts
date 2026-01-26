import { z } from "zod";

export const $magicLink = z.object({
  email: z.email(),
});

export type MagicLink = z.infer<typeof $magicLink>;

export const $verify = z.object({
  token: z.string(),
});

export const $authToken = z.object({
  type: z.literal("Bearer"),
  token: z.string(),
});

export type AuthToken = z.infer<typeof $authToken>;
