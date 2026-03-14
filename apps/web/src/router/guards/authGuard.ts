import type { NavigationGuard } from 'vue-router';
import { authStore } from 'src/services/stores/AuthStore';
import { initSession, resetSession } from 'src/services/stores/SessionBootstrap';

export const authGuard: NavigationGuard = async (to, _from, next) => {
  const requiresAuth = to.meta.requiresAuth ?? true;

  if (!requiresAuth) {
    return next();
  }

  if (!authStore.isAuthenticated) {
    return next({ name: 'auth.login', query: { redirect: to.fullPath } });
  }

  try {
    await initSession();
  } catch {
    authStore.clearTokens();
    resetSession();
    return next({ name: 'auth.login', query: { redirect: to.fullPath } });
  }

  const blockedStatuses = ['soon', 'disabled', 'deprecated'];
  if (to.meta.status && blockedStatuses.includes(to.meta.status as string)) {
    return next({ name: 'app.home' });
  }

  next();
};
