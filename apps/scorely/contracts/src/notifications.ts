import { EntitySchema } from '@scorely/contracts/src/entity';
import { z } from 'zod';

/** Cresce conforme os módulos passam a notificar (ex.: `list_opened` na E2). */
export const NotificationTypeSchema = z.enum([
  'welcome',
  'waitlist_promoted',
  'game_cancelled',
  'game_reopened',
  'member_invite',
  'teams_published',
  'game_confirmed',
  'staff_role_granted',
  'group_transferred',
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationSchema = EntitySchema.extend({
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
