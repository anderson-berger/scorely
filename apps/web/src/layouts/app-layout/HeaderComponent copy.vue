<template>
  <q-header class="app-header" bordered>
    <q-toolbar>
      <!-- Botão hamburger (apenas mobile) -->
      <q-btn v-if="isMobile" flat dense round icon="menu" color="white" @click="toggleDrawer" />

      <!-- Título / Breadcrumb -->
      <q-toolbar-title class="text-weight-bold">
        {{ pageTitle }}
      </q-toolbar-title>

      <q-space />

      <!-- Ações do header -->
      <q-btn flat round icon="notifications" color="white">
        <q-badge floating color="red" rounded>3</q-badge>
      </q-btn>

      <q-btn flat round color="white">
        <q-avatar size="32px">
          <img src="https://cdn.quasar.dev/img/avatar.png" />
        </q-avatar>

        <q-menu>
          <q-list style="min-width: 180px">
            <q-item clickable v-close-popup>
              <q-item-section avatar>
                <q-icon name="person" />
              </q-item-section>
              <q-item-section>Meu Perfil</q-item-section>
            </q-item>

            <q-item clickable v-close-popup>
              <q-item-section avatar>
                <q-icon name="settings" />
              </q-item-section>
              <q-item-section>Configurações</q-item-section>
            </q-item>

            <q-separator />

            <q-item clickable v-close-popup @click="logout">
              <q-item-section avatar>
                <q-icon name="logout" color="negative" />
              </q-item-section>
              <q-item-section class="text-negative">Sair</q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>
    </q-toolbar>
  </q-header>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'HeaderComponent',

  components: {},

  props: {
    drawerOpen: {
      type: Boolean,
      default: false,
    },
  },

  emits: ['update:drawerOpen'],

  data() {
    return {};
  },

  computed: {
    isMobile(): boolean {
      return this.$q.screen.lt.md;
    },

    pageTitle(): string {
      const routeName = this.$route.name as string;

      const titles: Record<string, string> = {
        'app.index': 'Início',
        'app.team': 'Time',
        'app.team.dashboard': 'Dashboard',
        'app.team.championships': 'Campeonatos',
        'app.team.calendar': 'Calendário',
        'app.team.members': 'Membros',
        'app.team.invites': 'Convites',
        'app.team.settings': 'Configurações',
        'app.team.billing': 'Faturamento',
      };

      return titles[routeName] || 'Dashboard';
    },
  },

  methods: {
    toggleDrawer() {
      this.$emit('update:drawerOpen', !this.drawerOpen);
    },

    logout() {
      // TODO: Implementar logout
      console.log('Logout');
      this.$router.push({ name: 'auth.login' });
    },
  },

  created() {},

  mounted() {},
});
</script>

<style scoped>
.app-header {
  background: #1e1f22;
  border-bottom: 1px solid #35363c;
}

/* Desktop: header com offset do sidebar */
@media (min-width: 1024px) {
  .app-header {
    margin-left: 312px; /* 72px + 240px */
  }
}
</style>
