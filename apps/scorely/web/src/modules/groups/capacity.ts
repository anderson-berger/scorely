import { GROUP_LIMITS } from '@scorely/contracts';

/** Campo do painel de vagas e mínimo (GRP-45, 46). */
export type CapacityField = 'slots' | 'minPlayers';

/** Um passo no stepper, dentro dos limites do contrato. Quem confere mínimo × vagas é a api. */
export function stepCapacity(field: CapacityField, value: number, dir: 1 | -1): number {
  const { min, max } = GROUP_LIMITS[field];
  return Math.min(max, Math.max(min, value + dir));
}

/** O que mudou no painel do jogo: só os campos diferentes do que o jogo já usa (vazio = nada a salvar). */
export function gameCapacityPatch(
  current: { slots: number; minPlayers?: number | undefined },
  draft: { slots: number; minPlayers: number | undefined },
): { slots?: number; minPlayers?: number | null } {
  return {
    ...(draft.slots !== current.slots && { slots: draft.slots }),
    ...(draft.minPlayers !== current.minPlayers && { minPlayers: draft.minPlayers ?? null }),
  };
}
