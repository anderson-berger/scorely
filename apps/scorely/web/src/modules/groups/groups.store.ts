import type { Group, MyGroup } from '@scorely/contracts';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { groupsApi } from './groups.api';

/** Os grupos da tela de Grupos: os ativos, cada um com o resumo do jogo atual, e os arquivados (GRP-27), na ordem da api. */
export const useGroupsStore = defineStore('groups', () => {
  const mine = ref<MyGroup[]>([]);
  const archived = ref<Group[]>([]);
  const loaded = ref(false);

  async function loadMine() {
    const [active, old] = await Promise.all([groupsApi.mine(), groupsApi.archived()]);
    mine.value = active;
    archived.value = old;
    loaded.value = true;
  }

  function reset() {
    mine.value = [];
    archived.value = [];
    loaded.value = false;
  }

  return { mine, archived, loaded, loadMine, reset };
});
