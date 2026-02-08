import type { SendMagicLinkInput } from '@scorely/api/modules/auth/auth.schemas';
import api from 'src/services/api/api';

interface VerifyResponse {
  token: string;
}

class AuthService {
  async sendMagicLink(data: SendMagicLinkInput): Promise<void> {
    await api.post('/auth/magic-link', data);
  }

  async verifyMagicLink(token: string): Promise<VerifyResponse> {
    const { data } = await api.get<VerifyResponse>('/auth/verify', {
      params: { token },
    });
    return data;
  }
}

export default new AuthService();
