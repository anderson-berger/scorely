<template>
  <q-layout view="lHh Lpr lFf">
    <q-header>
      <q-toolbar>
        <q-btn flat dense round icon="menu" aria-label="Menu" @click="toggleDrawer" />
        <q-toolbar-title>Scorely</q-toolbar-title>
        <q-btn
          flat
          round
          :icon="$q.dark.isActive ? 'light_mode' : 'dark_mode'"
          @click="$q.dark.toggle()"
        />
        <q-btn flat round icon="logout" @click="logout" />
      </q-toolbar>
    </q-header>

    <q-drawer v-model="drawerOpen" side="left" bordered>
      <q-list>
        <q-item-label header class="text-weight-bold q-py-md"> Menu </q-item-label>

        <q-item
          v-for="item in menuItems"
          :key="item.route"
          clickable
          v-ripple
          :to="{ name: item.route }"
          active-class=""
        >
          <q-item-section avatar>
            <q-icon :name="item.icon" />
          </q-item-section>
          <q-item-section>{{ item.label }}</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AuthService from 'src/services/api/AuthService';

const router = useRouter();
const drawerOpen = ref(false);

const menuItems = [
  { label: 'Meus Times', icon: 'groups', route: 'app.team' },
  { label: 'Campeonatos', icon: 'emoji_events', route: 'app.championship' },
];

function toggleDrawer() {
  drawerOpen.value = !drawerOpen.value;
}

function logout() {
  AuthService.logout();
  void router.push({ name: 'auth.login' });
}
</script>
