import type { RouteRecordRaw } from 'vue-router';

export const authRoutes: RouteRecordRaw[] = [
  {
    path: '/auth',
    component: () => import('layouts/PublicLayout.vue'),
    meta: { requiresAuth: false },
    children: [
      {
        path: 'login',
        name: 'auth.login',
        component: () => import('pages/auth/LoginPage.vue'),
      },
      {
        path: 'verify',
        name: 'auth.verify',
        component: () => import('pages/auth/AuthVerifyPage.vue'),
      },
    ],
  },
];
