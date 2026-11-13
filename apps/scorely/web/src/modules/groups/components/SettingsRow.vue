<script lang="ts">
import { defineComponent } from 'vue';

/**
 * Uma linha da lista dos Ajustes (GRP-29): o nome, o resumo do valor de agora e a seta. Tocar abre o lugar de mudar.
 * O resumo vem pronto (`summary`) ou pelo slot (ex.: as miniaturas do logo e da capa).
 */
export default defineComponent({
  name: 'SettingsRow',

  props: {
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    icon: { type: String, default: '' },
  },

  emits: { open: () => true },
});
</script>

<template>
  <button type="button" class="settings-row" @click="$emit('open')">
    <q-icon v-if="icon" :name="icon" size="22px" class="icon" aria-hidden="true" />
    <span class="text">
      <span class="sc-display title">{{ title }}</span>
      <span class="sc-caption summary">
        <slot>{{ summary }}</slot>
      </span>
    </span>
    <q-icon name="chevron_right" size="22px" class="chevron" aria-hidden="true" />
  </button>
</template>

<style scoped>
.settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  padding: 12px 14px;
  border: 0;
  border-bottom: 1px solid var(--sc-line);
  background: transparent;
  color: var(--sc-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.settings-row:hover,
.settings-row:focus-visible {
  background: var(--sc-bg);
}

.icon {
  color: var(--sc-accent);
  flex-shrink: 0;
}

.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.title {
  font-size: 18px;
}

.summary {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  color: var(--sc-muted);
  flex-shrink: 0;
}
</style>
