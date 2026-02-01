import { z } from "zod";

const stage = process.env.STAGE || "local";
const isLocal = stage === "local";

const envSchema = z.object({
  // Fornecidas pelo Serverless Framework
  STAGE: z.enum(["local", "dev", "prod"]).default("local"),
  TABLE: z.string().default("scorely-local"),
  REGION: z.string().default("sa-east-1"),

  // Secrets (GitHub Secrets em prod, defaults só para local)
  JWT_MAGIC_LINK_SECRET: isLocal
    ? z.string().default("local-dev-magic-link-secret-not-for-production")
    : z.string().min(1, "JWT_MAGIC_LINK_SECRET is required"),
  JWT_ACCESS_SECRET: isLocal
    ? z.string().default("local-dev-access-secret-not-for-production")
    : z.string().min(1, "JWT_ACCESS_SECRET is required"),

  // URLs
  FRONTEND_URL: z.string().url().default("http://localhost:9000"),

  // S3 (defaults para LocalStack)
  S3_BUCKET: z.string().default("scorely-uploads"),
  S3_INTERNAL_ENDPOINT: z.string().default("http://localstack:4566"),
  S3_PUBLIC_ENDPOINT: z.string().default("http://localhost:4566"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:", parsed.error.format());
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
