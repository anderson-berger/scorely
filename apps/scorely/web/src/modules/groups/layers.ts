import { type Game, GROUP_LIMITS } from '@scorely/contracts';

/** Degraus do stepper de horas (plano 008, D6). */
export const HOURS_LADDER: readonly number[] = [0, 1, 2, 3, 4, 6, 8, 12, 18, 24, 36, 48, 72, 96, 120, 144];

/** Próximo degrau na direção, dentro de [min, max]. Valor fora da escada vai para o degrau mais próximo na direção. */
export function stepHours(value: number, dir: 1 | -1, min: number, max: number): number {
  const next =
    dir === 1 ? HOURS_LADDER.find((h) => h > value) : [...HOURS_LADDER].reverse().find((h) => h < value);
  return Math.min(max, Math.max(min, next ?? value));
}

/** Antecedência de cada camada; `guests: null` = convidados desligados. */
export type Layers = { members: number; reserves: number; guests: number | null };

const MIN = {
  members: GROUP_LIMITS.listOpensHoursBefore.min,
  reserves: GROUP_LIMITS.reservesOpenHoursBefore.min,
  guests: GROUP_LIMITS.guestsOpenHoursBefore.min,
};
const MAX = {
  members: GROUP_LIMITS.listOpensHoursBefore.max,
  reserves: GROUP_LIMITS.reservesOpenHoursBefore.max,
  guests: GROUP_LIMITS.guestsOpenHoursBefore.max,
};

function clamp(key: keyof Layers, v: number): number {
  return Math.min(MAX[key], Math.max(MIN[key], v));
}

/**
 * Muda uma camada e ajusta as outras para manter membros ≥ reservas ≥ convidados (D6).
 * Quem desce puxa as de baixo; quem sobe empurra as de cima. Religar convidados só limita pelas reservas.
 */
export function changeLayer(layers: Layers, key: keyof Layers, value: number | null): Layers {
  if (key === 'guests') {
    if (value === null) return { ...layers, guests: null };
    const guests = clamp('guests', value);
    if (layers.guests === null) return { ...layers, guests: Math.min(guests, layers.reserves) };
    const reserves = Math.max(layers.reserves, guests);
    return { members: Math.max(layers.members, reserves), reserves, guests };
  }
  if (key === 'members') {
    const members = clamp('members', value ?? layers.members);
    const reserves = Math.min(layers.reserves, members);
    return { members, reserves, guests: layers.guests === null ? null : Math.min(layers.guests, reserves) };
  }
  const reserves = clamp('reserves', value ?? layers.reserves);
  return {
    members: Math.max(layers.members, reserves),
    reserves,
    guests: layers.guests === null ? null : Math.min(layers.guests, reserves),
  };
}

/** Dia da semana e hora (local do grupo) em que a camada abre, sem data (D8). */
export function layerOpensAt(
  weekday: number,
  time: string,
  hoursBefore: number,
): { weekday: number; time: string } {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const week = 7 * 1440;
  const minutes = (((weekday * 1440 + h * 60 + m - hoursBefore * 60) % week) + week) % week;
  const hh = Math.floor((minutes % 1440) / 60);
  return {
    weekday: Math.floor(minutes / 1440),
    time: `${String(hh).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
  };
}

/** Vagas de 1 em 1, dentro do GROUP_LIMITS (D7). */
export function stepSlots(value: number, dir: 1 | -1): number {
  return Math.min(GROUP_LIMITS.slots.max, Math.max(GROUP_LIMITS.slots.min, value + dir));
}

/** A próxima camada a abrir no jogo, ou `all_open`; `undefined` = não mostrar nada (plano 012, D5). */
export type NextLayer = { kind: 'reserves' | 'guests'; at: string } | { kind: 'all_open' } | undefined;

export function nextLayer(
  game: Pick<Game, 'status' | 'opensAt' | 'reservesOpensAt' | 'guestsOpensAt'>,
  now: Date,
): NextLayer {
  const opened = (iso: string) => new Date(iso).getTime() <= now.getTime();
  if (game.status === 'cancelled' || game.status === 'in_progress' || !opened(game.opensAt)) return undefined;
  if (game.reservesOpensAt && !opened(game.reservesOpensAt))
    return { kind: 'reserves', at: game.reservesOpensAt };
  if (!game.guestsOpensAt) return undefined;
  if (!opened(game.guestsOpensAt)) return { kind: 'guests', at: game.guestsOpensAt };
  return { kind: 'all_open' };
}

/** As camadas da abertura da lista, na ordem, com o estado agora (plano 015, D15). */
export type LayerKey = 'members' | 'reserves' | 'guests';
export type LayerStep = { key: LayerKey; state: 'open' | 'soon' | 'off'; at?: string };

export function layerTimeline(
  game: Pick<Game, 'opensAt' | 'reservesOpensAt' | 'guestsOpensAt'>,
  now: Date,
): LayerStep[] {
  const at: Record<LayerKey, string | undefined> = {
    members: game.opensAt,
    reserves: game.reservesOpensAt,
    guests: game.guestsOpensAt,
  };
  const keys: LayerKey[] = ['members', 'reserves', 'guests'];
  return keys.map((key) => {
    const iso = at[key];
    if (!iso) return { key, state: 'off' };
    return { key, state: new Date(iso).getTime() <= now.getTime() ? 'open' : 'soon', at: iso };
  });
}
