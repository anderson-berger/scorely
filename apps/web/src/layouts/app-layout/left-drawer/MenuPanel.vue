<template>
  <div class="menu-panel">
    <!-- Header -->
    <div class="menu-header">
      <span class="text-weight-bold text-subtitle1">{{ header }}</span>
    </div>

    <q-separator dark />

    <!-- Menu sections -->
    <q-scroll-area class="menu-scroll">
      <q-list padding>
        <HomeMenu v-if="context === 'home'" />
        <ProfileMenu v-else-if="context === 'profile'" />
        <TeamMenu v-else-if="context === 'team'" :team-id="teamId" :role="teamRole" />
      </q-list>
    </q-scroll-area>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import HomeMenu from 'src/layouts/app-layout/left-drawer/menu-panel/HomeMenu.vue';
import ProfileMenu from 'src/layouts/app-layout/left-drawer/menu-panel/ProfileMenu.vue';
import TeamMenu from 'src/layouts/app-layout/left-drawer/menu-panel/TeamMenu.vue';
import { teamStore } from 'src/services/stores/TeamStore';

export default defineComponent({
  name: 'MenuPanel',

  components: {
    HomeMenu,
    ProfileMenu,
    TeamMenu,
  },

  computed: {
    context(): string {
      return (this.$route.meta.context as string) ?? 'home';
    },

    header(): string {
      if (this.context === 'team') return teamStore.activeTeam?.name ?? 'Time';
      return (this.$route.meta.menuHeader as string) ?? 'Início';
    },

    teamId(): string {
      return teamStore.activeTeamId ?? '';
    },

    teamRole(): string {
      return teamStore.activeTeam?.member?.role ?? '';
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
