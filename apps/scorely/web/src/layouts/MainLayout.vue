<script lang="ts">
import type { User } from '@scorely/contracts';
import { defineComponent } from 'vue';
import { useAuthStore } from '@/modules/auth/auth.store';
import NotificationBell from '@/modules/notifications/components/NotificationBell.vue';
import { useNotificationsStore } from '@/modules/notifications/notifications.store';
import { displayName } from '@/modules/users/user.display';
import { type NavItem, navItems } from './nav';

/** Rotas em que o item Grupos fica destacado: a tela de Grupos e tudo que é de um grupo (plano 013, D2). */
const GROUP_ROUTES = ['groups', 'group', 'group-members', 'group-settings', 'group-create'];

/**
 * Cabeçalho de largura total e menu lateral (plano 013, D9–D11): no celular o drawer abre sobre a tela;
 * a partir de 1024px é um trilho de ícones que o ☰ expande empurrando o conteúdo. O menu é fixo e tem
 * rolagem própria (`L` no `view`), separada da página (plano 015, correção do D18). A conta (Perfil, Sair) fica no avatar.
 */
export default defineComponent({
  name: 'MainLayout',

  components: { NotificationBell },

  setup() {
    return { auth: useAuthStore(), notifications: useNotificationsStore() };
  },

  data() {
    return {
      drawer: false,
      expanded: false,
    };
  },

  computed: {
    items(): NavItem[] {
      return navItems();
    },

    /** A partir de 1024px o drawer fica fixo do lado (trilho). */
    fixed(): boolean {
      return this.$q.screen.gt.sm;
    },

    /** No celular (< 600px) o menu ocupa a tela toda; no resto, 240px (plano 015, correção do D18). */
    drawerWidth(): number {
      return this.$q.screen.xs ? this.$q.screen.width : 240;
    },

    mini(): boolean {
      return this.fixed && !this.expanded;
    },
  },

  methods: {
    displayName(user: User): string {
      return displayName(user);
    },

    initial(s: string): string {
      return s.trim().charAt(0).toUpperCase();
    },

    isActive(item: NavItem): boolean {
      return item.key === 'groups' && GROUP_ROUTES.includes(String(this.$route.name ?? ''));
    },

    /** No desktop expande/recolhe o trilho (empurrando o conteúdo); no celular abre/fecha o drawer. */
    toggleMenu() {
      if (this.fixed) this.expanded = !this.expanded;
      else this.drawer = !this.drawer;
    },

    /** No celular, escolher um item fecha o drawer; no desktop o menu fica como a pessoa deixou. */
    navigated() {
      if (!this.fixed) this.drawer = false;
    },

    async logout() {
      this.notifications.reset();
      await this.auth.logout().catch(() => undefined);
      await this.$router.replace({ name: 'login' });
    },
  },
});
</script>

<template>
  <q-layout view="hHh LpR fFf">
    <q-header class="header">
      <div class="bar">
        <div class="start">
          <button type="button" class="sc-icon-btn menu" :aria-label="$t('nav.open')" @click="toggleMenu">
            <q-icon name="menu" size="22px" />
          </button>
          <router-link :to="{ name: 'groups' }" class="brand sc-display" :aria-label="$t('app.name')">
            score<span class="sc-accent">ly</span>
          </router-link>
        </div>
        <div class="actions">
          <NotificationBell />
          <button v-if="auth.user" type="button" class="sc-icon-btn avatar" :aria-label="$t('nav.account')">
            {{ initial(displayName(auth.user)) }}
            <q-menu anchor="bottom right" self="top right">
              <q-list style="min-width: 220px">
                <q-item>
                  <q-item-section>
                    <q-item-label>{{ displayName(auth.user) }}</q-item-label>
                    <q-item-label caption>{{ auth.user.email }}</q-item-label>
                  </q-item-section>
                </q-item>
                <q-separator />
                <q-item v-close-popup clickable :to="{ name: 'profile' }">
                  <q-item-section avatar><q-icon name="person_outline" /></q-item-section>
                  <q-item-section>{{ $t('nav.profile') }}</q-item-section>
                </q-item>
                <q-item v-close-popup clickable @click="logout">
                  <q-item-section avatar><q-icon name="logout" /></q-item-section>
                  <q-item-section>{{ $t('nav.logout') }}</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </button>
        </div>
      </div>
    </q-header>

    <q-drawer
      v-model="drawer"
      side="left"
      show-if-above
      :breakpoint="1023"
      :width="drawerWidth"
      :mini="mini"
      :mini-width="64"
      class="sc-drawer"
    >
      <!-- No celular o drawer cobre o cabeçalho (e o ☰): a saída fica dentro dele. -->
      <div v-if="!fixed" class="drawer-head">
        <router-link :to="{ name: 'groups' }" class="brand sc-display" @click="navigated">
          score<span class="sc-accent">ly</span>
        </router-link>
        <button type="button" class="sc-icon-btn menu" :aria-label="$t('nav.close')" @click="drawer = false">
          <q-icon name="close" size="22px" />
        </button>
      </div>

      <q-list class="nav">
        <q-item
          v-for="item in items"
          :key="item.key"
          clickable
          :to="item.to"
          :active="isActive(item)"
          active-class="nav-item--active"
          class="nav-item"
          @click="navigated"
        >
          <q-item-section avatar><q-icon :name="item.icon" /></q-item-section>
          <q-item-section class="sc-display nav-label">{{ $t(`nav.${item.key}`) }}</q-item-section>
          <q-tooltip v-if="mini" anchor="center right" self="center left" :offset="[8, 0]">
            {{ $t(`nav.${item.key}`) }}
          </q-tooltip>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<style scoped>
.header {
  background: var(--sc-bg);
  color: var(--sc-text);
  border-bottom: 1px solid var(--sc-line);
}

.bar {
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

@media (min-width: 1024px) {
  .bar {
    padding: 10px 24px 10px 10px;
  }
}

.start {
  display: flex;
  align-items: center;
  gap: 12px;
}

.menu {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.brand {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--sc-text);
  text-decoration: none;
}

.actions {
  display: flex;
  gap: 8px;
}

.avatar {
  font-family: var(--sc-font-display);
  font-weight: 700;
  font-size: 18px;
  cursor: pointer;
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 8px 10px 16px;
  border-bottom: 1px solid var(--sc-line);
}

.nav {
  padding: 8px;
}

.nav-item {
  min-height: 48px;
  border-radius: 12px;
  color: var(--sc-text-2);
  margin-bottom: 4px;
}

.nav-label {
  font-size: 18px;
  letter-spacing: 1px;
}

.nav-item--active {
  color: var(--sc-accent);
  background: var(--sc-line);
}
</style>

<style>
/* O Quasar põe a classe no próprio aside do drawer (fora do escopo deste componente). */
.sc-drawer.q-drawer {
  background: var(--sc-surface);
  border-right: 1px solid var(--sc-line);
}
</style>
