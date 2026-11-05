import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/modules/auth/auth.store';
import { authRoutes } from '@/modules/auth/routes';
import { homeRoutes } from '@/modules/home/routes';
import { usersRoutes } from '@/modules/users/routes';

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
    children: [...homeRoutes, ...usersRoutes],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({ history: createWebHistory(), routes });

// Sem sessão → login (voltando depois para onde ia). Primeiro acesso sem nome → perfil.
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.meta.public) return to.name === 'login' && auth.isAuthenticated ? { name: 'home' } : true;
  if (!auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } };

  if (!auth.user) {
    try {
      await auth.loadMe();
    } catch {
      // 401 sem conseguir renovar: o http já encerrou a sessão.
      if (!auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } };
    }
  }
  if (auth.needsProfile && to.name !== 'profile') return { name: 'profile', query: { welcome: '1' } };
  return true;
});
