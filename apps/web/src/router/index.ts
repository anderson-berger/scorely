import { defineRouter } from '#q-app/wrappers';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';
import routes from './routes';
import AuthService from 'src/services/api/AuthService';

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

  Router.beforeEach((to, _from, next) => {
    const isAuthenticated = AuthService.isAuthenticated();

    // 🔒 Rotas privadas - redireciona para login
    if (to.meta.requiresAuth && !isAuthenticated) {
      return next({
        name: 'auth.login',
        query: { redirect: to.fullPath },
      });
    }

    // 🔐 Usuário logado tentando acessar auth (exceto verify)
    if (isAuthenticated && to.path.startsWith('/auth') && to.name !== 'auth.verify') {
      return next({ name: 'app.index' });
    }

    return next();
  });

  return Router;
});
