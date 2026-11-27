import type { AppError } from '@scorely/api/src/lib/errors';
import { range } from '@scorely/api/src/lib/fn';
import { memoryNotifications } from '@scorely/api/src/modules/notifications/data/notifications.memory';
import { NOTIFICATION_READ_TTL_DAYS } from '@scorely/api/src/modules/notifications/data/notifications.table';
import { createNotificationService } from '@scorely/api/src/modules/notifications/notifications.service';
import { expectNotFound, OTHER, USER } from '@scorely/api/src/modules/notifications/tests/fixtures';
import { describe, expect, it } from 'vitest';

describe('notifications', () => {
  it('conta não lidas e marca como lida (idempotente)', async () => {
    const service = createNotificationService(memoryNotifications());
    const n = await service.notify(USER, { type: 'welcome', title: 'Oi' });
    await service.notify(USER, { type: 'welcome', title: 'Oi de novo' });
    expect((await service.list(USER)).unreadCount).toBe(2);

    await service.markRead(USER, n.id);
    await service.markRead(USER, n.id);
    expect((await service.list(USER)).unreadCount).toBe(1);
  });

  it('não deixa marcar notificação de outro usuário', async () => {
    const service = createNotificationService(memoryNotifications());
    const n = await service.notify(OTHER, { type: 'welcome', title: 'Oi' });
    const err = (await service.markRead(USER, n.id).catch((e) => e)) as AppError;
    expect(err.status).toBe(404);
    expect((await service.list(OTHER)).unreadCount).toBe(1);
  });

  it('marcar todas zera o contador', async () => {
    const service = createNotificationService(memoryNotifications());
    for (const i of range(3)) await service.notify(USER, { type: 'welcome', title: `#${i}` });
    await service.markAllRead(USER);
    const page = await service.list(USER);
    expect(page.unreadCount).toBe(0);
    expect(page.items.every((n) => n.readAt)).toBe(true);
  });

  it('USR-16: a notificação devolvida (notify e list) não traz o `userId`', async () => {
    const service = createNotificationService(memoryNotifications());
    const n = await service.notify(USER, { type: 'welcome', title: 'Oi' });
    expect(n).not.toHaveProperty('userId');
    const page = await service.list(USER);
    expect(page.items).toHaveLength(1);
    for (const item of page.items) expect(item).not.toHaveProperty('userId');
    expect(JSON.stringify(page)).not.toContain(USER);
  });

  describe('NTF-10: a lida some 90 dias depois de lida', () => {
    const clock = { now: new Date('2026-11-26T10:00:00.000Z') };

    it('NTF-10: o prazo é de 90 dias', () => {
      expect(NOTIFICATION_READ_TTL_DAYS).toBe(90);
    });

    it('NTF-10: markRead entrega ao repositório a notificação já lida pelo service e a hora de agora', async () => {
      const repo = memoryNotifications();
      const service = createNotificationService(repo, () => clock.now);
      const n = await service.notify(USER, { type: 'welcome', title: 'Oi' });
      await service.markRead(USER, n.id);
      expect(repo.markReadCalls).toEqual([{ id: n.id, readAt: clock.now.toISOString() }]);
    });

    it('NTF-10: já lida → nada é regravado (o prazo conta da primeira leitura)', async () => {
      const repo = memoryNotifications();
      const service = createNotificationService(repo, () => clock.now);
      const n = await service.notify(USER, { type: 'welcome', title: 'Oi' });
      await service.markRead(USER, n.id);
      await service.markRead(USER, n.id);
      expect(repo.markReadCalls).toHaveLength(1);
    });

    it('NTF-10: de outro usuário ou inexistente → NOTIFICATION_NOT_FOUND, sem marcar', async () => {
      const repo = memoryNotifications();
      const service = createNotificationService(repo, () => clock.now);
      const n = await service.notify(OTHER, { type: 'welcome', title: 'Oi' });
      await expectNotFound(service.markRead(USER, n.id));
      await expectNotFound(service.markRead(USER, '33333333-3333-4333-8333-333333333333'));
      expect(repo.markReadCalls).toEqual([]);
    });

    it('NTF-10: marcar todas passa só as não lidas, todas com a mesma hora', async () => {
      const repo = memoryNotifications();
      const service = createNotificationService(repo, () => clock.now);
      const a = await service.notify(USER, { type: 'welcome', title: 'A' });
      await service.notify(USER, { type: 'welcome', title: 'B' });
      await service.markRead(USER, a.id);
      repo.markReadCalls.length = 0;
      await service.markAllRead(USER);
      expect(repo.markReadCalls).toHaveLength(1);
      expect(repo.markReadCalls[0]?.readAt).toBe(clock.now.toISOString());
      expect((await service.list(USER)).unreadCount).toBe(0);
    });
  });

  describe('remove', () => {
    it('caso 1: apagar uma lida → some da lista e unreadCount não muda', async () => {
      const service = createNotificationService(memoryNotifications());
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
      const service = createNotificationService(memoryNotifications());
      const a = await service.notify(USER, { type: 'welcome', title: 'A' });
      const b = await service.notify(USER, { type: 'welcome', title: 'B' });

      await service.remove(USER, a.id);

      const page = await service.list(USER);
      expect(page.items.map((n) => n.id)).toEqual([b.id]);
      expect(page.unreadCount).toBe(1);
    });

    it('caso 3: notificação de outro usuário → NOTIFICATION_NOT_FOUND e a de V fica intacta', async () => {
      const service = createNotificationService(memoryNotifications());
      const n = await service.notify(OTHER, { type: 'welcome', title: 'De V' });

      await expectNotFound(service.remove(USER, n.id));

      const page = await service.list(OTHER);
      expect(page.items.map((x) => x.id)).toEqual([n.id]);
      expect(page.unreadCount).toBe(1);
    });

    it('caso 4: id que não existe → NOTIFICATION_NOT_FOUND', async () => {
      const service = createNotificationService(memoryNotifications());
      await expectNotFound(service.remove(USER, '33333333-3333-4333-8333-333333333333'));
    });

    it('caso 5: apagar duas vezes → a 2ª dá NOTIFICATION_NOT_FOUND', async () => {
      const service = createNotificationService(memoryNotifications());
      const n = await service.notify(USER, { type: 'welcome', title: 'Oi' });

      await service.remove(USER, n.id);
      await expectNotFound(service.remove(USER, n.id));
      expect((await service.list(USER)).unreadCount).toBe(0);
    });

    it('caso 6: marcada como lida entre o get e o remove → relê, apaga e o contador cai só 1', async () => {
      const race = { pending: true };
      const repo = memoryNotifications({
        async beforeRemove(n, r) {
          if (!race.pending) return;
          race.pending = false;
          await r.markRead(n, new Date().toISOString());
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
