<script lang="ts">
import AccountMenu from '@scorely/web/src/layouts/AccountMenu.vue';
import SidebarLinks from '@scorely/web/src/layouts/SidebarLinks.vue';
import NotificationBell from '@scorely/web/src/modules/notifications/components/NotificationBell.vue';
import { defineComponent } from 'vue';

/**
 * GRV-13: a barra lateral fixa a partir de 600px, com 240px a partir de 1024px e só com os ícones (72px) antes disso.
 * No topo, o logo (Meus grupos), o sino e a conta; embaixo, os links, que rolam.
 */
export default defineComponent({
  name: 'AppSidebar',

  components: { AccountMenu, NotificationBell, SidebarLinks },

  computed: {
    compact(): boolean {
      return this.$q.screen.sm;
    },
  },
});
</script>

<template>
  <aside :class="['sidebar', { compact }]">
    <div class="top">
      <router-link :to="{ name: 'groups' }" class="brand sc-display" :aria-label="$t('groups.title')">
        <span v-if="compact" aria-hidden="true">s<span class="sc-accent">ly</span></span>
        <span v-else aria-hidden="true">score<span class="sc-accent">ly</span></span>
        <q-tooltip v-if="compact" anchor="center right" self="center left" :offset="[8, 0]">
          {{ $t('groups.title') }}
        </q-tooltip>
      </router-link>
      <NotificationBell side="right" />
      <AccountMenu side="right" />
    </div>

    <SidebarLinks :compact="compact" class="scroll" />
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 2000;
  width: 240px;
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: var(--sc-surface);
  border-right: 1px solid var(--sc-line);
}

.top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--sc-line);
}

.brand {
  flex: 1;
  min-height: 44px;
  display: flex;
  align-items: center;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--sc-text);
  text-decoration: none;
}

.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}

.sidebar.compact {
  width: 72px;
  padding: 12px 0;
}

.compact .top {
  flex-direction: column;
}

.compact .brand {
  flex: none;
  width: 48px;
  justify-content: center;
  font-size: 22px;
}

.compact .scroll {
  padding-top: 8px;
}
</style>
