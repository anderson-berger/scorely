import type { Notification } from '@scorely/contracts';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { notificationsApi } from './notifications.api';

/** NTF-09: sem push por enquanto, o sino consulta a cada 5 min com a aba visível. */
const POLL_MS = 300_000;

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<Notification[]>([]);
  const unreadCount = ref(0);
  const nextCursor = ref<string>();
  const loading = ref(false);
  const sync: {
    /** Polling ligado (sino montado). */
    active: boolean;
    /** Muda no `reset` (logout): resposta e consulta enfileirada da sessão anterior são descartadas. */
    session: number;
    timer?: ReturnType<typeof setTimeout>;
    /** A consulta em andamento: nunca há duas ao mesmo tempo. */
    inFlight?: Promise<void>;
    /** A única consulta que espera a em andamento (só ação da pessoa). */
    queued?: Promise<void>;
    /** Quando a última consulta terminou (ms): os 5 min contam daqui. */
    lastAt?: number;
  } = { active: false, session: 0 };

  function fetchPage(): Promise<void> {
    const session = sync.session;
    loading.value = true;
    const run = notificationsApi
      .list()
      .then((page) => {
        if (session !== sync.session) return;
        items.value = page.items;
        unreadCount.value = page.unreadCount;
        nextCursor.value = page.nextCursor;
      })
      .finally(() => {
        // Resposta de antes do logout: o `reset` já limpou o loading e não pode mexer na sessão nova.
        if (session !== sync.session) return;
        loading.value = false;
        sync.lastAt = Date.now();
        delete sync.inFlight;
        schedule();
      });
    sync.inFlight = run;
    return run;
  }

  /** Consulta. Com uma em andamento, não abre outra: devolve a mesma. */
  function refresh(): Promise<void> {
    return sync.inFlight ?? fetchPage();
  }

  /**
   * Consulta depois de uma ação da pessoa: a em andamento pode ter saído antes da ação, então espera
   * ela e consulta de novo. Pedidos repetidos se juntam na mesma consulta enfileirada.
   */
  function refreshAfterChange(): Promise<void> {
    if (!sync.inFlight) return fetchPage();
    const session = sync.session;
    sync.queued ??= sync.inFlight
      .catch(() => undefined)
      .then(() => {
        if (session !== sync.session) return;
        delete sync.queued;
        return refresh();
      });
    return sync.queued;
  }

  /**
   * Agenda a próxima consulta pelo tempo que falta desde a última; aba escondida não agenda.
   * Também é o listener de `visibilitychange`: esconder suspende, voltar consulta se já deu o tempo.
   */
  function schedule() {
    clearTimeout(sync.timer);
    delete sync.timer;
    if (!sync.active || document.visibilityState !== 'visible' || sync.inFlight) return;
    const wait = sync.lastAt === undefined ? 0 : sync.lastAt + POLL_MS - Date.now();
    if (wait <= 0) {
      void refresh().catch(() => undefined);
      return;
    }
    sync.timer = setTimeout(() => void refresh().catch(() => undefined), wait);
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
    await refreshAfterChange();
  }

  /** Apaga na api e só então tira da lista (se falhar, a lista fica como estava). */
  async function remove(n: Notification) {
    await notificationsApi.remove(n.id);
    items.value = items.value.filter((i) => i.id !== n.id);
    if (!n.readAt) unreadCount.value = Math.max(0, unreadCount.value - 1);
  }

  /** Ao entrar logado (sino montado): consulta na hora, se a aba estiver visível, e agenda as próximas. */
  function startPolling() {
    stopPolling();
    sync.active = true;
    document.addEventListener('visibilitychange', schedule);
    schedule();
  }

  function stopPolling() {
    sync.active = false;
    document.removeEventListener('visibilitychange', schedule);
    clearTimeout(sync.timer);
    delete sync.timer;
  }

  /** Logout ou sessão expirada: para tudo e esquece a sessão (o próximo login consulta na hora). */
  function reset() {
    stopPolling();
    sync.session += 1;
    delete sync.inFlight;
    delete sync.queued;
    delete sync.lastAt;
    loading.value = false;
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
    remove,
    startPolling,
    stopPolling,
    reset,
  };
});
