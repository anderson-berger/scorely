import type { Group } from '@scorely/contracts';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { defineStore } from 'pinia';
import { ref } from 'vue';

/** Os meus grupos (GRV-05), na ordem da api. */
export const useGroupsStore = defineStore('groups', () => {
  const mine = ref<Group[]>([]);
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
