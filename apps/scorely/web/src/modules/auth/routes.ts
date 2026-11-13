import type { RouteRecordRaw } from 'vue-router';

/** Fora do layout principal (tela cheia, sem menu). */
export const authRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@scorely/web/src/modules/auth/pages/LoginPage.vue'),
    meta: { public: true },
  },
];
