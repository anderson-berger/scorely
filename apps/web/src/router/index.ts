import { defineRouter } from '#q-app/wrappers';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';
import { publicRoutes } from './routes/public.routes';
import { authRoutes } from './routes/auth.routes';
import { authGuard } from './guards/authGuard';
import homeRoutes from 'src/modules/home/home.routes';
import profileRoutes from 'src/modules/profile/profile.routes';
import teamRoutes from 'src/modules/team/team.routes';
import championshipRoutes from 'src/modules/championship/championship.routes';
import matchRoutes from 'src/modules/match/match.routes';

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
      {
        path: '/app',
        component: () => import('layouts/AppLayout.vue'),
        meta: { requiresAuth: true },
        children: [
          { path: '', redirect: { name: 'app.home' } },
          ...homeRoutes,
          ...profileRoutes,
          ...teamRoutes,
          ...championshipRoutes,
          ...matchRoutes,
        ],
      },
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
