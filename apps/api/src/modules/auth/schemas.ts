import { z } from "zod";

export const $magicLink = z.object({
  email: z.string().email(),
});

export const $verify = z.object({
  token: z.string().min(1),
});

export type MagicLinkInput = z.infer<typeof $magicLink>;
export type VerifyInput = z.infer<typeof $verify>;
