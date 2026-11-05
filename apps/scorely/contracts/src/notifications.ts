import { z } from 'zod';
import { EntitySchema } from './entity';

/** Cresce conforme os módulos passam a notificar (ex.: `waitlist_promoted`, `list_opened`). */
export const NotificationTypeSchema = z.enum(['welcome']);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationSchema = EntitySchema.extend({
  userId: z.uuid(),
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string().optional(),
  /** Rota do front para abrir ao clicar (ex.: `/groups/<id>`). */
  link: z.string().optional(),
  readAt: z.iso.datetime().optional(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationPageSchema = z.object({
  items: z.array(NotificationSchema),
  nextCursor: z.string().optional(),
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationPage = z.infer<typeof NotificationPageSchema>;
