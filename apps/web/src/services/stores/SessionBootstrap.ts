import { ref } from 'vue';
import { userStore } from 'src/services/stores/UserStore';
import { teamStore } from 'src/services/stores/TeamStore';

const isInitialized = ref(false);

export async function initSession() {
  if (isInitialized.value) return;

  await Promise.all([userStore.fetchUser(), teamStore.fetchTeams()]);

  isInitialized.value = true;
}

export function resetSession() {
  userStore.reset();
  teamStore.reset();
  isInitialized.value = false;
}

export function useSessionBootstrap() {
  return {
    isInitialized,
    initSession,
    resetSession,
  };
}
