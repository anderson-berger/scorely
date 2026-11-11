<script lang="ts">
import type { Notification } from '@scorely/contracts';
import { defineComponent } from 'vue';
import { errorMessage } from '@/i18n/errors';
import { formatDateTime } from '@/lib/datetime';
import { notificationIcon } from '../notification.icons';
import { useNotificationsStore } from '../notifications.store';

/** Lista de notificações, usada no menu (desktop) e no painel de baixo (celular) (plano 008, D10). */
export default defineComponent({
  name: 'NotificationList',

  setup() {
    return { store: useNotificationsStore() };
  },

  emits: ['opened'],

  methods: {
    icon(n: Notification): string {
      return notificationIcon[n.type];
    },

    tone(n: Notification): string {
      if (n.type === 'waitlist_promoted') return 'icon--accent';
      if (n.type === 'game_cancelled') return 'icon--danger';
      return '';
    },

    when(iso: string): string {
      return formatDateTime(iso);
    },

    async open(n: Notification) {
      this.$emit('opened');
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
  <div>
    <div
      v-for="n in store.items"
      :key="n.id"
      class="item"
      :class="{ 'item--unread': !n.readAt }"
    >
      <button type="button" class="main" @click="open(n)">
        <span class="icon" :class="tone(n)"><q-icon :name="icon(n)" size="18px" /></span>
        <span class="text">
          <span class="title" :class="{ 'title--unread': !n.readAt }">{{ n.title }}</span>
          <span v-if="n.body" class="body">{{ n.body }}</span>
          <span class="sc-caption">{{ when(n.createdAt) }}</span>
        </span>
      </button>
      <button type="button" class="remove" :aria-label="$t('notifications.remove')" @click="remove(n)">
        <q-icon name="delete_outline" size="18px" />
      </button>
    </div>

    <div v-if="store.items.length === 0" class="empty sc-muted">{{ $t('notifications.empty') }}</div>

    <q-btn
      v-if="store.nextCursor"
      flat
      no-caps
      color="primary"
      class="full-width more"
      :label="$t('notifications.more')"
      @click="store.loadMore()"
    />
  </div>
</template>

<style scoped>
.item {
  display: flex;
  align-items: flex-start;
  border-top: 1px solid var(--sc-line);
}

.item--unread {
  background: var(--sc-accent-soft);
}

.main {
  flex-grow: 1;
  min-width: 0;
  display: flex;
  gap: 12px;
  padding: 14px 8px 14px 16px;
  border: 0;
  background: transparent;
  color: var(--sc-text);
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--sc-line);
  color: var(--sc-text);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon--accent {
  background: var(--sc-accent);
  color: var(--sc-on-accent);
}

.icon--danger {
  background: var(--sc-danger);
  color: var(--sc-on-accent);
}

.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.title {
  font-size: 15px;
  font-weight: 500;
}

.title--unread {
  font-weight: 700;
}

.body {
  font-size: 14px;
  color: var(--sc-text-2);
  line-height: 1.4;
}

.remove {
  width: 44px;
  height: 44px;
  margin: 8px 4px 0 0;
  flex-shrink: 0;
  border: 0;
  background: transparent;
  color: var(--sc-muted);
  cursor: pointer;
}

.empty {
  padding: 32px 16px;
  text-align: center;
  border-top: 1px solid var(--sc-line);
}

.more {
  border-top: 1px solid var(--sc-line);
  min-height: 48px;
}
</style>
