import type { Game, GameStatus } from '@scorely/contracts';

/** Números do placar de um jogo (plano 008). */
export type Score = { confirmed: number; slots: number; waiting: number; full: boolean };

export function score(game: Pick<Game, 'confirmed' | 'waitlist' | 'slots'>): Score {
  return {
    confirmed: game.confirmed.length,
    slots: game.slots,
    waiting: game.waitlist.length,
    full: game.confirmed.length >= game.slots,
  };
}

/** GRP-46: o mínimo do jogo, quantos faltam e se já chegou. `undefined` = o jogo não tem mínimo. */
export type Minimum = { min: number; missing: number; reached: boolean };

export function minimum(game: Pick<Game, 'confirmed' | 'minPlayers'>): Minimum | undefined {
  if (game.minPlayers === undefined) return undefined;
  const missing = Math.max(0, game.minPlayers - game.confirmed.length);
  return { min: game.minPlayers, missing, reached: missing === 0 };
}

export type StatusTone = 'accent' | 'neutral' | 'danger';

const TONES: Record<GameStatus, StatusTone> = {
  open: 'accent',
  in_progress: 'accent',
  scheduled: 'neutral',
  cancelled: 'danger',
};

/** Tom do chip de estado do jogo. */
export function statusTone(status: GameStatus): StatusTone {
  return TONES[status];
}

export type Countdown = { days: number; hours: number; minutes: number };

/** Quanto falta até `at`, sem segundos; zero se já passou (D9). */
export function countdown(now: Date, at: string): Countdown {
  const totalMinutes = Math.max(0, Math.floor((new Date(at).getTime() - now.getTime()) / 60_000));
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
  };
}

/** Iniciais do primeiro e do último nome, em maiúscula; "?" sem nome. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? '') : '';
  return (first + last).toUpperCase();
}

/** "1d 22h 45min"; sem dias, "22h 45min"; sem horas, "45min" (plano 015, D8). Com dias, as horas sempre aparecem. */
export function formatCountdown(c: Countdown): string {
  if (c.days > 0) return `${c.days}d ${c.hours}h ${c.minutes}min`;
  if (c.hours > 0) return `${c.hours}h ${c.minutes}min`;
  return `${c.minutes}min`;
}

/** Uma vaga da Escalação: preenchida (`person`) ou livre (plano 015, D14). */
export type LineupSlot<T> = { position: number; person?: T };

/** Até quantas vagas livres aparecem uma a uma; o resto vira "+ N vagas livres". */
const MAX_FREE_ROWS = 12;

export function lineupSlots<T>(confirmed: T[], slots: number): { rows: LineupSlot<T>[]; hiddenFree: number } {
  const free = Math.max(0, slots - confirmed.length);
  const shownFree = Math.min(free, MAX_FREE_ROWS);
  const filled = confirmed.map((person, i) => ({ position: i + 1, person }));
  const empty = Array.from({ length: shownFree }, (_, i) => ({ position: confirmed.length + i + 1 }));
  return { rows: [...filled, ...empty], hiddenFree: free - shownFree };
}
