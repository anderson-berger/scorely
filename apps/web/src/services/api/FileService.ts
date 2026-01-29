import { $presignedUrlRequest } from '@scorely/shared/schemas/file/file_schemas';
import type {
  PresignedUrlRequest,
  PresignedUrlResponse,
} from '@scorely/shared/schemas/file/file_schemas';
import api from 'src/services/api/api';

class FileService {
  async getPresignedUrl(file: File): Promise<PresignedUrlResponse> {
    const payload: PresignedUrlRequest = $presignedUrlRequest.parse({
      filename: file.name,
      contentType: file.type,
      size: file.size,
    });

    const { data } = await api.post<PresignedUrlResponse>('/file/presign', payload);
    console.log('data', data);
    return data;
  }

  async upload(uploadUrl: string, file: File): Promise<UploadResult> {
    const response: Response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
      },
      body: file,
    });

    return {
      ok: response.ok,
      status: response.status,
      url: response.url.split('?')[0]!,
    };
  }

  async uploadFile(file: File): Promise<string> {
    const presigned = await this.getPresignedUrl(file);

    const result = await this.upload(presigned.uploadUrl, file);

    return result.url;
  }
}

export default new FileService();

export interface UploadResult {
  ok: boolean;
  status: number;
  url: string;
}
