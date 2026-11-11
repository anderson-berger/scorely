import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/modules/auth/auth.store';
import { authRoutes } from '@/modules/auth/routes';
import { groupsRoutes } from '@/modules/groups/routes';
import { usersRoutes } from '@/modules/users/routes';
import { guardDecision } from './guard';

declare module 'vue-router' {
  interface RouteMeta {
    /** Acessível sem login. */
    public?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  ...authRoutes,
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [...usersRoutes, ...groupsRoutes],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({ history: createWebHistory(), routes });

// A regra fica em `guard.ts` (testada). Aqui só carrega o usuário antes de decidir.
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!to.meta.public && auth.isAuthenticated && !auth.user) {
    try {
      await auth.loadMe();
    } catch {
      // 401 sem conseguir renovar: o http já encerrou a sessão (o guard manda para o login).
    }
  }
  return guardDecision({ to, isAuthenticated: auth.isAuthenticated, needsProfile: auth.needsProfile });
});
