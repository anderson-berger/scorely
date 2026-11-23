import type { NotificationType } from '@scorely/contracts';

/** Ícone (Material Icons) de cada tipo. */
export const notificationIcon: Record<NotificationType, string> = {
  welcome: 'waving_hand',
  group_invited: 'mail',
  group_join_requested: 'person_add',
  group_join_approved: 'how_to_reg',
  group_role_granted: 'shield_person',
  group_transferred: 'key',
  match_promoted: 'arrow_upward',
  match_cancelled: 'event_busy',
  match_guest_requested: 'person_add_alt',
};
