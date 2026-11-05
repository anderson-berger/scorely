<script lang="ts">
import type { Notification } from '@scorely/contracts';
import { defineComponent } from 'vue';
import { errorMessage } from '@/i18n/errors';
import { formatDateTime } from '@/lib/datetime';
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
      return formatDateTime(iso);
    },

    async open(n: Notification) {
      await this.store.markRead(n).catch(() => undefined);
      if (n.link) await this.$router.push(n.link);
    },

    async remove(n: Notification) {
      try {
        await this.store.remove(n);
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },
  },
});
</script>

<template>
  <q-btn flat round dense icon="notifications" :aria-label="$t('notifications.label')">
    <q-badge v-if="store.unreadCount > 0" color="red" floating rounded>
      {{ store.unreadCount > 99 ? '99+' : store.unreadCount }}
    </q-badge>
    <!-- O menu é teleportado: largura via style inline (CSS scoped não alcança). -->
    <q-menu anchor="bottom right" self="top right" style="width: 360px; max-width: calc(100vw - 32px)">
      <q-list separator>
        <q-item>
          <q-item-section class="text-subtitle1 text-weight-medium">{{ $t('notifications.title') }}</q-item-section>
          <q-item-section side>
            <q-btn
              v-if="store.unreadCount > 0"
              flat
              dense
              no-caps
              size="sm"
              :label="$t('notifications.markAllRead')"
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
          <q-item-section side>
            <!-- .stop: não abre a notificação; o menu continua aberto (sem v-close-popup no botão) -->
            <q-btn
              flat
              round
              dense
              size="sm"
              icon="delete"
              :aria-label="$t('notifications.remove')"
              @click.stop="remove(n)"
            />
          </q-item-section>
        </q-item>

        <q-item v-if="store.items.length === 0">
          <q-item-section class="text-grey-7">{{ $t('notifications.empty') }}</q-item-section>
        </q-item>

        <q-item v-if="store.nextCursor" clickable @click="store.loadMore()">
          <q-item-section class="text-center text-primary">{{ $t('notifications.more') }}</q-item-section>
        </q-item>
      </q-list>
    </q-menu>
  </q-btn>
</template>
