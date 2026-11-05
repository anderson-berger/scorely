import type { RouteRecordRaw } from 'vue-router';

export const itemsRoutes: RouteRecordRaw[] = [
  { path: 'items', name: 'items', component: () => import('./pages/ItemsPage.vue') },
];
