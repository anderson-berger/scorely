<script lang="ts">
import { defineComponent } from 'vue';

/** − valor + com alvos de 44px (plano 008, D5). Quem usa decide o passo: o componente só emite a direção. */
export default defineComponent({
  name: 'HoursStepper',

  props: {
    value: { type: Number, required: true },
    unit: { type: String, default: '' },
    decLabel: { type: String, required: true },
    incLabel: { type: String, required: true },
    disable: { type: Boolean, default: false },
  },

  emits: ['step'],
});
</script>

<template>
  <div class="stepper">
    <button type="button" class="step" :aria-label="decLabel" :disabled="disable" @click="$emit('step', -1)">−</button>
    <div class="sc-number value" aria-live="polite">
      {{ value }}<span v-if="unit" class="unit">{{ unit }}</span>
    </div>
    <button type="button" class="step" :aria-label="incLabel" :disabled="disable" @click="$emit('step', 1)">+</button>
  </div>
</template>

<style scoped>
.stepper {
  display: flex;
  align-items: center;
}

.step {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  border: 1px solid var(--sc-line-strong);
  background: var(--sc-bg);
  color: var(--sc-text);
  font: 600 20px var(--sc-font-body);
  cursor: pointer;
}

.step:disabled {
  opacity: 0.4;
  cursor: default;
}

.value {
  min-width: 60px;
  text-align: center;
  font-size: 26px;
}

.unit {
  font-size: 16px;
  color: var(--sc-muted);
}
</style>
