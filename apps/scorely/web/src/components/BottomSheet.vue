<script lang="ts">
import { defineComponent } from 'vue';

/**
 * O "painel de baixo" do app (GRV-07): até 599px sobe do pé da tela, com alça; a partir de 600px é
 * um diálogo no centro, com X. `persistent` tira o X e impede fechar. `hide` avisa quando terminou de fechar.
 */
export default defineComponent({
  name: 'BottomSheet',

  props: {
    modelValue: { type: Boolean, required: true },
    title: { type: String, required: true },
    persistent: { type: Boolean, default: false },
  },

  emits: ['update:modelValue', 'hide'],

  computed: {
    centered(): boolean {
      return !this.$q.screen.xs;
    },
  },

  methods: {
    close(): void {
      this.$emit('update:modelValue', false);
    },
  },
});
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    :position="centered ? 'standard' : 'bottom'"
    :persistent="persistent"
    @update:model-value="$emit('update:modelValue', $event)"
    @hide="$emit('hide')"
  >
    <div class="sheet" :class="{ centered }" role="dialog" :aria-label="title">
      <div v-if="!centered" class="grip" aria-hidden="true" />
      <div class="head">
        <h2 class="sc-display title">{{ title }}</h2>
        <div class="head-actions">
          <slot name="action" />
          <q-btn v-if="centered && !persistent" flat round icon="close" :aria-label="$t('app.close')" @click="close" />
        </div>
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

.sheet.centered {
  border-bottom: 1px solid var(--sc-line);
  border-radius: 22px;
  padding: 16px 20px 24px;
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

.head-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.title {
  font-size: 30px;
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
