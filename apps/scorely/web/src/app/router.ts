import { guardDecision } from '@scorely/web/src/app/guard';
import { useAuthStore } from '@scorely/web/src/modules/auth/auth.store';
import { authRoutes } from '@scorely/web/src/modules/auth/routes';
import { groupsRoutes } from '@scorely/web/src/modules/groups/routes';
import { usersRoutes } from '@scorely/web/src/modules/users/routes';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

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
    component: () => import('@scorely/web/src/layouts/MainLayout.vue'),
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
