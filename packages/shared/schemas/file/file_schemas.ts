import { z } from "zod";

export const $presignedUrlRequest = z.object({
  filename: z.string().min(1),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  size: z.number().max(5 * 1024 * 1024), // max 5MB
});

export const $presignedUrlResponse = z.object({
  uploadUrl: z.string(),
  key: z.string(),
  expiresIn: z.number(),
});

export type PresignedUrlRequest = z.infer<typeof $presignedUrlRequest>;
export type PresignedUrlResponse = z.infer<typeof $presignedUrlResponse>;
