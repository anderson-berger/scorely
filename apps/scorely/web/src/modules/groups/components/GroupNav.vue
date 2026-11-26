<script lang="ts">
import type { Group } from '@scorely/contracts';
import { type GroupNavItem } from '@scorely/web/src/modules/groups/nav';
import { defineComponent, type PropType } from 'vue';

/**
 * GRV-13: as áreas do grupo em abas, só com o nome, logo abaixo do topo do grupo. As que não cabem rolam para o lado.
 * Trocar de aba usa `replace`: o voltar do navegador sai do grupo.
 */
export default defineComponent({
  name: 'GroupNav',

  props: {
    items: { type: Array as PropType<GroupNavItem[]>, required: true },
    group: { type: Object as PropType<Group>, required: true },
  },

  watch: {
    async '$route.name'() {
      await this.$nextTick();
      this.showActive();
    },
  },

  mounted() {
    this.showActive();
  },

  methods: {
    isActive(item: GroupNavItem): boolean {
      return item.active.includes(String(this.$route.name));
    },

    /** Na tela estreita, a aba aberta não pode ficar fora da vista. */
    showActive() {
      const root = this.$el as HTMLElement;
      root.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },
  },
});
</script>

<template>
  <nav class="tabs" :aria-label="$t('groups.nav.label')">
    <router-link
      v-for="item in items"
      :key="item.key"
      :to="{ name: item.to.name, params: { id: group.id } }"
      replace
      :class="['sc-display', 'tab', { active: isActive(item) }]"
      :aria-current="isActive(item) ? 'page' : undefined"
    >
      {{ $t(`groups.nav.${item.key}`) }}
    </router-link>
  </nav>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--sc-line);
}

.tab {
  flex-shrink: 0;
  min-height: 48px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 18px;
  letter-spacing: 1px;
  white-space: nowrap;
  color: var(--sc-muted);
  text-decoration: none;
  border-bottom: 2px solid transparent;
}

.tab.active {
  color: var(--sc-accent);
  border-bottom-color: var(--sc-accent);
}

/* O contorno do foco fica dentro da aba: a rolagem cortaria o de fora. */
.tab:focus-visible {
  outline-offset: -2px;
}
</style>
