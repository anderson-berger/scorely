import { randomUUID } from "crypto";
import type {
  PresignedUrlRequest,
  PresignedUrlResponse,
} from "@/modules/file/file.schemas";
import { FileRepository } from "@/modules/file/FileRepository";

export class FileService {
  private fileRepository: FileRepository;

  constructor() {
    this.fileRepository = new FileRepository();
  }

  async generatePresignedUrl(
    userId: string,
    request: PresignedUrlRequest,
  ): Promise<PresignedUrlResponse> {
    const extension = this.getExtensionFromContentType(request.contentType);
    const key = `uploads/users/${userId}/${randomUUID()}${extension}`;

    const { uploadUrl, expiresIn } =
      await this.fileRepository.generatePresignedUrl(key, request);

    return {
      uploadUrl,
      key,
      expiresIn,
    };
  }

  private getExtensionFromContentType(contentType: string): string {
    const extensions: Record<string, string> = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
      "image/gif": ".gif",
    };
    return extensions[contentType] || "";
  }
}
