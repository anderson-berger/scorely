import type { Notification } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';
import type { AppError } from '../../lib/errors';
import { range } from '../../lib/fn';
import type { NotificationRepository } from './notification.repository';
import { createNotificationService } from './notification.service';

function memoryRepo(): NotificationRepository {
  const items = new Map<string, Notification>();
  const unread = new Map<string, number>();
  const bump = (userId: string, delta: number) => unread.set(userId, (unread.get(userId) ?? 0) + delta);
  return {
    async create(n) {
      items.set(n.id, { ...n });
      bump(n.userId, 1);
    },
    get: async (id) => items.get(id),
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
  };
}

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

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
});
