import { itemsRoutes } from '@base/web/src/modules/items/routes';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@base/web/src/layouts/MainLayout.vue'),
    children: [{ path: '', redirect: '/items' }, ...itemsRoutes],
  },
];

export const router = createRouter({ history: createWebHistory(), routes });
