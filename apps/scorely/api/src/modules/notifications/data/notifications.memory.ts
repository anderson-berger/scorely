import type { NotificationRepository } from '@scorely/api/src/modules/notifications/data/notifications.repository';

/** O item guardado: com o `userId` (sistema) do dono, que a resposta não leva (USR-16). */
export type StoredNotification = Parameters<NotificationRepository['create']>[0];

export type MemoryOptions = {
  /** Roda antes de cada `remove` (simula escrita concorrente entre o `get` e o `remove`). */
  beforeRemove?: (n: StoredNotification, repo: NotificationRepository) => Promise<void>;
};

export type MemoryRepo = NotificationRepository & {
  removeCalls: { count: number };
  /** O que o service mandou para `markRead` (NTF-10). */
  markReadCalls: { id: string; readAt: string }[];
};

export function memoryNotifications(opts: MemoryOptions = {}): MemoryRepo {
  const removeCalls = { count: 0 };
  const markReadCalls: { id: string; readAt: string }[] = [];
  const items = new Map<string, StoredNotification>();
  const unread = new Map<string, number>();
  const bump = (userId: string, delta: number) => unread.set(userId, (unread.get(userId) ?? 0) + delta);
  const repo: MemoryRepo = {
    removeCalls,
    markReadCalls,
    async create(n) {
      items.set(n.id, { ...n });
      bump(n.userId, 1);
    },
    async get(id) {
      const n = items.get(id);
      return n && { ...n };
    },
    async list(userId, { limit }) {
      const mine = [...items.values()]
        .filter((n) => n.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { items: mine.slice(0, limit) };
    },
    unreadCount: async (userId) => Math.max(0, unread.get(userId) ?? 0),
    async markRead(n, readAt) {
      markReadCalls.push({ id: n.id, readAt });
      const stored = items.get(n.id);
      if (!stored || stored.userId !== n.userId || stored.readAt) return false;
      stored.readAt = readAt;
      bump(n.userId, -1);
      return true;
    },
    async remove(n) {
      removeCalls.count += 1;
      await opts.beforeRemove?.(n, repo);
      const stored = items.get(n.id);
      // D3: condição userId + estado de leitura igual ao que o service leu
      if (!stored || stored.userId !== n.userId || Boolean(stored.readAt) !== Boolean(n.readAt)) return false;
      items.delete(n.id);
      if (!n.readAt) bump(n.userId, -1);
      return true;
    },
  };
  return repo;
}
