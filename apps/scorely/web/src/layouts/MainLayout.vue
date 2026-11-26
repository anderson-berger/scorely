<script lang="ts">
import AccountMenu from '@scorely/web/src/layouts/AccountMenu.vue';
import AppSidebar from '@scorely/web/src/layouts/AppSidebar.vue';
import SidebarLinks from '@scorely/web/src/layouts/SidebarLinks.vue';
import NotificationBell from '@scorely/web/src/modules/notifications/components/NotificationBell.vue';
import { defineComponent } from 'vue';

/**
 * GRV-13: a partir de 600px, sem cabeçalho, com a barra lateral fixa. Abaixo disso, o cabeçalho com o ☰, que abre por
 * cima da tela o mesmo conteúdo da barra.
 */
export default defineComponent({
  name: 'MainLayout',

  components: { AccountMenu, AppSidebar, NotificationBell, SidebarLinks },

  data() {
    return {
      drawer: false,
    };
  },

  computed: {
    /** Até 599px: cabeçalho e ☰; a partir de 600px, a barra lateral. */
    phone(): boolean {
      return this.$q.screen.xs;
    },
  },

  watch: {
    /** Ao alargar com o menu aberto, ele não volta aberto quando a janela estreitar. */
    phone(value: boolean) {
      if (!value) this.drawer = false;
    },
  },
});
</script>

<template>
  <q-layout view="hHh LpR fFf">
    <q-header v-if="phone" class="header">
      <div class="bar">
        <div class="start">
          <button
            type="button"
            class="sc-icon-btn menu"
            :aria-label="$t('nav.open')"
            :aria-expanded="drawer"
            @click="drawer = !drawer"
          >
            <q-icon name="menu" size="22px" />
          </button>
          <router-link :to="{ name: 'groups' }" class="brand sc-display" :aria-label="$t('app.name')">
            score<span class="sc-accent">ly</span>
          </router-link>
        </div>
        <div class="actions">
          <NotificationBell />
          <AccountMenu />
        </div>
      </div>
    </q-header>

    <AppSidebar v-else />

    <q-drawer v-if="phone" v-model="drawer" side="left" behavior="mobile" :width="$q.screen.width" class="sc-drawer">
      <!-- O drawer cobre o cabeçalho (e o ☰): a saída fica dentro dele. -->
      <div class="drawer-head">
        <router-link :to="{ name: 'groups' }" class="brand sc-display" @click="drawer = false">
          score<span class="sc-accent">ly</span>
        </router-link>
        <button type="button" class="sc-icon-btn menu" :aria-label="$t('nav.close')" @click="drawer = false">
          <q-icon name="close" size="22px" />
        </button>
      </div>

      <SidebarLinks class="drawer-links" @navigate="drawer = false" />
    </q-drawer>

    <q-page-container :class="{ 'with-sidebar': !phone }">
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

/* A barra é fixa: o conteúdo começa depois dela. */
.with-sidebar {
  padding-left: 72px;
}

@media (min-width: 1024px) {
  .with-sidebar {
    padding-left: 240px;
  }
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 8px 10px 16px;
  border-bottom: 1px solid var(--sc-line);
}

.drawer-links {
  padding: 8px;
}
</style>

<style>
/* O Quasar põe a classe no próprio aside do drawer (fora do escopo deste componente). */
.sc-drawer.q-drawer {
  background: var(--sc-surface);
  border-right: 1px solid var(--sc-line);
}
</style>
