<template>
  <div>
    <!-- Backdrop/Overlay para mobile -->
    <transition name="fade">
      <div v-if="isOpen && isMobile" class="drawer-backdrop" @click="closeDrawer" />
    </transition>

    <!-- Sidebar -->
    <div
      class="discord-sidebar"
      :class="{ 'is-hidden': isMobile && !isOpen, 'mobile-open': isMobile && isOpen }"
    >
      <!-- Coluna 1: Times -->
      <TeamsBar
        :teams="teamWithMember"
        :selection="selection"
        @select="handleSelect"
        @create-team="createTeam"
      />

      <!-- Coluna 2: Menu do item selecionado -->
      <HomeMenu
        v-if="selection.type === 'home'"
        :current-route-name="currentRouteName"
        @navigate="navigateTo"
      />

      <ProfileMenu
        v-else-if="selection.type === 'profile'"
        :current-route-name="currentRouteName"
        @navigate="navigateTo"
      />

      <TeamMenu
        v-else-if="selection.type === 'team'"
        :active-team="activeTeam"
        :has-admin-access="hasAdminAccess"
        :is-owner="isOwner"
        :general-menu-items="generalMenuItems"
        :admin-menu-items="adminMenuItems"
        :owner-menu-items="ownerMenuItems"
        :current-route-name="currentRouteName"
        @navigate="navigateTo"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import TeamsBar from 'src/layouts/app-layout/left-drawer/TeamsBar.vue';
import HomeMenu from 'src/layouts/app-layout/left-drawer/HomeMenu.vue';
import ProfileMenu from 'src/layouts/app-layout/left-drawer/ProfileMenu.vue';
import TeamMenu from 'src/layouts/app-layout/left-drawer/TeamMenu.vue';
import type { MenuItem, DrawerSelection } from 'src/layouts/app-layout/left-drawer/types';
import { sessionStore } from 'src/services/stores/SessionStore';
import type { TeamWithMember } from '@scorely/api/modules/team/team/team.schemas';

export default defineComponent({
  name: 'LeftDrawerComponent',

  components: {
    TeamsBar,
    HomeMenu,
    ProfileMenu,
    TeamMenu,
  },

  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
  },

  emits: ['update:modelValue'],

  data() {
    return {
      selection: { type: 'home' } as DrawerSelection,

      // Mock data - substituir por store/API
    };
  },

  computed: {
    isOpen(): boolean {
      return this.modelValue;
    },

    isMobile(): boolean {
      return this.$q.screen.lt.md;
    },

    currentRouteName(): string | symbol | null | undefined {
      return this.$route.name;
    },

    activeTeam(): TeamWithMember | null {
      if (this.selection.type !== 'team') return null;
      const { teamId } = this.selection;
      return this.teamWithMember.find((t) => t.id === teamId) || null;
    },

    hasAdminAccess(): boolean {
      return this.activeTeam?.member.role === 'owner' || this.activeTeam?.member.role === 'admin';
    },

    isOwner(): boolean {
      return this.activeTeam?.member.role === 'owner';
    },

    activeTeamId(): string {
      return this.selection.type === 'team' ? this.selection.teamId : '';
    },

    generalMenuItems(): MenuItem[] {
      return [
        {
          key: 'dashboard',
          label: 'Dashboard',
          icon: 'dashboard',
          routeName: 'app.team.dashboard',
          params: { teamId: this.activeTeamId },
        },
        {
          key: 'championships',
          label: 'Campeonatos',
          icon: 'emoji_events',
          routeName: 'app.team.championships',
          params: { teamId: this.activeTeamId },
        },
        {
          key: 'calendar',
          label: 'Calendário',
          icon: 'event',
          routeName: 'app.team.calendar',
          params: { teamId: this.activeTeamId },
        },
      ];
    },

    adminMenuItems(): MenuItem[] {
      return [
        {
          key: 'members',
          label: 'Membros',
          icon: 'group',
          routeName: 'app.team.members',
          params: { teamId: this.activeTeamId },
        },
        {
          key: 'invites',
          label: 'Convites',
          icon: 'mail',
          routeName: 'app.team.invites',
          params: { teamId: this.activeTeamId },
        },
      ];
    },

    ownerMenuItems(): MenuItem[] {
      return [
        {
          key: 'settings',
          label: 'Configurações',
          icon: 'settings',
          routeName: 'app.team.settings',
          params: { teamId: this.activeTeamId },
        },
        {
          key: 'billing',
          label: 'Faturamento',
          icon: 'payments',
          routeName: 'app.team.billing',
          params: { teamId: this.activeTeamId },
        },
      ];
    },
    teamWithMember(): TeamWithMember[] {
      return sessionStore.teamWithMember;
    },
  },

  methods: {
    closeDrawer() {
      this.$emit('update:modelValue', false);
    },

    handleSelect(newSelection: DrawerSelection) {
      this.selection = newSelection;

      if (newSelection.type === 'home') {
        void this.$router.push({ name: 'app.index' });
      } else if (newSelection.type === 'profile') {
        void this.$router.push({ name: 'app.profile' });
      } else if (newSelection.type === 'team') {
        void this.$router.push({ name: 'app.team', params: { teamId: newSelection.teamId } });
      }

      if (this.isMobile) {
        this.closeDrawer();
      }
    },

    navigateTo(routeName: string, params?: Record<string, string>) {
      void this.$router.push(params ? { name: routeName, params } : { name: routeName });

      if (this.isMobile) {
        this.closeDrawer();
      }
    },

    async createTeam() {
      await this.$load.execute('create-team', async () => {
        await sessionStore.createTeam();
      });
    },
  },
});
</script>

<style scoped>
/* Backdrop overlay */
.drawer-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 1999;
}

.discord-sidebar {
  display: flex;
  height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2000;
  transition: transform 0.3s ease;
}

.discord-sidebar.is-hidden {
  transform: translateX(-100%);
}

.discord-sidebar.mobile-open {
  transform: translateX(0);
}

/* Transições */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
