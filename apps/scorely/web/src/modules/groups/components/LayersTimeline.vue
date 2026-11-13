<script lang="ts">
import type { Game } from '@scorely/contracts';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import { type LayerStep, layerTimeline } from '@scorely/web/src/modules/groups/layers';
import { defineComponent, type PropType } from 'vue';

interface Row {
  key: string;
  name: string;
  state: LayerStep['state'];
  stateLabel: string;
  when: string;
}

/** Abertura da lista para todos, na aba Jogo (plano 015, D15): Membros → Reservas → Convidados. */
export default defineComponent({
  name: 'LayersTimeline',

  props: {
    game: { type: Object as PropType<Game>, required: true },
    now: { type: Date, required: true },
  },

  computed: {
    rows(): Row[] {
      return layerTimeline(this.game, this.now).map((step) => ({
        key: step.key,
        name: this.$t(`groups.layerNames.${step.key}`),
        state: step.state,
        stateLabel: this.$t(`groups.layerState.${step.state}`),
        when: step.at ? formatDateTime(step.at) : '',
      }));
    },
  },
});
</script>

<template>
  <section>
    <h2 class="sc-section">{{ $t('groups.layers') }}</h2>
    <ol class="sc-card steps">
      <li v-for="r in rows" :key="r.key" class="step" :class="`step--${r.state}`">
        <span class="dot" aria-hidden="true" />
        <span class="sc-display name">{{ r.name }}</span>
        <span class="when">{{ r.when }}</span>
        <span class="sc-label state">{{ r.stateLabel }}</span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.steps {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}

.step {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 0 14px;
}

.dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid var(--sc-line-strong);
}

.step--open .dot {
  background: var(--sc-accent);
  border-color: var(--sc-accent);
}

.name {
  font-size: 18px;
  min-width: 96px;
}

.when {
  flex-grow: 1;
  font-size: 13px;
  color: var(--sc-text-2);
}

.state {
  font-size: 11px;
  color: var(--sc-muted);
}

.step--open .state {
  color: var(--sc-accent);
}

.step--off .name,
.step--off .when {
  color: var(--sc-muted);
}
</style>
