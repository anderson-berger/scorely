import type { NewFile } from '@scorely/shared/schemas/file';
import api from 'src/services/api/api';

class FileService {
  async getPresignedUrl(payload: NewFile) {
    return api.post('/file/presign', payload);
  }

  async upload(uploadUrl: string, file: File): Promise<void> {
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
      },
      body: file,
    });
  }
}

export default new FileService();
