import { z } from "zod";

export const magicLinkPayloadSchema = z.object({
  email: z.string().email(),
});

export const accessTokenPayloadSchema = z.object({
  userId: z.string(),
  email: z.email(),
});

export type MagicLinkPayload = z.infer<typeof magicLinkPayloadSchema>;
export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>;