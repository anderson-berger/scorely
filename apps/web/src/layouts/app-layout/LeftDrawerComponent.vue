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
      <!-- Coluna 1: Times (barra estreita estilo Discord) -->
      <div class="teams-bar">
        <q-scroll-area class="fit">
          <div class="column items-center q-py-sm">
            <!-- Home/Dashboard geral -->
            <div class="team-item-wrapper q-mb-xs">
              <div class="pill-indicator" :class="{ active: !activeTeamId, hovered: homeHovered }" />
              <q-btn
                flat
                class="team-btn home-btn"
                :class="{ active: !activeTeamId }"
                @click="goHome"
                @mouseenter="homeHovered = true"
                @mouseleave="homeHovered = false"
              >
                <q-icon name="home" size="24px" />
                <q-tooltip anchor="center right" self="center left" :offset="[12, 0]">
                  Início
                </q-tooltip>
              </q-btn>
            </div>

            <q-separator dark class="teams-separator" />

            <!-- Times do usuário -->
            <template v-for="team in teams" :key="team.id">
              <div class="team-item-wrapper">
                <div
                  class="pill-indicator"
                  :class="{
                    active: team.id === activeTeamId,
                    hovered: hoveredTeamId === team.id && team.id !== activeTeamId,
                  }"
                />
                <q-btn
                  flat
                  class="team-btn"
                  :class="{ active: team.id === activeTeamId }"
                  @click="selectTeam(team)"
                  @mouseenter="hoveredTeamId = team.id"
                  @mouseleave="hoveredTeamId = null"
                >
                  <q-avatar size="48px" :class="{ 'avatar-active': team.id === activeTeamId }">
                    <img v-if="team.logo" :src="team.logo" alt="Logo" />
                    <span v-else class="text-uppercase text-weight-bold">
                      {{ team.name.substring(0, 2) }}
                    </span>
                  </q-avatar>
                  <q-tooltip anchor="center right" self="center left" :offset="[12, 0]">
                    <div class="text-weight-bold">{{ team.name }}</div>
                    <div class="text-caption text-grey-4">{{ getRoleLabel(team.role) }}</div>
                  </q-tooltip>
                </q-btn>
              </div>
            </template>

            <q-separator dark class="teams-separator" />

            <!-- Botão criar time -->
            <div class="team-item-wrapper">
              <div class="pill-indicator" :class="{ hovered: createHovered }" />
              <q-btn
                flat
                class="team-btn add-btn"
                @click="createTeam"
                @mouseenter="createHovered = true"
                @mouseleave="createHovered = false"
              >
                <q-icon name="add" size="24px" color="green-4" />
                <q-tooltip anchor="center right" self="center left" :offset="[12, 0]">
                  Criar novo time
                </q-tooltip>
              </q-btn>
            </div>
          </div>
        </q-scroll-area>
      </div>

      <!-- Coluna 2: Menu do time selecionado -->
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
              <q-item-label header class="text-grey-5 text-uppercase text-caption">
                Geral
              </q-item-label>

              <q-item
                v-for="item in generalMenuItems"
                :key="item.key"
                clickable
                v-ripple
                :active="isActiveRoute(item.routeName)"
                active-class="menu-item-active"
                class="menu-item"
                @click="navigateTo(item.routeName, item.params)"
              >
                <q-item-section avatar>
                  <q-icon :name="item.icon" size="20px" />
                </q-item-section>
                <q-item-section>{{ item.label }}</q-item-section>
              </q-item>

              <!-- Seção administração (apenas owner/admin) -->
              <template v-if="hasAdminAccess">
                <q-item-label header class="text-grey-5 text-uppercase text-caption q-mt-md">
                  Administração
                </q-item-label>

                <q-item
                  v-for="item in adminMenuItems"
                  :key="item.key"
                  clickable
                  v-ripple
                  :active="isActiveRoute(item.routeName)"
                  active-class="menu-item-active"
                  class="menu-item"
                  @click="navigateTo(item.routeName, item.params)"
                >
                  <q-item-section avatar>
                    <q-icon :name="item.icon" size="20px" />
                  </q-item-section>
                  <q-item-section>{{ item.label }}</q-item-section>
                </q-item>
              </template>

              <!-- Seção configurações (apenas owner) -->
              <template v-if="isOwner">
                <q-item-label header class="text-grey-5 text-uppercase text-caption q-mt-md">
                  Configurações
                </q-item-label>

                <q-item
                  v-for="item in ownerMenuItems"
                  :key="item.key"
                  clickable
                  v-ripple
                  :active="isActiveRoute(item.routeName)"
                  active-class="menu-item-active"
                  class="menu-item"
                  @click="navigateTo(item.routeName, item.params)"
                >
                  <q-item-section avatar>
                    <q-icon :name="item.icon" size="20px" />
                  </q-item-section>
                  <q-item-section>{{ item.label }}</q-item-section>
                </q-item>
              </template>
            </q-list>
          </q-scroll-area>
        </template>

        <!-- Placeholder se nenhum time selecionado -->
        <div v-else class="no-team-selected">
          <q-icon name="groups" size="48px" color="grey-7" />
          <p class="text-grey-5 q-mt-md">Selecione um time</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

interface Team {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  logo: string | null;
}

interface MenuItem {
  key: string;
  label: string;
  icon: string;
  routeName: string;
  params?: Record<string, string>;
}

export default defineComponent({
  name: 'LeftDrawerComponent',

  components: {},

  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
  },

  emits: ['update:modelValue'],

  data() {
    return {
      activeTeamId: null as string | null,
      hoveredTeamId: null as string | null,
      homeHovered: false,
      createHovered: false,

      // Dados mockados (substituir por store/API)
      teams: [
        { id: '1', name: 'Alpha Team', role: 'owner', logo: null },
        { id: '2', name: 'Beta Esports', role: 'admin', logo: null },
        { id: '3', name: 'Gamma FC', role: 'member', logo: null },
        { id: '4', name: 'Delta Warriors', role: 'owner', logo: null },
        { id: '5', name: 'Epsilon Squad', role: 'member', logo: null },
        { id: '6', name: 'Zeta Gaming', role: 'member', logo: null },
      ] as Team[],
    };
  },

  computed: {
    isOpen(): boolean {
      return this.modelValue;
    },

    isMobile(): boolean {
      return this.$q.screen.lt.md;
    },

    activeTeam(): Team | null {
      return this.teams.find((t) => t.id === this.activeTeamId) || null;
    },

    hasAdminAccess(): boolean {
      return this.activeTeam?.role === 'owner' || this.activeTeam?.role === 'admin';
    },

    isOwner(): boolean {
      return this.activeTeam?.role === 'owner';
    },

    generalMenuItems(): MenuItem[] {
      return [
        {
          key: 'dashboard',
          label: 'Dashboard',
          icon: 'dashboard',
          routeName: 'app.team.dashboard',
          params: { teamId: this.activeTeamId || '' },
        },
        {
          key: 'championships',
          label: 'Campeonatos',
          icon: 'emoji_events',
          routeName: 'app.team.championships',
          params: { teamId: this.activeTeamId || '' },
        },
        {
          key: 'calendar',
          label: 'Calendário',
          icon: 'event',
          routeName: 'app.team.calendar',
          params: { teamId: this.activeTeamId || '' },
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
          params: { teamId: this.activeTeamId || '' },
        },
        {
          key: 'invites',
          label: 'Convites',
          icon: 'mail',
          routeName: 'app.team.invites',
          params: { teamId: this.activeTeamId || '' },
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
          params: { teamId: this.activeTeamId || '' },
        },
        {
          key: 'billing',
          label: 'Faturamento',
          icon: 'payments',
          routeName: 'app.team.billing',
          params: { teamId: this.activeTeamId || '' },
        },
      ];
    },
  },

  created() {
    // Seleciona o primeiro time ao iniciar
    if (this.teams.length > 0) {
      this.activeTeamId = this.teams[0].id;
    }
  },

  mounted() {},

  methods: {
    closeDrawer() {
      this.$emit('update:modelValue', false);
    },

    selectTeam(team: Team) {
      this.activeTeamId = team.id;
      this.$router.push({ name: 'app.team', params: { teamId: team.id } });
    },

    goHome() {
      this.activeTeamId = null;
      this.$router.push({ name: 'app.index' });
      if (this.isMobile) {
        this.closeDrawer();
      }
    },

    navigateTo(routeName: string, params?: Record<string, string>) {
      this.$router.push({ name: routeName, params });
      if (this.isMobile) {
        this.closeDrawer();
      }
    },

    isActiveRoute(routeName: string): boolean {
      return this.$route.name === routeName;
    },

    getRoleLabel(role: string): string {
      const labels: Record<string, string> = {
        owner: 'Proprietário',
        admin: 'Administrador',
        member: 'Membro',
      };
      return labels[role] || role;
    },

    createTeam() {
      // TODO: Abrir modal ou navegar para criação de time
      console.log('Criar novo time');
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

/* Barra de times (estilo Discord) */
.teams-bar {
  width: 72px;
  background: #1e1f22;
  padding-top: 12px;
  flex-shrink: 0;
}

.team-item-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-bottom: 8px;
}

/* Pill indicator (barra lateral estilo Discord) */
.pill-indicator {
  position: absolute;
  left: 0;
  width: 4px;
  height: 8px;
  background: white;
  border-radius: 0 4px 4px 0;
  transition: height 0.2s ease;
  opacity: 0;
}

.pill-indicator.hovered {
  opacity: 1;
  height: 20px;
}

.pill-indicator.active {
  opacity: 1;
  height: 40px;
}

.team-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #313338;
  transition: all 0.2s ease;
  padding: 0;
  min-height: 48px;
}

.team-btn:hover,
.team-btn.active {
  border-radius: 16px;
  background: #5865f2;
}

.team-btn .q-avatar {
  transition: border-radius 0.2s ease;
}

.team-btn:hover .q-avatar,
.team-btn.active .q-avatar {
  border-radius: 16px;
}

.home-btn {
  background: #313338;
  color: #3ba55d;
}

.home-btn:hover,
.home-btn.active {
  background: #3ba55d;
  color: white;
}

.add-btn {
  background: #313338;
}

.add-btn:hover {
  background: #3ba55d;
  border-radius: 16px;
}

.add-btn:hover .q-icon {
  color: white !important;
}

.teams-separator {
  width: 32px;
  height: 2px;
  background: #35363c;
  margin: 4px 0 12px;
  border-radius: 1px;
}

/* Painel do menu */
.menu-panel {
  width: 240px;
  background: #2b2d31;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.menu-header {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: white;
  height: 48px;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2);
}

.menu-scroll {
  flex: 1;
  height: calc(100vh - 49px);
}

.menu-item {
  margin: 2px 8px;
  border-radius: 4px;
  color: #949ba4;
  min-height: 34px;
  padding: 6px 8px;
}

.menu-item:hover {
  background: rgba(79, 84, 92, 0.4);
  color: #dbdee1;
}

.menu-item-active {
  background: rgba(79, 84, 92, 0.6) !important;
  color: white !important;
}

.menu-item .q-item__section--avatar {
  min-width: 32px;
}

.no-team-selected {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
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
