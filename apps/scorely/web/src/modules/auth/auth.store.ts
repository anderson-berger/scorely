import type { Me, UpdateMeInput } from '@scorely/contracts';
import { applyPreferences, clearSavedPreferences, updatePreferences } from '@scorely/web/src/lib/preferences';
import { session } from '@scorely/web/src/lib/session';
import { authApi } from '@scorely/web/src/modules/auth/auth.api';
import { useGroupsStore } from '@scorely/web/src/modules/groups/groups.store';
import { usersApi } from '@scorely/web/src/modules/users/users.api';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<Me>();
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
    updatePreferences(result.user.preferences);
    return result;
  }

  async function loadMe() {
    user.value = await usersApi.me();
    updatePreferences(user.value.preferences);
    return user.value;
  }

  async function updateProfile(patch: UpdateMeInput) {
    user.value = await usersApi.updateMe(patch);
    updatePreferences(user.value.preferences);
    return user.value;
  }

  /** Foto de perfil (plano 010): troca ou remove e atualiza o usuário do store. */
  async function setAvatar(file: Blob | null) {
    user.value = file ? await usersApi.uploadAvatar(file) : await usersApi.removeAvatar();
    return user.value;
  }

  /** Limpa o estado local (usado também quando a sessão expira), inclusive os grupos da conta. */
  function reset() {
    session.clear();
    hasSession.value = false;
    user.value = undefined;
    useGroupsStore().reset();
    // USR-14: esquece as preferências da pessoa; volta para o idioma da tela de login e o fuso do navegador.
    clearSavedPreferences();
    applyPreferences();
  }

  async function logout() {
    try {
      await authApi.logout();
    } finally {
      reset();
    }
  }

  return { user, isAuthenticated, needsProfile, login, loadMe, updateProfile, setAvatar, logout, reset };
});
