import type { MagicLink } from '@scorely/shared/schemas/auth';
import api from 'src/services/api/api';

interface AuthData {
  token: string;
  user: { id: string; email: string };
}

class AuthService {
  private readonly AUTH_KEY = 'auth';

  async sendMagicLink(data: MagicLink): Promise<void> {
    await api.post('/auth/magic-link', data);
  }

  async verifyMagicLink(token: string): Promise<AuthData> {
    const response = await api.get<AuthData>('/auth/verify', {
      params: { token },
    });
    this.setAuth(response.data);
    return response.data;
  }

  logout(): void {
    localStorage.removeItem(this.AUTH_KEY);
  }

  isAuthenticated(): boolean {
    return this.getAuth() !== null;
  }

  getAuth(): AuthData | null {
    const authData = localStorage.getItem(this.AUTH_KEY);
    if (!authData) return null;

    try {
      return JSON.parse(authData) as AuthData;
    } catch {
      this.logout();
      return null;
    }
  }

  setAuth(data: AuthData): void {
    localStorage.setItem(this.AUTH_KEY, JSON.stringify(data));
  }
}

export default new AuthService();
