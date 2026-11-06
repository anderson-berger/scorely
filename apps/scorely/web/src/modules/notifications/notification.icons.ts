import type { NotificationType } from '@scorely/contracts';

/** Ícone (Material Icons) de cada tipo. */
export const notificationIcon: Record<NotificationType, string> = {
  welcome: 'waving_hand',
  waitlist_promoted: 'arrow_upward',
  game_cancelled: 'event_busy',
};
