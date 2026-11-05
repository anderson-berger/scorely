import { authHandlers } from '../../lib/auth';
import { pathParam } from '../../lib/http';
import { dynamoNotificationRepository } from './notification.repository';
import { createNotificationService } from './notification.service';

const notifications = createNotificationService(dynamoNotificationRepository);

export const { list, markRead, markAllRead } = authHandlers({
  async list(event, auth) {
    return notifications.list(auth.userId, event.queryStringParameters?.cursor);
  },

  async markRead(event, auth) {
    await notifications.markRead(auth.userId, pathParam(event, 'id'));
  },

  async markAllRead(_event, auth) {
    await notifications.markAllRead(auth.userId);
  },
});
