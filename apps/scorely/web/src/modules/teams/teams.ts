import {
  type PlayerPosition,
  type SaveTeamsInput,
  TEAM_COUNT,
  type TeamPlayer,
  type Teams,
} from '@scorely/contracts';

/**
 * O que o painel da pessoa devolve: o time (0 = Time 1; `undefined` = fora dos times), as posições no jogo
 * (`undefined` = as do grupo) e se fica fixa no time (TIM-16).
 */
export interface TeamPlayerChange {
  userId: string;
  team: number | undefined;
  positions: PlayerPosition[] | undefined;
  pinned: boolean;
}

/** O que o dono edita e manda no PUT (TIM-08, 13, 16). */
export type TeamsDraft = SaveTeamsInput & { pinned: string[] };

/** "Montar à mão" (TIM-14): 2 times vazios, sem ajustes nem fixados. */
export function emptyDraft(): TeamsDraft {
  return { teams: Array.from({ length: TEAM_COUNT.min }, () => []), positions: {}, pinned: [] };
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
    pinned: everyone(teams)
      .filter((p) => p.pinned)
      .map((p) => p.userId),
  };
}

/** Em que time a pessoa está (0 = Time 1), ou `undefined` sem time. */
export function teamIndexOf(draft: TeamsDraft, userId: string): number | undefined {
  const index = draft.teams.findIndex((team) => team.includes(userId));
  return index >= 0 ? index : undefined;
}

/**
 * Põe a pessoa no time `target` (0 = Time 1), no fim dele, ou tira dos times (`undefined`) (TIM-08).
 * Para outro time, quem é fixo continua fixo; fora dos times, deixa de ser (TIM-16).
 */
export function moveTo(draft: TeamsDraft, userId: string, target: number | undefined): TeamsDraft {
  const without = draft.teams.map((team) => team.filter((id) => id !== userId));
  return {
    ...draft,
    teams: without.map((team, i) => (i === target ? [...team, userId] : team)),
    pinned: target === undefined ? draft.pinned.filter((id) => id !== userId) : draft.pinned,
  };
}

/** Fixa (ou desafixa) a pessoa no time em que está. Quem está sem time não pode ser fixo (TIM-16). */
export function setPinned(draft: TeamsDraft, userId: string, pinned: boolean): TeamsDraft {
  const others = draft.pinned.filter((id) => id !== userId);
  if (!pinned) return { ...draft, pinned: others };
  if (teamIndexOf(draft, userId) === undefined) return draft;
  return { ...draft, pinned: [...others, userId] };
}

/** Muda a quantidade de times (2 a 8). Ao diminuir, quem estava nos times que sumiram fica sem time (TIM-14). */
export function setTeamCount(draft: TeamsDraft, count: number): TeamsDraft {
  const n = Math.min(TEAM_COUNT.max, Math.max(TEAM_COUNT.min, count));
  const kept = draft.teams.slice(0, n);
  const stays = new Set(kept.flat());
  return {
    ...draft,
    teams: [...kept, ...Array.from({ length: n - kept.length }, () => [])],
    pinned: draft.pinned.filter((id) => stays.has(id)),
  };
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
