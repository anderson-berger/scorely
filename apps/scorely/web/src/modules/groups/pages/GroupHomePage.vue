<script lang="ts">
import type { Group } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';

/** GRV-13: a área Início. A capa e o nome ficam no topo do casco (`GroupPage`), acima das abas. */
export default defineComponent({
  name: 'GroupHomePage',

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },
});
</script>

<template>
  <div />
</template>
