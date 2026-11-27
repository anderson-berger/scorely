import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import { range } from '@scorely/api/src/lib/fn';
import type { UserId } from '@scorely/api/src/lib/ids';
import type { NotificationRepository } from '@scorely/api/src/modules/notifications/data/notifications.repository';
import type { StoredNotification } from '@scorely/api/src/modules/notifications/data/notifications.table';
import type { Notification, NotificationPage } from '@scorely/contracts';

/** O que outro módulo passa para `notify`. */
export type NewNotification = Pick<Notification, 'type' | 'title'> &
  Partial<Pick<Notification, 'body' | 'link'>>;

const PAGE_SIZE = 20;
/** O "marcar todas" olha só as mais recentes; as antigas continuam no contador até serem abertas. */
const READ_ALL_SCAN = 100;

/** Uma releitura se a notificação mudou entre o `get` e o `remove` (ex.: marcada como lida no meio). */
const REMOVE_ATTEMPTS = 2;

/** USR-16: a resposta não leva o dono (é sempre quem pede). */
function toNotification({ userId: _owner, ...n }: StoredNotification): Notification {
  return n;
}

export function createNotificationService(repo: NotificationRepository, now: () => Date = () => new Date()) {
  /** A notificação da pessoa; de outra pessoa ou sumida → `NOTIFICATION_NOT_FOUND`. */
  async function getOwned(userId: UserId, id: string): Promise<StoredNotification> {
    const n = await repo.get(id);
    if (!n || n.userId !== userId) throw appError('NOTIFICATION_NOT_FOUND');
    return n;
  }

  async function removeOwned(userId: UserId, id: string): Promise<void> {
    for (const _ of range(REMOVE_ATTEMPTS)) {
      const n = await getOwned(userId, id);
      if (await repo.remove(n)) return;
    }
    // Esgotou as tentativas: se ela sumiu, é 404; se ainda existe, mudou o tempo todo.
    await getOwned(userId, id);
    throw new Error('Notification kept changing during removal');
  }

  return {
    /** Ponto de entrada para os outros módulos avisarem um usuário. */
    async notify(userId: UserId, input: NewNotification): Promise<Notification> {
      const notification: StoredNotification = { ...newEntity<Notification>(input, now()), userId };
      await repo.create(notification);
      return toNotification(notification);
    },

    async list(userId: UserId, cursor?: string): Promise<NotificationPage> {
      const [page, unreadCount] = await Promise.all([
        repo.list(userId, { limit: PAGE_SIZE, cursor }),
        repo.unreadCount(userId),
      ]);
      return { ...page, items: page.items.map(toNotification), unreadCount };
    },

    async markRead(userId: UserId, id: string): Promise<void> {
      const n = await repo.get(id);
      if (!n || n.userId !== userId) throw appError('NOTIFICATION_NOT_FOUND');
      // Já lida: idempotente (e o prazo de NTF-10 continua contando da primeira leitura).
      if (n.readAt) return;
      // `false` = outra leitura entrou no meio: também já está lida.
      await repo.markRead(n, now().toISOString());
    },

    async markAllRead(userId: UserId): Promise<void> {
      const { items } = await repo.list(userId, { limit: READ_ALL_SCAN });
      const readAt = now().toISOString();
      for (const n of items) if (!n.readAt) await repo.markRead(n, readAt);
    },

    /** Apaga uma notificação do próprio usuário. De outro usuário ou inexistente → 404. */
    async remove(userId: UserId, id: string): Promise<void> {
      await removeOwned(userId, id);
    },
  };
}
export type NotificationService = ReturnType<typeof createNotificationService>;
