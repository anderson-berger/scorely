import { defineRouter } from '#q-app/wrappers';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';
import { publicRoutes } from './routes/public.routes';
import { authRoutes } from './routes/auth.routes';
import { appRoutes } from './routes/app.routes';
import { authGuard } from './guards/authGuard';

export default defineRouter(function () {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory;

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes: [
      ...publicRoutes,
      ...authRoutes,
      ...appRoutes,
      {
        path: '/:catchAll(.*)*',
        component: () => import('pages/ErrorNotFound.vue'),
        meta: { requiresAuth: false },
      },
    ],
    history: createHistory(process.env.VUE_ROUTER_BASE),
  });

  Router.beforeEach(authGuard);

  return Router;
});
