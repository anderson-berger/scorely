import type { AxiosInstance } from 'axios';
import axios from 'axios';
import { authStore } from 'src/services/stores/AuthStore';

const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = authStore.accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  },
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      authStore.clearTokens();
      window.location.href = '/';
    }

    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  },
);

export default api;
