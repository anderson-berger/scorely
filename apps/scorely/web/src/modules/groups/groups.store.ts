import type { MyGroup } from '@scorely/contracts';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { groupsApi } from './groups.api';

/** "Meus grupos" da Home, cada um com o resumo do jogo atual. */
export const useGroupsStore = defineStore('groups', () => {
  const mine = ref<MyGroup[]>([]);
  const loaded = ref(false);

  async function loadMine() {
    mine.value = await groupsApi.mine();
    loaded.value = true;
  }

  function reset() {
    mine.value = [];
    loaded.value = false;
  }

  return { mine, loaded, loadMine, reset };
});
