import type { LocalizedText, Sport } from '@scorely/contracts';

/** O idioma base do web: o catálogo sempre tem o nome nele (ESP-03). */
const BASE_LOCALE = 'pt-BR';

/** ESP-08: o texto do catálogo no idioma da pessoa, caindo no pt-BR. */
export function localized(text: LocalizedText, locale: string): string {
  return (text as Record<string, string | undefined>)[locale] ?? text[BASE_LOCALE];
}

/** TIM-02, ESP-05, 06: as posições ativas do esporte, na ordem do catálogo. */
export function activePositions(sport: Sport | undefined): string[] {
  return (sport?.positions ?? []).filter((p) => p.active).map((p) => p.id);
}

/** TIM-02: as ativas e as desativadas que a pessoa já tem (`kept`), na ordem do catálogo. */
export function pickerPositions(sport: Sport | undefined, kept: readonly string[]): string[] {
  const had = new Set(kept);
  return (sport?.positions ?? []).filter((p) => p.active || had.has(p.id)).map((p) => p.id);
}

/** ESP-08: o nome da posição no idioma da pessoa; a que o catálogo não conhece aparece pelo id. */
export function positionName(sport: Sport | undefined, positionId: string, locale: string): string {
  const position = sport?.positions.find((p) => p.id === positionId);
  return position ? localized(position.name, locale) : positionId;
}
