import { S3Client, S3ClientConfig } from "@aws-sdk/client-s3";
import { env } from "@/utils/config/env";

const stage = env.STAGE || "local";
const isLocal = stage.toLowerCase() === "local";

const clientConfig: S3ClientConfig = {
  region: env.REGION,
};

if (isLocal) {
  clientConfig.endpoint = process.env.S3_ENDPOINT || "http://localstack:4566";
  clientConfig.forcePathStyle = true;
  clientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
  };
}

export const s3Client = new S3Client(clientConfig);
