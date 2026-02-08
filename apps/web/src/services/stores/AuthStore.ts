// import AuthService from 'src/services//api/AuthService';
import { reactive } from 'vue';

// auth-store.ts - Cuida APENAS de autenticação
class AuthStore {
  private _state = reactive({
    accessToken: localStorage.getItem('accessToken'),
    // refreshToken: localStorage.getItem('refreshToken'),
    isAuthenticated: !!localStorage.getItem('accessToken'),
  });

  get accessToken() {
    return this._state.accessToken;
  }

  get isAuthenticated() {
    return this._state.isAuthenticated;
  }

  setTokens(access: string) {
    this._state.accessToken = access;
    // this._state.refreshToken = refresh;
    this._state.isAuthenticated = true;

    localStorage.setItem('accessToken', access);
    // localStorage.setItem('refreshToken', refresh);
  }

  clearTokens() {
    this._state.accessToken = null;
    // this._state.refreshToken = null;
    this._state.isAuthenticated = false;

    localStorage.removeItem('accessToken');
    // localStorage.removeItem('refreshToken');
  }

  //   async refreshAccessToken() {
  //     if (!this._state.refreshToken) throw new Error('No refresh token');

  //     const { accessToken, refreshToken } = await AuthService.refresh(this._state.refreshToken);

  //     this.setTokens(accessToken, refreshToken);
  //   }
}

export const authStore = new AuthStore();
