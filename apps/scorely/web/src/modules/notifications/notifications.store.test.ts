import type { NotificationPage } from '@scorely/contracts';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationsApi } from './notifications.api';
import { useNotificationsStore } from './notifications.store';

vi.mock('./notifications.api', () => ({
  notificationsApi: {
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    remove: vi.fn(),
  },
}));

const MIN = 60_000;
const POLL = 5 * MIN;

const list = vi.mocked(notificationsApi.list);
const markAllReadApi = vi.mocked(notificationsApi.markAllRead);

function page(unreadCount: number): NotificationPage {
  return { items: [], unreadCount };
}

/** `document` mínimo: só a visibilidade da aba e o evento `visibilitychange`. */
function fakeDocument() {
  const target = new EventTarget();
  const state = { visible: true };
  const doc = {
    get visibilityState() {
      return state.visible ? 'visible' : 'hidden';
    },
    get hidden() {
      return !state.visible;
    },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
  const setVisible = (visible: boolean) => {
    state.visible = visible;
    target.dispatchEvent(new Event('visibilitychange'));
  };
  return { doc, setVisible };
}

/** Consulta controlada: só termina quando o teste chama `resolve`. */
function deferred<T>() {
  const box: { resolve: (v: T) => void } = { resolve: () => undefined };
  const promise = new Promise<T>((resolve) => {
    box.resolve = resolve;
  });
  return { promise, resolve: (v: T) => box.resolve(v) };
}

const tab = { current: fakeDocument() };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-10T12:00:00.000Z'));
  tab.current = fakeDocument();
  vi.stubGlobal('document', tab.current.doc);
  setActivePinia(createPinia());
  list.mockReset();
  list.mockResolvedValue(page(0));
  markAllReadApi.mockReset();
  markAllReadApi.mockResolvedValue(undefined as never);
});

afterEach(() => {
  useNotificationsStore().reset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

async function setVisible(visible: boolean) {
  tab.current.setVisible(visible);
  await vi.advanceTimersByTimeAsync(0);
}

describe('NTF-09: polling do sino', () => {
  it('NTF-09: ao entrar logado (startPolling com a aba visível) consulta uma vez na hora', async () => {
    list.mockResolvedValue(page(3));
    const store = useNotificationsStore();
    store.startPolling();
    await advance(0);
    expect(list).toHaveBeenCalledTimes(1);
    expect(store.unreadCount).toBe(3);
  });

  it('NTF-09: com a aba visível, consulta de novo a cada 5 min, e não antes', async () => {
    const store = useNotificationsStore();
    store.startPolling();
    await advance(0);
    await advance(POLL - 1000);
    expect(list).toHaveBeenCalledTimes(1);
    await advance(1000);
    expect(list).toHaveBeenCalledTimes(2);
    await advance(POLL);
    expect(list).toHaveBeenCalledTimes(3);
  });

  it('NTF-09: aba escondida não consulta, por mais tempo que passe', async () => {
    const store = useNotificationsStore();
    store.startPolling();
    await advance(0);
    await setVisible(false);
    await advance(30 * MIN);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('NTF-09: entrar logado com a aba escondida não consulta; ao mostrar a aba, consulta na hora', async () => {
    tab.current.setVisible(false);
    const store = useNotificationsStore();
    store.startPolling();
    await advance(10 * MIN);
    expect(list).toHaveBeenCalledTimes(0);
    await setVisible(true);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('NTF-09: volta à aba com a última consulta de 5 min ou mais → consulta na hora e a próxima 5 min depois', async () => {
    const store = useNotificationsStore();
    store.startPolling();
    await advance(0);
    await setVisible(false);
    await advance(8 * MIN);
    await setVisible(true);
    expect(list).toHaveBeenCalledTimes(2);
    await advance(POLL - 1000);
    expect(list).toHaveBeenCalledTimes(2);
    await advance(1000);
    expect(list).toHaveBeenCalledTimes(3);
  });

  it('NTF-09: volta à aba com a última consulta mais recente → não consulta e retoma só o tempo que faltava', async () => {
    const store = useNotificationsStore();
    store.startPolling();
    await advance(0);
    await advance(2 * MIN);
    await setVisible(false);
    await advance(1 * MIN);
    await setVisible(true);
    expect(list).toHaveBeenCalledTimes(1);
    // última consulta em t=0: a próxima sai em t=5min, não 5 min depois da volta
    await advance(2 * MIN - 1000);
    expect(list).toHaveBeenCalledTimes(1);
    await advance(1000);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('NTF-09: trocar de aba várias vezes em menos de 5 min não gera consultas a mais', async () => {
    const store = useNotificationsStore();
    store.startPolling();
    await advance(0);
    for (const _ of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      await setVisible(false);
      await advance(5000);
      await setVisible(true);
      await advance(5000);
    }
    // 100 s depois da primeira consulta
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('NTF-09: os 5 min contam a partir da última consulta, venha ela de onde vier', async () => {
    const store = useNotificationsStore();
    store.startPolling();
    await advance(0);
    await advance(2 * MIN);
    await store.refresh();
    expect(list).toHaveBeenCalledTimes(2);
    // a contagem recomeçou em t=2min: nada em t=5min, consulta em t=7min
    await advance(POLL - 1000);
    expect(list).toHaveBeenCalledTimes(2);
    await advance(1000);
    expect(list).toHaveBeenCalledTimes(3);
  });

  it('NTF-09: pedido de consulta com uma em andamento é ignorado e nada fica na fila', async () => {
    const slow = deferred<NotificationPage>();
    list.mockReturnValueOnce(slow.promise);
    const store = useNotificationsStore();
    store.startPolling();
    await advance(0);
    expect(list).toHaveBeenCalledTimes(1);

    void store.refresh();
    void store.refresh();
    await advance(0);
    expect(list).toHaveBeenCalledTimes(1);

    slow.resolve(page(2));
    await advance(0);
    expect(store.unreadCount).toBe(2);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('NTF-09: volta à aba com uma consulta em andamento não abre outra', async () => {
    const store = useNotificationsStore();
    store.startPolling();
    await advance(0);
    await setVisible(false);
    await advance(8 * MIN);
    const slow = deferred<NotificationPage>();
    list.mockReturnValueOnce(slow.promise);
    await setVisible(true);
    expect(list).toHaveBeenCalledTimes(2);
    await setVisible(false);
    await setVisible(true);
    expect(list).toHaveBeenCalledTimes(2);
    slow.resolve(page(0));
    await advance(0);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('NTF-09: nunca há duas consultas ao mesmo tempo, nem com a contagem vencendo durante uma lenta', async () => {
    const inFlight = { now: 0, max: 0 };
    list.mockImplementation(
      () =>
        new Promise<NotificationPage>((resolve) => {
          inFlight.now += 1;
          inFlight.max = Math.max(inFlight.max, inFlight.now);
          setTimeout(() => {
            inFlight.now -= 1;
            resolve(page(0));
          }, 6 * MIN);
        }),
    );
    const store = useNotificationsStore();
    store.startPolling();
    await advance(0);
    void store.refresh();
    await advance(5 * MIN + 1000);
    expect(list).toHaveBeenCalledTimes(1);
    await advance(30 * MIN);
    expect(inFlight.max).toBe(1);
  });

  it('NTF-09: "marcar todas" com consulta em andamento espera ela e consulta de novo (uma só, mesmo com pedidos repetidos)', async () => {
    const slow = deferred<NotificationPage>();
    list.mockReturnValueOnce(slow.promise).mockResolvedValue(page(0));
    const store = useNotificationsStore();
    store.startPolling();
    await advance(0);
    expect(list).toHaveBeenCalledTimes(1);

    const first = store.markAllRead();
    const second = store.markAllRead();
    await advance(0);
    // a lenta ainda não terminou: nada de segunda consulta simultânea
    expect(list).toHaveBeenCalledTimes(1);

    slow.resolve(page(5));
    await first;
    await second;
    await advance(0);
    expect(list).toHaveBeenCalledTimes(2);
    expect(store.unreadCount).toBe(0);
  });

  it('NTF-09: depois do logout (reset) não sai nenhuma consulta, nem pela contagem nem pela volta à aba', async () => {
    const store = useNotificationsStore();
    store.startPolling();
    await advance(0);
    store.reset();
    await advance(30 * MIN);
    await setVisible(false);
    await setVisible(true);
    await advance(30 * MIN);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('NTF-09: stopPolling (sino desmontado) para a contagem e a escuta da aba', async () => {
    const store = useNotificationsStore();
    store.startPolling();
    await advance(0);
    store.stopPolling();
    await setVisible(false);
    await advance(10 * MIN);
    await setVisible(true);
    await advance(10 * MIN);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
