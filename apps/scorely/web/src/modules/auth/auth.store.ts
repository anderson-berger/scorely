import type { UpdateMeInput, User } from '@scorely/contracts';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { applyPreferences } from '@/lib/preferences';
import { session } from '@/lib/session';
import { useGroupsStore } from '../groups/groups.store';
import { usersApi } from '../users/users.api';
import { authApi } from './auth.api';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User>();
  // `session` não é reativo: este ref acompanha se há tokens guardados.
  const hasSession = ref(Boolean(session.get()));

  const isAuthenticated = computed(() => hasSession.value);
  /** Sem nome ainda: o primeiro acesso manda para o perfil. */
  const needsProfile = computed(() => Boolean(user.value && !user.value.name));

  async function login(email: string, code: string) {
    const result = await authApi.verifyCode(email, code);
    session.set(result);
    hasSession.value = true;
    user.value = result.user;
    applyPreferences(result.user);
    return result;
  }

  async function loadMe() {
    user.value = await usersApi.me();
    applyPreferences(user.value);
    return user.value;
  }

  async function updateProfile(patch: UpdateMeInput) {
    user.value = await usersApi.updateMe(patch);
    applyPreferences(user.value);
    return user.value;
  }

  /** Limpa o estado local (usado também quando a sessão expira), inclusive os grupos da conta. */
  function reset() {
    session.clear();
    hasSession.value = false;
    user.value = undefined;
    useGroupsStore().reset();
    applyPreferences();
  }

  async function logout() {
    try {
      await authApi.logout();
    } finally {
      reset();
    }
  }

  return { user, isAuthenticated, needsProfile, login, loadMe, updateProfile, logout, reset };
});
