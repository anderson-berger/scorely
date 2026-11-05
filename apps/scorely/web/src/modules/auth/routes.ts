import type { RouteRecordRaw } from 'vue-router';

/** Fora do layout principal (tela cheia, sem menu). */
export const authRoutes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('./pages/LoginPage.vue'), meta: { public: true } },
];
