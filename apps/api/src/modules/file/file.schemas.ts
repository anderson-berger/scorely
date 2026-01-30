import { z } from "zod";

export const $presignedUrlRequest = z.object({
  contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  size: z.number().int().positive().max(5 * 1024 * 1024), // max 5MB
});

export const $presignedUrlResponse = z.object({
  uploadUrl: z.string().url(),
  key: z.string(),
  expiresIn: z.number().int().positive(),
});

export type PresignedUrlRequest = z.infer<typeof $presignedUrlRequest>;
export type PresignedUrlResponse = z.infer<typeof $presignedUrlResponse>;
