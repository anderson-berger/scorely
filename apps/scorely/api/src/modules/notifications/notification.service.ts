import type { Notification, NotificationPage } from '@scorely/contracts';
import { newEntity } from '../../lib/entity';
import { appError } from '../../lib/errors';
import type { NotificationRepository } from './notification.repository';

/** O que outro módulo passa para `notify`. */
export type NewNotification = Pick<Notification, 'type' | 'title'> &
  Partial<Pick<Notification, 'body' | 'link'>>;

const PAGE_SIZE = 20;
/** O "marcar todas" olha só as mais recentes; as antigas continuam no contador até serem abertas. */
const READ_ALL_SCAN = 100;

export function createNotificationService(repo: NotificationRepository, now: () => Date = () => new Date()) {
  return {
    /** Ponto de entrada para os outros módulos avisarem um usuário. */
    async notify(userId: string, input: NewNotification): Promise<Notification> {
      const notification = newEntity<Notification>({ userId, ...input }, now());
      await repo.create(notification);
      return notification;
    },

    async list(userId: string, cursor?: string): Promise<NotificationPage> {
      const [page, unreadCount] = await Promise.all([
        repo.list(userId, { limit: PAGE_SIZE, cursor }),
        repo.unreadCount(userId),
      ]);
      return { ...page, unreadCount };
    },

    async markRead(userId: string, id: string): Promise<void> {
      if (await repo.markRead(userId, id, now().toISOString())) return;
      // Não marcou: ou já estava lida (ok, idempotente) ou não existe/não é do usuário.
      const existing = await repo.get(id);
      if (!existing || existing.userId !== userId) throw appError('NOTIFICATION_NOT_FOUND');
    },

    async markAllRead(userId: string): Promise<void> {
      const { items } = await repo.list(userId, { limit: READ_ALL_SCAN });
      const readAt = now().toISOString();
      for (const n of items) if (!n.readAt) await repo.markRead(userId, n.id, readAt);
    },
  };
}
export type NotificationService = ReturnType<typeof createNotificationService>;
