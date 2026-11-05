import type { Notification } from '@scorely/contracts';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { notificationsApi } from './notifications.api';

/** Sem push por enquanto: a lista é atualizada de tempos em tempos enquanto o app está aberto. */
const POLL_MS = 60_000;

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<Notification[]>([]);
  const unreadCount = ref(0);
  const nextCursor = ref<string>();
  const loading = ref(false);
  const polling: { timer?: ReturnType<typeof setInterval> } = {};

  async function refresh() {
    loading.value = true;
    try {
      const page = await notificationsApi.list();
      items.value = page.items;
      unreadCount.value = page.unreadCount;
      nextCursor.value = page.nextCursor;
    } finally {
      loading.value = false;
    }
  }

  async function loadMore() {
    if (!nextCursor.value) return;
    const page = await notificationsApi.list(nextCursor.value);
    items.value.push(...page.items);
    unreadCount.value = page.unreadCount;
    nextCursor.value = page.nextCursor;
  }

  async function markRead(n: Notification) {
    if (n.readAt) return;
    n.readAt = new Date().toISOString();
    unreadCount.value = Math.max(0, unreadCount.value - 1);
    await notificationsApi.markRead(n.id);
  }

  async function markAllRead() {
    await notificationsApi.markAllRead();
    await refresh();
  }

  function startPolling() {
    stopPolling();
    void refresh().catch(() => undefined);
    polling.timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh().catch(() => undefined);
    }, POLL_MS);
  }

  function stopPolling() {
    clearInterval(polling.timer);
    delete polling.timer;
  }

  function reset() {
    stopPolling();
    items.value = [];
    unreadCount.value = 0;
    nextCursor.value = undefined;
  }

  return {
    items,
    unreadCount,
    nextCursor,
    loading,
    refresh,
    loadMore,
    markRead,
    markAllRead,
    startPolling,
    stopPolling,
    reset,
  };
});
