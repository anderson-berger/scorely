import type { AppError } from '@scorely/api/src/lib/errors';
import { range } from '@scorely/api/src/lib/fn';
import { asUserId } from '@scorely/api/src/lib/ids';
import type { NotificationRepository } from '@scorely/api/src/modules/notifications/notification.repository';
import { createNotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import { describe, expect, it } from 'vitest';

/** O item guardado: com o `userId` (sistema) do dono, que a resposta não leva (USR-16). */
type StoredNotification = Parameters<NotificationRepository['create']>[0];

type MemoryOptions = {
  /** Roda antes de cada `remove` (simula escrita concorrente entre o `get` e o `remove`). */
  beforeRemove?: (n: StoredNotification, repo: NotificationRepository) => Promise<void>;
};

type MemoryRepo = NotificationRepository & { removeCalls: { count: number } };

function memoryRepo(opts: MemoryOptions = {}): MemoryRepo {
  const removeCalls = { count: 0 };
  const items = new Map<string, StoredNotification>();
  const unread = new Map<string, number>();
  const bump = (userId: string, delta: number) => unread.set(userId, (unread.get(userId) ?? 0) + delta);
  const repo: MemoryRepo = {
    removeCalls,
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
    async markRead(userId, id, readAt) {
      const n = items.get(id);
      if (!n || n.userId !== userId || n.readAt) return false;
      n.readAt = readAt;
      bump(userId, -1);
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

async function expectNotFound(p: Promise<unknown>) {
  const err = (await p.then(
    () => undefined,
    (e: unknown) => e,
  )) as AppError | undefined;
  expect(err?.code).toBe('NOTIFICATION_NOT_FOUND');
  expect(err?.status).toBe(404);
}

const USER = asUserId('11111111-1111-4111-8111-111111111111');
const OTHER = asUserId('22222222-2222-4222-8222-222222222222');

describe('notifications', () => {
  it('conta não lidas e marca como lida (idempotente)', async () => {
    const service = createNotificationService(memoryRepo());
    const n = await service.notify(USER, { type: 'welcome', title: 'Oi' });
    await service.notify(USER, { type: 'welcome', title: 'Oi de novo' });
    expect((await service.list(USER)).unreadCount).toBe(2);

    await service.markRead(USER, n.id);
    await service.markRead(USER, n.id);
    expect((await service.list(USER)).unreadCount).toBe(1);
  });

  it('não deixa marcar notificação de outro usuário', async () => {
    const service = createNotificationService(memoryRepo());
    const n = await service.notify(OTHER, { type: 'welcome', title: 'Oi' });
    const err = (await service.markRead(USER, n.id).catch((e) => e)) as AppError;
    expect(err.status).toBe(404);
    expect((await service.list(OTHER)).unreadCount).toBe(1);
  });

  it('marcar todas zera o contador', async () => {
    const service = createNotificationService(memoryRepo());
    for (const i of range(3)) await service.notify(USER, { type: 'welcome', title: `#${i}` });
    await service.markAllRead(USER);
    const page = await service.list(USER);
    expect(page.unreadCount).toBe(0);
    expect(page.items.every((n) => n.readAt)).toBe(true);
  });

  it('USR-16: a notificação devolvida (notify e list) não traz o `userId`', async () => {
    const service = createNotificationService(memoryRepo());
    const n = await service.notify(USER, { type: 'welcome', title: 'Oi' });
    expect(n).not.toHaveProperty('userId');
    const page = await service.list(USER);
    expect(page.items).toHaveLength(1);
    for (const item of page.items) expect(item).not.toHaveProperty('userId');
    expect(JSON.stringify(page)).not.toContain(USER);
  });

  describe('remove', () => {
    it('caso 1: apagar uma lida → some da lista e unreadCount não muda', async () => {
      const service = createNotificationService(memoryRepo());
      const read = await service.notify(USER, { type: 'welcome', title: 'Lida' });
      await service.notify(USER, { type: 'welcome', title: 'Não lida' });
      await service.markRead(USER, read.id);
      expect((await service.list(USER)).unreadCount).toBe(1);

      await service.remove(USER, read.id);

      const page = await service.list(USER);
      expect(page.items.map((n) => n.id)).not.toContain(read.id);
      expect(page.items).toHaveLength(1);
      expect(page.unreadCount).toBe(1);
    });

    it('caso 2: duas não lidas, apaga uma → lista tem 1 e unreadCount = 1', async () => {
      const service = createNotificationService(memoryRepo());
      const a = await service.notify(USER, { type: 'welcome', title: 'A' });
      const b = await service.notify(USER, { type: 'welcome', title: 'B' });

      await service.remove(USER, a.id);

      const page = await service.list(USER);
      expect(page.items.map((n) => n.id)).toEqual([b.id]);
      expect(page.unreadCount).toBe(1);
    });

    it('caso 3: notificação de outro usuário → NOTIFICATION_NOT_FOUND e a de V fica intacta', async () => {
      const service = createNotificationService(memoryRepo());
      const n = await service.notify(OTHER, { type: 'welcome', title: 'De V' });

      await expectNotFound(service.remove(USER, n.id));

      const page = await service.list(OTHER);
      expect(page.items.map((x) => x.id)).toEqual([n.id]);
      expect(page.unreadCount).toBe(1);
    });

    it('caso 4: id que não existe → NOTIFICATION_NOT_FOUND', async () => {
      const service = createNotificationService(memoryRepo());
      await expectNotFound(service.remove(USER, '33333333-3333-4333-8333-333333333333'));
    });

    it('caso 5: apagar duas vezes → a 2ª dá NOTIFICATION_NOT_FOUND', async () => {
      const service = createNotificationService(memoryRepo());
      const n = await service.notify(USER, { type: 'welcome', title: 'Oi' });

      await service.remove(USER, n.id);
      await expectNotFound(service.remove(USER, n.id));
      expect((await service.list(USER)).unreadCount).toBe(0);
    });

    it('caso 6: marcada como lida entre o get e o remove → relê, apaga e o contador cai só 1', async () => {
      const race = { pending: true };
      const repo = memoryRepo({
        async beforeRemove(n, r) {
          if (!race.pending) return;
          race.pending = false;
          await r.markRead(n.userId, n.id, new Date().toISOString());
        },
      });
      const service = createNotificationService(repo);
      const n = await service.notify(USER, { type: 'welcome', title: 'Corrida' });
      await service.notify(USER, { type: 'welcome', title: 'Outra' });
      expect((await service.list(USER)).unreadCount).toBe(2);

      await service.remove(USER, n.id);

      const page = await service.list(USER);
      expect(page.items.map((x) => x.id)).not.toContain(n.id);
      expect(page.unreadCount).toBe(1);
      expect(repo.removeCalls.count).toBe(2);
    });
  });
});
