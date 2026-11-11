import { type Player, type PlayerPosition, SPORT_POSITIONS, type Sport } from '@scorely/contracts';

/** Posições que o esporte do grupo tem (TIM-02); vazio = a tela não mostra nada de posições (TIM-05). */
export function sportPositions(sport: Sport): readonly PlayerPosition[] {
  return SPORT_POSITIONS[sport];
}

/** Posições de cada pessoa, pelo id, para as linhas das abas Membros e Jogo (TIM-05). A primeira é a principal. */
export function positionsByUser(players: Player[]): Record<string, PlayerPosition[]> {
  return Object.fromEntries(players.map((p) => [p.userId, p.positions]));
}

/** Liga ou desliga uma posição no rascunho: a nova vai para o fim, então a primeira marcada é a principal (TIM-02, 05). */
export function togglePosition(
  draft: readonly PlayerPosition[],
  position: PlayerPosition,
  on: boolean,
): PlayerPosition[] {
  const without = draft.filter((p) => p !== position);
  return on ? [...without, position] : without;
}

/** Torna uma posição marcada a principal (vai para a frente, TIM-02). */
export function makeMain(draft: readonly PlayerPosition[], position: PlayerPosition): PlayerPosition[] {
  return draft.includes(position) ? [position, ...draft.filter((p) => p !== position)] : [...draft];
}
