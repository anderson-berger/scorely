<template>
  <div class="menu-panel">
    <!-- Header -->
    <div class="menu-header">
      <span class="text-weight-bold text-subtitle1">Início</span>
    </div>

    <q-separator dark />

    <!-- Menu items -->
    <q-scroll-area class="menu-scroll">
      <q-list padding>
        <MenuSection
          title="Principal"
          :items="mainMenuItems"
          :current-route-name="currentRouteName"
          @navigate="navigate"
        />

        <MenuSection
          title="Atividade"
          :items="activityMenuItems"
          :current-route-name="currentRouteName"
          class="q-mt-md"
          @navigate="navigate"
        />
      </q-list>
    </q-scroll-area>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import MenuSection from 'src/layouts/app-layout/left-drawer/team-menu/MenuSection.vue';
import type { MenuItem } from 'src/layouts/app-layout/left-drawer/types';

export default defineComponent({
  name: 'HomeMenu',

  components: {
    MenuSection,
  },

  props: {
    currentRouteName: {
      type: [String, Symbol] as PropType<string | symbol | null | undefined>,
      default: null,
    },
  },

  emits: ['navigate'],

  computed: {
    mainMenuItems(): MenuItem[] {
      return [
        {
          key: 'dashboard',
          label: 'Dashboard',
          icon: 'dashboard',
          routeName: 'app.index',
        },
        {
          key: 'feed',
          label: 'Feed',
          icon: 'feed',
          routeName: 'app.feed',
        },
      ];
    },

    activityMenuItems(): MenuItem[] {
      return [
        {
          key: 'notifications',
          label: 'Notificações',
          icon: 'notifications',
          routeName: 'app.notifications',
        },
        {
          key: 'invites',
          label: 'Convites',
          icon: 'mail',
          routeName: 'app.invites',
        },
      ];
    },
  },

  methods: {
    navigate(routeName: string, params?: Record<string, string>) {
      this.$emit('navigate', routeName, params);
    },
  },
});
</script>

<style scoped>
.menu-panel {
  width: 240px;
  background: var(--sidebar-menu-bg);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.menu-header {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--sidebar-menu-header-bg);
  color: var(--sidebar-menu-header-text);
  height: 48px;
  box-shadow: 0 1px 0 var(--sidebar-menu-header-shadow);
}

.menu-scroll {
  flex: 1;
  height: calc(100vh - 49px);
}
</style>
