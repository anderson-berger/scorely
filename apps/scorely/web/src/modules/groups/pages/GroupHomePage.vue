<script lang="ts">
import type { Group } from '@scorely/contracts';
import GroupCover from '@scorely/web/src/modules/groups/components/GroupCover.vue';
import { defineComponent, type PropType } from 'vue';

/** GRV-07, 13: o Início do grupo, com a capa, o logo e o nome em destaque. */
export default defineComponent({
  name: 'GroupHomePage',

  components: { GroupCover },

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },
});
</script>

<template>
  <div>
    <GroupCover :group="group" large />
    <h1 class="sc-title">{{ group.name }}</h1>
  </div>
</template>
