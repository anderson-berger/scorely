<script lang="ts">
import type { PlayerPosition, Sport } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';
import { makeMain, sportPositions, togglePosition } from '../players';

/** As posições do esporte para marcar, com a estrela da principal (TIM-02, 05, 13). A primeira marcada já é a principal. */
export default defineComponent({
  name: 'PositionsPicker',

  props: {
    modelValue: { type: Array as PropType<PlayerPosition[]>, required: true },
    sport: { type: String as PropType<Sport>, required: true },
  },

  emits: { 'update:modelValue': (_positions: PlayerPosition[]) => true },

  computed: {
    options(): readonly PlayerPosition[] {
      return sportPositions(this.sport);
    },
  },

  methods: {
    label(position: PlayerPosition): string {
      return this.$t(`teams.positions.${position}`);
    },

    toggle(position: PlayerPosition, on: boolean) {
      this.$emit('update:modelValue', togglePosition(this.modelValue, position, on));
    },

    setMain(position: PlayerPosition) {
      this.$emit('update:modelValue', makeMain(this.modelValue, position));
    },
  },
});
</script>

<template>
  <div class="options">
    <div v-for="position in options" :key="position" class="sc-row option">
      <q-checkbox
        :model-value="modelValue.includes(position)"
        :label="label(position)"
        class="check"
        @update:model-value="toggle(position, $event)"
      />
      <template v-if="modelValue.includes(position)">
        <span v-if="modelValue[0] === position" class="sc-label main">
          <q-icon name="star" size="16px" />
          {{ $t('teams.main') }}
        </span>
        <q-btn
          v-else
          flat
          round
          dense
          icon="star_outline"
          class="star"
          :aria-label="$t('teams.makeMain', { position: label(position) })"
          @click="setMain(position)"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.options {
  display: flex;
  flex-direction: column;
}

.option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 48px;
}

.check {
  flex-grow: 1;
}

.main {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--sc-accent);
  padding-right: 8px;
}

.star {
  color: var(--sc-muted);
}
</style>
