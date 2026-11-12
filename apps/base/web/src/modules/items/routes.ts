import type { RouteRecordRaw } from 'vue-router';

export const itemsRoutes: RouteRecordRaw[] = [
  {
    path: 'items',
    name: 'items',
    component: () => import('@base/web/src/modules/items/pages/ItemsPage.vue'),
  },
];
