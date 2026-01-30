import type {
  PresignedUrlRequest,
  PresignedUrlResponse,
} from '@scorely/api/modules/file/file.schemas';
import api from 'src/services/api/api';

class FileService {
  async getPresignedUrl(file: File): Promise<PresignedUrlResponse> {
    const payload: PresignedUrlRequest = {
      contentType: file.type as PresignedUrlRequest['contentType'],
      size: file.size,
    };

    const { data } = await api.post<PresignedUrlResponse>('/file/presign', payload);
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
