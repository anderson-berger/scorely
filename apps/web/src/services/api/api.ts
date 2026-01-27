// src/services/api.ts
import type { AxiosInstance } from 'axios';
import axios from 'axios';

const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const authData = localStorage.getItem('auth');
    if (authData) {
      try {
        const { token } = JSON.parse(authData);
        config.headers.Authorization = `Bearer ${token}`;
      } catch {
        localStorage.removeItem('auth');
      }
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
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        localStorage.removeItem('auth');
        window.location.href = '/';
      }
      return Promise.reject(error);
    }

    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  },
);

export default api;
