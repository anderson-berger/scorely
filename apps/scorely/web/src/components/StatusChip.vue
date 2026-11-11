<script lang="ts">
import { defineComponent, type PropType } from 'vue';

export type ChipTone = 'accent' | 'neutral' | 'danger';

/** Etiqueta de estado (lista aberta, cancelado...) no estilo placar (plano 008, D5). */
export default defineComponent({
  name: 'StatusChip',

  props: {
    tone: { type: String as PropType<ChipTone>, default: 'neutral' },
  },
});
</script>

<template>
  <span class="chip" :class="`chip--${tone}`"><slot /></span>
</template>

<style scoped>
.chip {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid transparent;
  white-space: nowrap;
}

.chip--accent {
  background: var(--sc-accent);
  color: var(--sc-on-accent);
}

/* Fundo próprio: o selo também fica sobre a foto de capa e precisa ser legível em cima dela. */
.chip--neutral {
  background: var(--sc-bg);
  color: var(--sc-text);
  border-color: var(--sc-line-strong);
}

.chip--danger {
  background: var(--sc-danger);
  color: var(--sc-on-accent);
}
</style>
