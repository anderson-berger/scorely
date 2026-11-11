<script lang="ts">
import { defineComponent } from 'vue';

/** Painel que sobe de baixo, com alça e título (plano 008, D5). `hide` avisa quando terminou de fechar. */
export default defineComponent({
  name: 'BottomSheet',

  props: {
    modelValue: { type: Boolean, required: true },
    title: { type: String, required: true },
    persistent: { type: Boolean, default: false },
  },

  emits: ['update:modelValue', 'hide'],
});
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    position="bottom"
    :persistent="persistent"
    @update:model-value="$emit('update:modelValue', $event)"
    @hide="$emit('hide')"
  >
    <div class="sheet" role="dialog" :aria-label="title">
      <div class="grip" aria-hidden="true" />
      <div class="head">
        <h2 class="sc-display title">{{ title }}</h2>
        <slot name="action" />
      </div>
      <slot />
    </div>
  </q-dialog>
</template>

<style scoped>
.sheet {
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  overflow-y: auto;
  background: var(--sc-surface);
  border: 1px solid var(--sc-line);
  border-bottom: 0;
  border-radius: 22px 22px 0 0;
  padding: 10px 16px 24px;
  box-sizing: border-box;
}

.grip {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: var(--sc-line-strong);
  margin: 0 auto 12px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.title {
  font-size: 30px;
  margin: 0;
}
</style>
