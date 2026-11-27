import { authRoute } from '@scorely/api/src/lib/auth';
import { type HttpEvent, pathParam } from '@scorely/api/src/lib/http';
import { dynamoNotificationRepository } from '@scorely/api/src/modules/notifications/data/notifications.repository';
import { createNotificationService } from '@scorely/api/src/modules/notifications/notifications.service';
import type { NotificationPage } from '@scorely/contracts';

const notifications = createNotificationService(dynamoNotificationRepository);

export async function list(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const cursor = event.queryStringParameters?.cursor;
    const result: NotificationPage = await notifications.list(auth.userId, cursor);
    return result;
  });
}

export async function markRead(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const id = pathParam(event, 'id');
    await notifications.markRead(auth.userId, id);
  });
}

export async function markAllRead(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await notifications.markAllRead(auth.userId);
  });
}

export async function remove(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const id = pathParam(event, 'id');
    await notifications.remove(auth.userId, id);
  });
}
