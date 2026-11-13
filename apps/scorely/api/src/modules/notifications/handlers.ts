import { authRoute } from '@scorely/api/src/lib/auth';
import { type HttpEvent, pathParam } from '@scorely/api/src/lib/http';
import { dynamoNotificationRepository } from '@scorely/api/src/modules/notifications/notification.repository';
import { createNotificationService } from '@scorely/api/src/modules/notifications/notification.service';

const notifications = createNotificationService(dynamoNotificationRepository);

export async function list(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return notifications.list(auth.userId, event.queryStringParameters?.cursor);
  });
}

export async function markRead(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await notifications.markRead(auth.userId, pathParam(event, 'id'));
  });
}

export async function markAllRead(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await notifications.markAllRead(auth.userId);
  });
}

export async function remove(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await notifications.remove(auth.userId, pathParam(event, 'id'));
  });
}
