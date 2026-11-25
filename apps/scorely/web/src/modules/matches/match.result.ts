import {
  type Match,
  type MatchDayWinner,
  type MatchGameWinner,
  type MatchHistoryResult,
  type MatchResultMember,
  type MatchResultMode,
  type MatchStanding,
  type MatchTeamPlayerRef,
  resultStandings,
  type SaveMatchResultInput,
} from '@scorely/contracts';
import { t } from '@scorely/web/src/i18n';
import { isKnownMember, refKey, refOf, type TeamsDraft } from '@scorely/web/src/modules/matches/match.teams';

// PAR-37–39: a parte pura do resultado na web. Nada aqui é gravado: só o que se salva (PAR-32).

/** Pelo dia na tela (PAR-39): os times, quem está De fora (`unassigned`) e quem venceu (ainda sem escolha: ausente). */
export type DayDraft = TeamsDraft & { winner?: MatchDayWinner };

/** Um jogo na tela (PAR-39): o Time A, o Time B e quem venceu (ainda sem escolha: ausente). */
export interface GameDraft {
  a: MatchTeamPlayerRef[];
  b: MatchTeamPlayerRef[];
  winner?: MatchGameWinner;
}

export type GameSide = 'a' | 'b';

/** Quem está no resultado e ainda tem perfil (a "Pessoa removida" não volta para a tela). */
export type KnownResultMember = Exclude<MatchResultMember, { kind: 'gone' }>;

export function isKnownResultMember(member: MatchResultMember): member is KnownResultMember {
  return member.kind !== 'gone';
}

/** A pessoa do resultado como vai ao salvar. */
export function resultRefOf(member: KnownResultMember): MatchTeamPlayerRef {
  return member.kind === 'player'
    ? { kind: 'user', id: member.user.id }
    : { kind: 'guest', id: member.guestId };
}

/** PAR-33, 39: quem pode entrar no resultado: a lista, dentro e depois a fila. */
export function listRefs(match: Pick<Match, 'in' | 'queue'>): MatchTeamPlayerRef[] {
  return [...match.in, ...match.queue].map(refOf);
}

/** PAR-31, 39: a tela abre no jeito do resultado registrado ou, sem ele, no configurado. */
export function startMode(match: Pick<Match, 'result' | 'resultMode'>): MatchResultMode {
  return match.result?.mode ?? match.resultMode;
}

/** PAR-39: os times salvos sem quem saiu da lista (a pessoa removida também saiu). */
function savedTeams(match: Pick<Match, 'lineup'>): MatchTeamPlayerRef[][] {
  return (match.lineup?.list ?? []).map((team) =>
    team
      .filter((p) => !p.left)
      .filter(isKnownMember)
      .map(refOf),
  );
}

const known = (team: readonly MatchResultMember[]) => team.filter(isKnownResultMember).map(resultRefOf);

/**
 * PAR-39, pelo dia: os times do resultado registrado pelo dia, senão os salvos (PAR-25), senão dois vazios; sempre
 * pelo menos dois. Quem está na lista e não está num time fica De fora, na ordem da lista.
 */
export function dayDraftFrom(match: Pick<Match, 'in' | 'queue' | 'lineup' | 'result'>): DayDraft {
  const result = match.result?.mode === 'day' ? match.result : undefined;
  const base = result ? result.teams.map(known) : savedTeams(match);
  const teams = [...base, ...Array.from({ length: Math.max(0, 2 - base.length) }, () => [])];
  const placed = new Set(teams.flat().map(refKey));
  return {
    teams,
    unassigned: listRefs(match).filter((r) => !placed.has(refKey(r))),
    ...(result && { winner: result.winner }),
  };
}

/** PAR-39, por jogo: os jogos do resultado registrado por jogo, ou nenhum. */
export function gamesDraftFrom(match: Pick<Match, 'result'>): GameDraft[] {
  if (match.result?.mode !== 'games') return [];
  return match.result.games.map((g) => ({ a: known(g.teams[0]), b: known(g.teams[1]), winner: g.winner }));
}

/**
 * PAR-39: o jogo novo vem com os times do anterior, sem quem venceu. O primeiro vem com o Time 1 e o Time 2 salvos (os
 * outros times ficam De fora), ou vazio sem times salvos.
 */
export function nextGame(games: readonly GameDraft[], match: Pick<Match, 'lineup'>): GameDraft {
  const last = games[games.length - 1];
  if (last) return { a: [...last.a], b: [...last.b] };
  const [a = [], b = []] = savedTeams(match);
  return { a, b };
}

/** PAR-39: o lado da pessoa no jogo, ou `null` (De fora). */
export function sideOf(game: GameDraft, ref: MatchTeamPlayerRef): GameSide | null {
  const key = refKey(ref);
  if (game.a.some((r) => refKey(r) === key)) return 'a';
  if (game.b.some((r) => refKey(r) === key)) return 'b';
  return null;
}

/** PAR-39: põe a pessoa no fim do Time A, do Time B ou De fora (`null`). */
export function moveInGame(game: GameDraft, ref: MatchTeamPlayerRef, side: GameSide | null): GameDraft {
  const key = refKey(ref);
  const a = game.a.filter((r) => refKey(r) !== key);
  const b = game.b.filter((r) => refKey(r) !== key);
  return { ...game, a: side === 'a' ? [...a, ref] : a, b: side === 'b' ? [...b, ref] : b };
}

/** PAR-39: quem está na lista e ficou de fora do jogo, na ordem da lista. */
export function gameOut(game: GameDraft, list: readonly MatchTeamPlayerRef[]): MatchTeamPlayerRef[] {
  return list.filter((r) => sideOf(game, r) === null);
}

/** PAR-34, 39: o jogo pode ser salvo: os dois times com alguém e quem venceu escolhido. */
export function gameReady(game: GameDraft): boolean {
  return game.a.length > 0 && game.b.length > 0 && game.winner !== undefined;
}

/** PAR-39: trocar de jeito pede confirmação quando o jeito de agora tem algo preenchido. */
export function hasContent(mode: MatchResultMode, day: DayDraft, games: readonly GameDraft[]): boolean {
  return mode === 'day'
    ? day.winner !== undefined || day.teams.some((team) => team.length > 0)
    : games.length > 0;
}

/** PAR-32, 33: o corpo do `PUT` pelo dia; sem quem venceu, ainda não dá para salvar. */
export function dayInput(day: DayDraft, expectedVersion: number): SaveMatchResultInput | undefined {
  if (day.winner === undefined) return undefined;
  return { mode: 'day', teams: day.teams, winner: day.winner, expectedVersion };
}

/** PAR-32, 34: o corpo do `PUT` por jogo; algum jogo incompleto, ainda não dá para salvar. */
export function gamesInput(
  games: readonly GameDraft[],
  expectedVersion: number,
): SaveMatchResultInput | undefined {
  if (games.length === 0 || !games.every(gameReady)) return undefined;
  return {
    mode: 'games',
    games: games.map((g) => ({ teams: [g.a, g.b], winner: g.winner as MatchGameWinner })),
    expectedVersion,
  };
}

/** PAR-34, 39: a contagem enquanto se anota, antes de salvar (a mesma função da api). */
export function draftStandings(games: readonly GameDraft[]) {
  return resultStandings(
    games.filter(gameReady).map((g) => ({ teams: [g.a, g.b] as const, winner: g.winner as MatchGameWinner })),
    refKey,
  );
}

/** PAR-38: a contagem de quem mais venceu para quem menos venceu; no empate, pelo apelido. */
export function sortedStandings<T extends Pick<MatchStanding, 'wins'>>(
  standings: readonly T[],
  nameOf: (s: T) => string,
): T[] {
  return [...standings].sort((x, y) => y.wins - x.wins || nameOf(x).localeCompare(nameOf(y)));
}

/** O nome de uma pessoa do resultado; quem não tem mais perfil é "Pessoa removida" (PAR-28, 35). */
export function resultMemberName(member: MatchResultMember): string {
  if (member.kind === 'gone') return t('matches.lineup.removed');
  return member.kind === 'player' ? member.user.nickname : member.name;
}

/** PAR-37: "Edu venceu o dia", "Edu e Bia venceram o dia", "Edu, Bia e mais 3 venceram o dia". */
export function winnersText(names: readonly string[]): string {
  const [first = '', second = ''] = names;
  if (names.length === 1) return t('matches.result.wonOne', { name: first });
  if (names.length === 2) return t('matches.result.wonTwo', { first, second });
  return t('matches.result.wonMany', { first, second, more: names.length - 2 });
}

/** PAR-37, 38: quem venceu, numa linha: "Time 2 venceu", "Empate" ou quem venceu o dia (por jogo). */
export function resultHeadline(result: MatchHistoryResult): string {
  if (result.mode === 'day') {
    return result.winner === 'draw'
      ? t('matches.result.draw')
      : t('matches.result.teamWon', { n: result.winner });
  }
  return result.dayWinners.length === 0
    ? t('matches.result.noWinner')
    : winnersText(result.dayWinners.map(resultMemberName));
}
