<template>
  <q-badge :color="color" :label="label" class="match-status-badge text-weight-medium" />
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { MatchStatus } from 'src/modules/match/types/match.ui.types';
import { STATUS_LABEL, STATUS_COLOR } from 'src/modules/match/types/match.ui.types';

export default defineComponent({
  name: 'MatchStatusBadge',

  props: {
    status: {
      type: String as PropType<MatchStatus>,
      required: true,
    },
  },

  computed: {
    label(): string {
      return STATUS_LABEL[this.status];
    },
    color(): string {
      return STATUS_COLOR[this.status];
    },
  },
});
</script>

<style scoped>
.match-status-badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
}
</style>
