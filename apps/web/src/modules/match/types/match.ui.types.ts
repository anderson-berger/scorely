/**
 * UI-only helper types for the match module.
 * Domain types come from the backend — never redefine Match or MatchUser here.
 */
import type { Match } from '@scorely/api/modules/match/match_types';

export type MatchSport = Match['sport'];
export type MatchStatus = Match['status'];
export type MatchVisibility = Match['visibility'];

export interface MatchFilters {
  sport: MatchSport[];
  status: MatchStatus[];
  visibility: MatchVisibility | null;
}

export interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
  nextCursor?: string;
}

// Display helpers
export const SPORT_LABEL: Record<MatchSport, string> = {
  FOOTBALL: 'Futebol',
  FUTSAL: 'Futsal',
  SOCIETY: 'Society',
  BASKETBALL: 'Basquete',
  VOLLEYBALL: 'Vôlei',
};

export const SPORT_ICON: Record<MatchSport, string> = {
  FOOTBALL: 'sports_soccer',
  FUTSAL: 'sports_soccer',
  SOCIETY: 'sports_soccer',
  BASKETBALL: 'sports_basketball',
  VOLLEYBALL: 'sports_volleyball',
};

export const STATUS_LABEL: Record<MatchStatus, string> = {
  OPEN: 'Aberta',
  FULL: 'Lotada',
  IN_PROGRESS: 'Em andamento',
  FINISHED: 'Encerrada',
  CANCELLED: 'Cancelada',
};

export const STATUS_COLOR: Record<MatchStatus, string> = {
  OPEN: 'positive',
  FULL: 'warning',
  IN_PROGRESS: 'primary',
  FINISHED: 'grey-6',
  CANCELLED: 'negative',
};
