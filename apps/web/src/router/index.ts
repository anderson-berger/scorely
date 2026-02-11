import { defineRouter } from '#q-app/wrappers';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';
import routes from './routes';
// router/guards.ts
import { authStore } from 'src/services/stores/AuthStore';
import { initSession, resetSession } from 'src/services/stores/SessionBootstrap';

export default defineRouter(function (/* { store, ssrContext } */) {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory;

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createHistory(process.env.VUE_ROUTER_BASE),
  });

  Router.beforeEach(async (to, from, next) => {
    const requiresAuth = to.meta.requiresAuth ?? true;

    if (!requiresAuth) {
      return next();
    }

    // Verificar autenticação
    if (!authStore.isAuthenticated) {
      return next({ name: 'auth.login', query: { redirect: to.fullPath } });
    }

    // Inicializar session apenas uma vez
    try {
      await initSession();
    } catch {
      // Token inválido ou expirado
      authStore.clearTokens();
      resetSession();
      return next({ name: 'auth.login', query: { redirect: to.fullPath } });
    }

    // Bloquear rotas com status restrito
    const blockedStatuses = ['soon', 'disabled', 'deprecated'];
    if (to.meta.status && blockedStatuses.includes(to.meta.status as string)) {
      return next({ name: 'app.home' });
    }

    next();
  });

  return Router;
});
