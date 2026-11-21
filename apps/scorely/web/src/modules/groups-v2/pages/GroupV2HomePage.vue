<script lang="ts">
import type { GroupV2 } from '@scorely/contracts';
import GroupV2Cover from '@scorely/web/src/modules/groups-v2/components/GroupV2Cover.vue';
import { defineComponent, type PropType } from 'vue';

/** GRV-07, 13: o Início do grupo, com a capa, o logo e o nome em destaque. */
export default defineComponent({
  name: 'GroupV2HomePage',

  components: { GroupV2Cover },

  props: {
    group: { type: Object as PropType<GroupV2>, required: true },
  },
});
</script>

<template>
  <div>
    <GroupV2Cover :group="group" large />
    <h1 class="sc-title">{{ group.name }}</h1>
  </div>
</template>
