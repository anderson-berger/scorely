import { z } from "zod";
import { config } from "dotenv";
import { resolve } from "path";

const stage = process.env.STAGE || "local";
config({ path: resolve(__dirname, `../../../env/.env.${stage}`) });

const envSchema = z.object({
  STAGE: z.enum(["local", "dev", "prod"]).default("local"),
  TABLE: z.string(),
  REGION: z.string().default("sa-east-1"),
  JWT_MAGIC_LINK_SECRET: z.string(),
  JWT_MAGIC_LINK_TOKEN_EXPIRY: z.string(),
  JWT_ACCESS_SECRET: z.string(),
  JWT_ACCESS_TOKEN_EXPIRY: z.string(),
  FRONTEND_URL: z.url(),
  S3_BUCKET: z.string(),
  S3_INTERNAL_ENDPOINT: z.string(),
  S3_PUBLIC_ENDPOINT: z.string(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:", parsed.error.format());
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
