<template>
  <q-header>
    <q-toolbar>
      <q-btn v-if="isMobile" flat dense round icon="menu" color="white" @click="toggleDrawer" />
      <q-toolbar-title class="text-weight-bold">
        {{ pageTitle }}
      </q-toolbar-title>
      <q-space />
      <q-btn
        flat
        round
        :icon="$q.dark.isActive ? 'light_mode' : 'dark_mode'"
        @click="$q.dark.toggle()"
      />
      <q-btn disable flat round icon="notifications"> </q-btn>
      <q-btn flat round>
        <q-avatar size="32px">
          <img src="https://cdn.quasar.dev/img/avatar.png" />
        </q-avatar>
        <q-menu>
          <q-list style="min-width: 180px">
            <q-item clickable v-close-popup @click="goToPerfil">
              <q-item-section avatar>
                <q-icon name="person" />
              </q-item-section>
              <q-item-section>Meu Perfil</q-item-section>
            </q-item>

            <q-item disable clickable v-close-popup>
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
import AuthService from 'src/services/api/AuthService';

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
      const routeName = this.$route.name;

      const titles: Partial<Record<string, string>> = {
        'app.index': 'Início',
        'app.perfil': 'Meu Perfil',
        'app.team': 'Time',
        'app.team.dashboard': 'Dashboard',
        'app.team.championships': 'Campeonatos',
        'app.team.calendar': 'Calendário',
        'app.team.members': 'Membros',
        'app.team.invites': 'Convites',
        'app.team.settings': 'Configurações',
        'app.team.billing': 'Faturamento',
      };

      if (typeof routeName !== 'string') {
        return 'Dashboard';
      }

      return titles[routeName] ?? 'Dashboard';
    },
  },

  methods: {
    toggleDrawer() {
      this.$emit('update:drawerOpen', !this.drawerOpen);
    },
    goToPerfil() {
      void this.$router.push({ name: 'app.perfil' });
    },

    logout() {
      AuthService.logout();
      void this.$router.push({ name: 'auth.login' });
    },
  },

  created() {},

  mounted() {},
});
</script>

<style scoped>
/* Estilos locais aqui */
</style>
