import type { SendMagicLinkInput } from '@scorely/api/modules/auth/auth.schemas';
import api from 'src/services/api/api';
import { authStore } from 'src/services/stores/AuthStore';

interface VerifyResponse {
  token: string;
}

class AuthService {
  async sendMagicLink(data: SendMagicLinkInput): Promise<void> {
    await api.post('/auth/magic-link', data);
  }

  async verifyMagicLink(token: string): Promise<string> {
    const { data } = await api.get<VerifyResponse>('/auth/verify', {
      params: { token },
    });

    authStore.setTokens(data.token);

    return data.token;
  }
}

export default new AuthService();
