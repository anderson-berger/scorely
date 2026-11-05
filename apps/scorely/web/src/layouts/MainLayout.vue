<script lang="ts">
import type { User } from '@scorely/contracts';
import { defineComponent } from 'vue';
import { useAuthStore } from '@/modules/auth/auth.store';
import NotificationBell from '@/modules/notifications/components/NotificationBell.vue';
import { useNotificationsStore } from '@/modules/notifications/notifications.store';
import { displayName } from '@/modules/users/user.display';

export default defineComponent({
  name: 'MainLayout',

  components: { NotificationBell },

  setup() {
    return { auth: useAuthStore(), notifications: useNotificationsStore() };
  },

  methods: {
    displayName(user: User): string {
      return displayName(user);
    },

    initial(s: string): string {
      return s.trim().charAt(0).toUpperCase();
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
  <q-layout view="hHh lpR fFf">
    <q-header elevated>
      <q-toolbar>
        <q-toolbar-title class="cursor-pointer" @click="$router.push({ name: 'home' })">{{ $t('app.name') }}</q-toolbar-title>
        <NotificationBell />
        <q-btn v-if="auth.user" flat round dense class="q-ml-sm" :aria-label="$t('layout.account')">
          <q-avatar size="32px" color="white" text-color="primary">{{ initial(displayName(auth.user)) }}</q-avatar>
          <q-menu anchor="bottom right" self="top right">
            <q-list style="min-width: 200px">
              <q-item>
                <q-item-section>
                  <q-item-label>{{ displayName(auth.user) }}</q-item-label>
                  <q-item-label caption>{{ auth.user.email }}</q-item-label>
                </q-item-section>
              </q-item>
              <q-separator />
              <q-item v-close-popup clickable :to="{ name: 'profile' }">
                <q-item-section avatar><q-icon name="person" /></q-item-section>
                <q-item-section>{{ $t('layout.profile') }}</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="logout">
                <q-item-section avatar><q-icon name="logout" /></q-item-section>
                <q-item-section>{{ $t('layout.logout') }}</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </q-toolbar>
    </q-header>
    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>
