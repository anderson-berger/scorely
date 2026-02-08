<!-- components/LeftDrawer/TeamMenu.vue -->
<template>
  <div class="menu-panel">
    <template v-if="activeTeam">
      <!-- Header do time -->
      <div class="menu-header">
        <span class="text-weight-bold text-subtitle1">{{ activeTeam.name }}</span>
        <q-btn flat dense round icon="more_horiz" size="sm" color="grey-4" />
      </div>

      <q-separator dark />

      <!-- Menu items -->
      <q-scroll-area class="menu-scroll">
        <q-list padding>
          <!-- Seção geral -->
          <MenuSection
            title="Geral"
            :items="generalMenuItems"
            :current-route-name="currentRouteName"
            @navigate="navigate"
          />

          <!-- Seção administração (apenas owner/admin) -->
          <MenuSection
            v-if="hasAdminAccess"
            title="Administração"
            :items="adminMenuItems"
            :current-route-name="currentRouteName"
            class="q-mt-md"
            @navigate="navigate"
          />

          <!-- Seção configurações (apenas owner) -->
          <MenuSection
            v-if="isOwner"
            title="Configurações"
            :items="ownerMenuItems"
            :current-route-name="currentRouteName"
            class="q-mt-md"
            @navigate="navigate"
          />
        </q-list>
      </q-scroll-area>
    </template>

    <!-- Placeholder se nenhum time selecionado -->
    <div v-else class="no-team-selected">
      <q-icon name="groups" size="48px" color="grey-7" />
      <p class="text-grey-5 q-mt-md">Selecione um time</p>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import MenuSection from 'src/layouts/app-layout/left-drawer/team-menu/MenuSection.vue';
import type { MenuItem } from 'src/layouts/app-layout/left-drawer/types';
import type { TeamWithMember } from '@scorely/api/modules/team/team/team.schemas';

export default defineComponent({
  name: 'TeamMenu',

  components: {
    MenuSection,
  },

  props: {
    activeTeam: {
      type: Object as PropType<TeamWithMember | null>,
      default: null,
    },
    hasAdminAccess: {
      type: Boolean,
      required: true,
    },
    isOwner: {
      type: Boolean,
      required: true,
    },
    generalMenuItems: {
      type: Array as PropType<MenuItem[]>,
      required: true,
    },
    adminMenuItems: {
      type: Array as PropType<MenuItem[]>,
      required: true,
    },
    ownerMenuItems: {
      type: Array as PropType<MenuItem[]>,
      required: true,
    },
    currentRouteName: {
      type: [String, Symbol] as PropType<string | symbol | null | undefined>,
      default: null,
    },
  },

  emits: ['navigate'],

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

.no-team-selected {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--sidebar-section-text);
}
</style>
