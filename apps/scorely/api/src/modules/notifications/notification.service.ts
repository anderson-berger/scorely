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

/** Uma releitura se a notificação mudou entre o `get` e o `remove` (ex.: marcada como lida no meio). */
const REMOVE_ATTEMPTS = 2;

export function createNotificationService(repo: NotificationRepository, now: () => Date = () => new Date()) {
  async function removeOwned(userId: string, id: string, attemptsLeft: number): Promise<void> {
    const n = await repo.get(id);
    if (!n || n.userId !== userId) throw appError('NOTIFICATION_NOT_FOUND');
    // Esgotou as tentativas e ela ainda existe: mudou o tempo todo (não é o caso "sumiu", que dá 404 acima).
    if (attemptsLeft === 0) throw new Error('Notification kept changing during removal');
    if (await repo.remove(n)) return;
    return removeOwned(userId, id, attemptsLeft - 1);
  }

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

    /** Apaga uma notificação do próprio usuário. De outro usuário ou inexistente → 404. */
    async remove(userId: string, id: string): Promise<void> {
      await removeOwned(userId, id, REMOVE_ATTEMPTS);
    },
  };
}
export type NotificationService = ReturnType<typeof createNotificationService>;
