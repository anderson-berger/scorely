<script lang="ts">
import type { Notification } from '@scorely/contracts';
import { defineComponent } from 'vue';
import { notificationIcon } from '../notification.icons';
import { useNotificationsStore } from '../notifications.store';

export default defineComponent({
  name: 'NotificationBell',

  setup() {
    return { store: useNotificationsStore() };
  },

  mounted() {
    this.store.startPolling();
  },

  beforeUnmount() {
    this.store.stopPolling();
  },

  methods: {
    icon(n: Notification): string {
      return notificationIcon[n.type];
    },

    when(iso: string): string {
      return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    },

    async open(n: Notification) {
      await this.store.markRead(n).catch(() => undefined);
      if (n.link) await this.$router.push(n.link);
    },
  },
});
</script>

<template>
  <q-btn flat round dense icon="notifications" aria-label="Notificações">
    <q-badge v-if="store.unreadCount > 0" color="red" floating rounded>
      {{ store.unreadCount > 99 ? '99+' : store.unreadCount }}
    </q-badge>
    <!-- O menu é teleportado: largura via style inline (CSS scoped não alcança). -->
    <q-menu anchor="bottom right" self="top right" style="width: 360px; max-width: calc(100vw - 32px)">
      <q-list separator>
        <q-item>
          <q-item-section class="text-subtitle1 text-weight-medium">Notificações</q-item-section>
          <q-item-section side>
            <q-btn
              v-if="store.unreadCount > 0"
              flat
              dense
              no-caps
              size="sm"
              label="Marcar todas como lidas"
              @click="store.markAllRead()"
            />
          </q-item-section>
        </q-item>

        <q-item
          v-for="n in store.items"
          :key="n.id"
          v-close-popup
          clickable
          :class="{ 'bg-blue-1': !n.readAt }"
          @click="open(n)"
        >
          <q-item-section avatar>
            <q-icon :name="icon(n)" color="primary" />
          </q-item-section>
          <q-item-section>
            <q-item-label :class="{ 'text-weight-bold': !n.readAt }">{{ n.title }}</q-item-label>
            <q-item-label v-if="n.body" caption lines="2">{{ n.body }}</q-item-label>
            <q-item-label caption>{{ when(n.createdAt) }}</q-item-label>
          </q-item-section>
        </q-item>

        <q-item v-if="store.items.length === 0">
          <q-item-section class="text-grey-7">Nada por aqui ainda</q-item-section>
        </q-item>

        <q-item v-if="store.nextCursor" clickable @click="store.loadMore()">
          <q-item-section class="text-center text-primary">Ver mais</q-item-section>
        </q-item>
      </q-list>
    </q-menu>
  </q-btn>
</template>
