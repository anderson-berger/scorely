import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "@/utils/db/s3_client";
import { env } from "@/utils/config/env";
import type { PresignedUrlRequest } from "@/modules/file/file.schemas";

const PRESIGNED_URL_EXPIRY = 300; // 5 minutos

export class FileRepository {
  private bucket = env.S3_BUCKET;
  private stage = env.STAGE;
  private bucketName = `${this.bucket}-${this.stage}`;

  async generatePresignedUrl(
    key: string,
    request: PresignedUrlRequest,
  ): Promise<{ uploadUrl: string; expiresIn: number }> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: request.contentType,
      ContentLength: request.size,
    });

    const urlUpload = await getSignedUrl(s3Client, command, {
      expiresIn: PRESIGNED_URL_EXPIRY,
    });

    const uploadUrl =
      env.STAGE === "local"
        ? urlUpload.replace(env.S3_INTERNAL_ENDPOINT, env.S3_PUBLIC_ENDPOINT)
        : urlUpload;

    return {
      uploadUrl,
      expiresIn: PRESIGNED_URL_EXPIRY,
    };
  }
}
