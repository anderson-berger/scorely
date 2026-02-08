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
import { sessionStore } from 'src/services/stores/SessionStore';

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
    if (!sessionStore.isInitialized) {
      try {
        await sessionStore.init();
      } catch {
        // Token inválido ou expirado
        authStore.clearTokens();
        sessionStore.reset();
        return next({ name: 'auth.login', query: { redirect: to.fullPath } });
      }
    }

    next();
  });

  return Router;
});
