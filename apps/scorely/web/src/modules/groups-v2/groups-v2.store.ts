import type { GroupV2 } from '@scorely/contracts';
import { groupsV2Api } from '@scorely/web/src/modules/groups-v2/groups-v2.api';
import { defineStore } from 'pinia';
import { ref } from 'vue';

/** Os meus grupos v2 (GRV-05), na ordem da api. */
export const useGroupsV2Store = defineStore('groups-v2', () => {
  const mine = ref<GroupV2[]>([]);
  const loaded = ref(false);

  async function loadMine() {
    mine.value = await groupsV2Api.mine();
    loaded.value = true;
  }

  function reset() {
    mine.value = [];
    loaded.value = false;
  }

  return { mine, loaded, loadMine, reset };
});
