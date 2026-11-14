import type { MatchRecord, MemberScore } from '@scorely/api/src/modules/competition/scoring';
import type { AttendanceMark, Tiebreak } from '@scorely/contracts';

/** Um jogo fechado já pontuado (CMP-14, 22), na ordem em que aconteceu. */
export interface ScoredGame {
  startsAt: string;
  friendly: boolean;
  cancelled: boolean;
  /** Os membros do 1º fechamento: só eles somam (CMP-25). */
  members: readonly string[];
  attendance: Readonly<Record<string, AttendanceMark>>;
  /** Saído do `gamePoints`. */
  scores: Readonly<Record<string, MemberScore>>;
}

export interface MemberStats {
  /** A soma, sem o mínimo 0 (o mínimo é do ranking). */
  points: number;
  attendance: number;
  streak: number;
  record: MatchRecord;
}

export interface RankingEntry extends MemberStats {
  id: string;
  position: number;
}

/**
 * CMP-24–26: o que a pessoa somou nos jogos em que era membro no fechamento. Presença e sequência contam só os jogos
 * normais: o amistoso e o cancelado não somam nem quebram. Não estar na lista, ou faltar, quebra a sequência.
 */
export function memberStats(games: readonly ScoredGame[], id: string): MemberStats {
  const acc = { points: 0, attendance: 0, streak: 0, run: 0, wins: 0, draws: 0, losses: 0 };
  for (const game of games) {
    if (!game.members.includes(id)) continue;
    const score = game.scores[id];
    if (score) {
      acc.points += score.points;
      if (score.event === 'win') acc.wins += 1;
      if (score.event === 'draw') acc.draws += 1;
      if (score.event === 'loss') acc.losses += 1;
      if (score.record) {
        acc.wins += score.record.wins;
        acc.draws += score.record.draws;
        acc.losses += score.record.losses;
      }
    }
    if (game.friendly || game.cancelled) continue;
    if (game.attendance[id] === 'present') {
      acc.attendance += 1;
      acc.run += 1;
      acc.streak = Math.max(acc.streak, acc.run);
    } else {
      acc.run = 0;
    }
  }
  return {
    points: acc.points,
    attendance: acc.attendance,
    streak: acc.streak,
    record: { wins: acc.wins, draws: acc.draws, losses: acc.losses },
  };
}

/** CMP-26: negativo = `a` vem antes. Mais pontos, depois os critérios do grupo na ordem. */
function compare(a: MemberStats, b: MemberStats, tiebreak: readonly Tiebreak[]): number {
  const keys = [(s: MemberStats) => s.points, ...tiebreak.map((c) => (s: MemberStats) => s[c])];
  for (const key of keys) {
    const diff = key(b) - key(a);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * CMP-24–26: o ranking de `people`, com o total mínimo 0, a ordem e o desempate. Quem empata em tudo divide a posição,
 * e a próxima pula (1º, 2º, 2º, 4º).
 */
export function rankingRows(
  games: readonly ScoredGame[],
  people: readonly string[],
  tiebreak: readonly Tiebreak[],
): RankingEntry[] {
  const stats = people.map((id) => {
    const s = memberStats(games, id);
    return { id, ...s, points: Math.max(0, s.points) };
  });
  return positionsOf(stats, tiebreak);
}

/**
 * CMP-26: ordena e dá a posição a linhas já somadas (com o mínimo 0 aplicado). Serve também para o recorte do ranking
 * final guardado (CMP-33): as posições são as de dentro do recorte.
 */
export function positionsOf<R extends MemberStats & { id: string }>(
  stats: readonly R[],
  tiebreak: readonly Tiebreak[],
): (R & { position: number })[] {
  const sorted = [...stats].sort((a, b) => compare(a, b, tiebreak));
  return sorted.map((row) => ({
    ...row,
    position: 1 + sorted.filter((other) => compare(other, row, tiebreak) < 0).length,
  }));
}
