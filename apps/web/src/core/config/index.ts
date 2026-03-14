export const config = {
  api: {
    baseUrl: '/api',
    timeout: 10_000,
  },
  pagination: {
    defaultLimit: 20,
  },
} as const;
