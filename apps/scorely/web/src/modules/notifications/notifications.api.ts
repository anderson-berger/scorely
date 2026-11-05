import { NotificationPageSchema } from '@scorely/contracts';
import { request, send } from '@/lib/http';

export const notificationsApi = {
  list: (cursor?: string) =>
    request({ url: '/notifications', params: cursor ? { cursor } : undefined }, NotificationPageSchema),
  markRead: (id: string) => send({ url: `/notifications/${id}/read`, method: 'POST' }),
  markAllRead: () => send({ url: '/notifications/read-all', method: 'POST' }),
};
