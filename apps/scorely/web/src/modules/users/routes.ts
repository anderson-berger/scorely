import type { RouteRecordRaw } from 'vue-router';

export const usersRoutes: RouteRecordRaw[] = [
  { path: 'profile', name: 'profile', component: () => import('./pages/ProfilePage.vue') },
];
