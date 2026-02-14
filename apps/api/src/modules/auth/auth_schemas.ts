import { z } from "zod";

export const $authToken = z.object({
  type: z.literal("Bearer"),
  token: z.string(),
});

export const $sendMagicLinkInput = z.object({
  email: z.email(),
});

export const $verifyTokenInput = z.object({
  token: z.string(),
});

export type AuthToken = z.infer<typeof $authToken>;
export type SendMagicLinkInput = z.infer<typeof $sendMagicLinkInput>;
export type VerifyTokenInput = z.infer<typeof $verifyTokenInput>;
