import {
  type PlayerPosition,
  type SaveTeamsInput,
  TEAM_COUNT,
  type TeamPlayer,
  type Teams,
} from '@scorely/contracts';

/** O que o painel da pessoa devolve: o time (0 = Time 1; `undefined` = fora dos times) e as posições no jogo (`undefined` = as do grupo). */
export interface TeamPlayerChange {
  userId: string;
  team: number | undefined;
  positions: PlayerPosition[] | undefined;
}

/** O que o dono edita e manda no PUT (TIM-08, 13). */
export type TeamsDraft = SaveTeamsInput;

/** "Montar times" (TIM-14): 2 times vazios, sem ajustes. */
export function emptyDraft(): TeamsDraft {
  return { teams: Array.from({ length: TEAM_COUNT.min }, () => []), positions: {} };
}

/** Todas as pessoas que a resposta mostra: nos times e sem time. */
export function everyone(teams: Teams): TeamPlayer[] {
  return [...teams.teams.flat(), ...teams.unassigned];
}

/** O rascunho a partir da resposta: ids por time e só os ajustes do jogo (TIM-13). */
export function draftOf(teams: Teams): TeamsDraft {
  const adjusted = everyone(teams).filter((p) => p.adjusted);
  return {
    teams: teams.teams.map((team) => team.map((p) => p.userId)),
    positions: Object.fromEntries(adjusted.map((p) => [p.userId, [...p.positions]])),
  };
}

/** Em que time a pessoa está (0 = Time 1), ou `undefined` sem time. */
export function teamIndexOf(draft: TeamsDraft, userId: string): number | undefined {
  const index = draft.teams.findIndex((team) => team.includes(userId));
  return index >= 0 ? index : undefined;
}

/** Põe a pessoa no time `target` (0 = Time 1), no fim dele, ou tira dos times (`undefined`) (TIM-08). */
export function moveTo(draft: TeamsDraft, userId: string, target: number | undefined): TeamsDraft {
  const without = draft.teams.map((team) => team.filter((id) => id !== userId));
  return {
    ...draft,
    teams: without.map((team, i) => (i === target ? [...team, userId] : team)),
  };
}

/** Muda a quantidade de times (2 a 8). Ao diminuir, quem estava nos times que sumiram fica sem time (TIM-14). */
export function setTeamCount(draft: TeamsDraft, count: number): TeamsDraft {
  const n = Math.min(TEAM_COUNT.max, Math.max(TEAM_COUNT.min, count));
  const kept = draft.teams.slice(0, n);
  return { ...draft, teams: [...kept, ...Array.from({ length: n - kept.length }, () => [])] };
}

/** Ajusta as posições só no jogo, ou volta para as do grupo (`undefined`) (TIM-13). */
export function setGamePositions(
  draft: TeamsDraft,
  userId: string,
  positions: PlayerPosition[] | undefined,
): TeamsDraft {
  const { [userId]: _old, ...rest } = draft.positions;
  return { ...draft, positions: positions ? { ...rest, [userId]: positions } : rest };
}
