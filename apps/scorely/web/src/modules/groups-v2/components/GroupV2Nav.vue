<script lang="ts">
import { type GroupV2NavItem } from '@scorely/web/src/modules/groups-v2/nav';
import { defineComponent, type PropType } from 'vue';

/**
 * GRV-13: a barra das áreas do grupo. Embaixo da tela no celular e numa coluna à esquerda a partir de 1024px.
 * Trocar de área usa `replace`: o voltar do navegador sai do grupo.
 */
export default defineComponent({
  name: 'GroupV2Nav',

  props: {
    items: { type: Array as PropType<GroupV2NavItem[]>, required: true },
    groupId: { type: String, required: true },
  },

  methods: {
    isActive(item: GroupV2NavItem): boolean {
      return item.active.includes(String(this.$route.name));
    },
  },
});
</script>

<template>
  <nav class="group-nav" :aria-label="$t('groupsV2.nav.label')">
    <router-link
      v-for="item in items"
      :key="item.key"
      :to="{ name: item.to.name, params: { id: groupId } }"
      replace
      :class="['nav-item', { active: isActive(item) }]"
      :aria-current="isActive(item) ? 'page' : undefined"
    >
      <q-icon :name="item.icon" size="24px" aria-hidden="true" />
      <span class="sc-display label">{{ $t(`groupsV2.nav.${item.key}`) }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.group-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  display: flex;
  justify-content: space-around;
  background: var(--sc-surface);
  border-top: 1px solid var(--sc-line);
  padding-bottom: env(safe-area-inset-bottom);
}

.nav-item {
  flex: 1;
  max-width: 120px;
  min-height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--sc-muted);
  text-decoration: none;
}

.label {
  font-size: 14px;
  letter-spacing: 1px;
}

.nav-item.active {
  color: var(--sc-accent);
}

@media (min-width: 1024px) {
  .group-nav {
    position: sticky;
    top: 24px;
    flex-direction: column;
    justify-content: flex-start;
    gap: 4px;
    width: 200px;
    flex-shrink: 0;
    align-self: flex-start;
    padding: 0;
    background: transparent;
    border-top: 0;
  }

  .nav-item {
    max-width: none;
    flex: none;
    min-height: 48px;
    flex-direction: row;
    justify-content: flex-start;
    gap: 12px;
    padding: 0 12px;
    border-radius: 12px;
  }

  .label {
    font-size: 18px;
  }

  .nav-item.active {
    background: var(--sc-line);
  }
}
</style>
