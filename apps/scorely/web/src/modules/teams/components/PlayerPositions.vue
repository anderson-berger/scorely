<script lang="ts">
import type { PlayerPosition } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';

/**
 * As posições de uma pessoa, abaixo do nome (TIM-05): a principal em destaque, depois as outras ("Central · Ponteiro").
 * Para o dono (`editable`), vira um botão que abre o painel; sem posição, mostra "+ Posição". Para os outros, sem posição, nada.
 */
export default defineComponent({
  name: 'PlayerPositions',

  props: {
    positions: { type: Array as PropType<readonly PlayerPosition[] | undefined>, default: undefined },
    editable: { type: Boolean, default: false },
    /** Para o rótulo acessível do botão ("Posições de {name}"). */
    name: { type: String, default: '' },
  },

  emits: { edit: () => true },

  computed: {
    main(): string {
      const first = this.positions?.[0];
      return first ? this.$t(`teams.positions.${first}`) : '';
    },

    others(): string {
      return (this.positions ?? [])
        .slice(1)
        .map((p) => this.$t(`teams.positions.${p}`))
        .join(' · ');
    },
  },
});
</script>

<template>
  <button
    v-if="editable"
    type="button"
    class="positions positions--editable"
    :class="{ 'positions--empty': !main }"
    :aria-label="$t('teams.editPositions', { name })"
    @click.stop="$emit('edit')"
  >
    <template v-if="main">
      <span class="main">{{ main }}</span>
      <span v-if="others" class="others"> · {{ others }}</span>
      <q-icon name="edit" size="14px" class="icon" />
    </template>
    <template v-else>
      <q-icon name="add" size="14px" />
      <span>{{ $t('teams.addPosition') }}</span>
    </template>
  </button>
  <span v-else-if="main" class="positions">
    <span class="main">{{ main }}</span>
    <span v-if="others" class="others"> · {{ others }}</span>
  </span>
</template>

<style scoped>
.positions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--sc-text-2);
}

.main {
  font-weight: 700;
  color: var(--sc-accent);
}

.others {
  overflow: hidden;
  text-overflow: ellipsis;
}

.positions--editable {
  align-self: flex-start;
  min-height: 28px;
  padding: 2px 10px;
  border: 1px solid var(--sc-line-strong);
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
}

.positions--editable:hover {
  border-color: var(--sc-accent);
}

.positions--empty {
  border-style: dashed;
  color: var(--sc-accent);
}

.icon {
  color: var(--sc-muted);
}
</style>
