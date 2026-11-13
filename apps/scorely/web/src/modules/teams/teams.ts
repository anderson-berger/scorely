import {
  type PlayerPosition,
  type SaveTeamsInput,
  TEAM_COUNT,
  type TeamExtra,
  type TeamPlayer,
  type TeamSettings,
  type Teams,
} from '@scorely/contracts';
import type { Text } from '@scorely/web/src/modules/teams/rules';

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

/** O que o dono edita e manda no PUT (TIM-08, 13, 16, 24). */
export type TeamsDraft = SaveTeamsInput & { pinned: string[] };

/** "Montar à mão" (TIM-14): `count` times vazios (a quantidade padrão do grupo, TIM-17, que vem da api), sem ajustes nem fixados. */
export function emptyDraft(count: number = TEAM_COUNT.min): TeamsDraft {
  return { teams: Array.from({ length: count }, () => []), positions: {}, pinned: [] };
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
    extras: everyone(teams)
      .filter((p) => p.extra)
      .map((p) => ({
        id: p.userId,
        name: p.name ?? '',
        ...(p.gender && { gender: p.gender }),
        positions: [...p.positions],
      })),
  };
}

/** O avulso de quem está na resposta (TIM-24), para editar. */
export function extraOf(draft: TeamsDraft, id: string): TeamExtra | undefined {
  return (draft.extras ?? []).find((e) => e.id === id);
}

/** Acrescenta o avulso (fica "sem time") ou substitui o de mesmo id, sem mudar o time dele (TIM-24). */
export function putExtra(draft: TeamsDraft, extra: TeamExtra): TeamsDraft {
  const extras = draft.extras ?? [];
  const exists = extras.some((e) => e.id === extra.id);
  return {
    ...draft,
    extras: exists ? extras.map((e) => (e.id === extra.id ? extra : e)) : [...extras, extra],
  };
}

/** Remove o avulso dos times, dos fixados e do jogo (TIM-24). */
export function removeExtra(draft: TeamsDraft, id: string): TeamsDraft {
  return {
    ...draft,
    teams: draft.teams.map((team) => team.filter((x) => x !== id)),
    pinned: draft.pinned.filter((x) => x !== id),
    extras: (draft.extras ?? []).filter((e) => e.id !== id),
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

/**
 * A linha Times da aba Jogo (GRP-29). O dono sempre vê o estado dos times, porque a linha serve para ele gerenciar.
 * Quem não é dono: o próprio time, se está num time publicado; "Times publicados", se não está; sem times publicados, sem linha.
 * O jogo cancelado esconde a linha no componente (esta função não recebe o jogo).
 */
export function teamsLine(teams: Teams | null, meId: string, isOwner: boolean): Text | null {
  if (isOwner) {
    if (!teams) return { key: 'teams.line.ownerNone' };
    return { key: teams.status === 'published' ? 'teams.line.ownerPublished' : 'teams.line.ownerDraft' };
  }
  if (teams?.status !== 'published') return null;
  const index = teams.teams.findIndex((team) => team.some((p) => p.userId === meId));
  return index >= 0
    ? { key: 'teams.line.myTeam', params: { team: index + 1 } }
    : { key: 'teams.line.published' };
}

/** Resumo da linha Times dos Ajustes (TIM-21): "2 times", com "espalha homens e mulheres" e "publica fora das regras" quando ligados. */
export function teamCountSummary(settings: TeamSettings): Text[] {
  return [
    { key: 'teams.summary.teams', params: { count: settings.teamCount } },
    ...(settings.spreadGender ? [{ key: 'teams.summary.spread' }] : []),
    ...(settings.allowOutsideRules ? [{ key: 'teams.summary.outside' }] : []),
  ];
}

/** "3 regras", "1 regra" ou o texto de vazio. */
function ruleCount(count: number, emptyKey: string): Text {
  if (count === 0) return { key: emptyKey };
  return count === 1 ? { key: 'teams.summary.oneRule' } : { key: 'teams.summary.rules', params: { count } };
}

/** Resumo da linha Regras dos times (TIM-21): só as regras de quantidade por time. */
export function teamRulesSummary(settings: TeamSettings): Text {
  return ruleCount(settings.rules.length, 'teams.summary.noRules');
}

/** Resumo da linha Times opostos (TIM-21). */
export function teamApartSummary(settings: TeamSettings): Text {
  return ruleCount(settings.apart.length, 'teams.summary.noApart');
}
