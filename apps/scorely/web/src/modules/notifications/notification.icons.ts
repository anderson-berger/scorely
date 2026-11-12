import type { NotificationType } from '@scorely/contracts';

/** Ícone (Material Icons) de cada tipo. */
export const notificationIcon: Record<NotificationType, string> = {
  welcome: 'waving_hand',
  waitlist_promoted: 'arrow_upward',
  game_cancelled: 'event_busy',
  game_reopened: 'event_available',
  member_invite: 'how_to_reg',
  teams_published: 'groups',
  game_confirmed: 'check_circle',
};
