import type { MatchEntry, MatchLineup, MatchTeamMember, MatchTeamPlayerRef } from '@scorely/contracts';

// PAR-26 (sorteio) e a parte pura da tela de dividir (PAR-28, 30). Nada aqui é gravado: só o que se salva (PAR-25).

/** Os times na tela, antes de salvar, e quem está sem time. */
export interface TeamsDraft {
  teams: MatchTeamPlayerRef[][];
  unassigned: MatchTeamPlayerRef[];
}

export function refKey(ref: MatchTeamPlayerRef): string {
  return `${ref.kind}:${ref.id}`;
}

/** A pessoa de uma lista ou de um time salvo, como vai ao salvar. */
export function refOf(person: MatchEntry | MatchTeamMember): MatchTeamPlayerRef {
  return person.kind === 'player'
    ? { kind: 'user', id: person.user.id }
    : { kind: 'guest', id: person.guestId };
}

/** O número que a tela sugere: o do formato, ou 2 sem formato ou com 1 time (PAR-26). */
export function suggestedTeamCount(formatTeams: number | undefined): number {
  return formatTeams !== undefined && formatTeams >= 2 ? formatTeams : 2;
}

/** Fisher–Yates numa cópia (a entrada não muda): de trás para a frente, troca `i` com uma posição ao acaso até ela. */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (const i of [...out.keys()].reverse()) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** PAR-26: espalha todos ao acaso em `count` times de tamanhos que diferem no máximo 1. */
export function drawTeams(
  players: readonly MatchTeamPlayerRef[],
  count: number,
  random: () => number = Math.random,
): TeamsDraft {
  const shuffled = shuffle(players, random);
  const teams = Array.from({ length: count }, (_, t) => shuffled.filter((_, i) => i % count === t));
  return { teams, unassigned: [] };
}

/** PAR-28, 30: a tela com times salvos: os times sem quem saiu da lista, e quem está sem time à parte. */
export function draftFromLineup(lineup: MatchLineup): TeamsDraft {
  return {
    teams: lineup.list.map((team) => team.filter((p) => !p.left).map(refOf)),
    unassigned: lineup.unassigned.map(refOf),
  };
}

/** PAR-30: mudar o número não sorteia: os times que somem mandam as pessoas para Sem time; o novo nasce vazio. */
export function resizeTeams(draft: TeamsDraft, count: number): TeamsDraft {
  return {
    teams: Array.from({ length: count }, (_, i) => [...(draft.teams[i] ?? [])]),
    unassigned: [...draft.unassigned, ...draft.teams.slice(count).flat()],
  };
}

/** PAR-30: tira as pessoas de onde estiverem, mantendo o resto como estava. */
export function withoutPlayers(draft: TeamsDraft, refs: readonly MatchTeamPlayerRef[]): TeamsDraft {
  const gone = new Set(refs.map(refKey));
  const keep = (list: readonly MatchTeamPlayerRef[]) => list.filter((r) => !gone.has(refKey(r)));
  return { teams: draft.teams.map(keep), unassigned: keep(draft.unassigned) };
}

/** PAR-30: move a pessoa para o fim do time `target`, ou de Sem time (`null`). */
export function moveToTeam(draft: TeamsDraft, ref: MatchTeamPlayerRef, target: number | null): TeamsDraft {
  const rest = withoutPlayers(draft, [ref]);
  return target === null
    ? { ...rest, unassigned: [...rest.unassigned, ref] }
    : { ...rest, teams: rest.teams.map((team, i) => (i === target ? [...team, ref] : team)) };
}

/** O time de uma pessoa na tela: o índice, ou `null` em Sem time. */
export function teamOf(draft: TeamsDraft, ref: MatchTeamPlayerRef): number | null {
  const index = draft.teams.findIndex((team) => team.some((r) => refKey(r) === refKey(ref)));
  return index === -1 ? null : index;
}
