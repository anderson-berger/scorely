import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { itemsRoutes } from '@/modules/items/routes';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [{ path: '', redirect: '/items' }, ...itemsRoutes],
  },
];

export const router = createRouter({ history: createWebHistory(), routes });
