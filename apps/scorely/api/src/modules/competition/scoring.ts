import type {
  AttendanceMark,
  CompetitionRules,
  CompetitionUnit,
  GameEvent,
  GameResultWinner,
  MatchWinner,
} from '@scorely/contracts';

/** Uma partida, com os ids do sistema (ou do avulso) (CMP-20). */
export interface ScoringMatch {
  teams: readonly [readonly string[], readonly string[]];
  winner: MatchWinner;
}

/** As partidas que a pessoa jogou (CMP-22). */
export interface MatchRecord {
  wins: number;
  draws: number;
  losses: number;
}

/** O que os pontos do jogo precisam, com os ids do sistema (ou do avulso). */
export interface ScoringInput {
  cancelled: boolean;
  friendly: boolean;
  /** Os membros do 1º fechamento: só eles pontuam (CMP-14). */
  members: readonly string[];
  /** A lista do jogo, na ordem: dentro (`inside`) ou fila. */
  list: readonly { id: string; inside: boolean }[];
  attendance: Readonly<Record<string, AttendanceMark>>;
  teams: readonly (readonly string[])[];
  winner?: GameResultWinner | undefined;
  unit: CompetitionUnit;
  /** As partidas do jogo (unidade por partida). */
  matches?: readonly ScoringMatch[] | undefined;
}

export interface MemberScore {
  event: GameEvent;
  points: number;
  /** Com a unidade por partida e alguma partida jogada. */
  record?: MatchRecord;
}

/** CMP-14: o que aconteceu com quem veio, pelo resultado do dia. */
function playedEvent(input: ScoringInput, id: string): GameEvent {
  if (input.unit === 'match' || input.winner === undefined) return 'noResult';
  if (input.winner === 'draw') return 'draw';
  return input.teams[input.winner]?.includes(id) ? 'win' : 'loss';
}

/** CMP-14: o acontecimento de um membro no jogo. */
function eventOf(input: ScoringInput, id: string): GameEvent {
  const entry = input.list.find((p) => p.id === id);
  if (input.cancelled) {
    if (!entry) return 'notConfirmed';
    return entry.inside ? 'cancelled' : 'noResult';
  }
  if (!entry) return 'notConfirmed';
  if (input.attendance[id] !== 'present') return entry.inside ? 'noShow' : 'absentQueue';
  return playedEvent(input, id);
}

/** Os pontos de cada acontecimento pelo regulamento (CMP-06); o que não está no regulamento vale 0. */
function pointsOf(event: GameEvent, rules: CompetitionRules, cancelled: boolean): number {
  const p = rules.points;
  switch (event) {
    case 'win':
      return p.win;
    case 'draw':
      return p.draw;
    case 'loss':
      return p.loss;
    case 'noShow':
      return p.noShow;
    case 'notConfirmed':
      return cancelled ? 0 : p.notConfirmed;
    case 'cancelled':
      return p.cancelled;
    default:
      return 0;
  }
}

/** CMP-22: com a unidade por partida, quem veio e jogou alguma partida soma cada uma. Senão, `undefined`. */
function playedMatches(
  input: ScoringInput,
  id: string,
): { record: MatchRecord; points: (rules: CompetitionRules) => number } | undefined {
  if (input.unit !== 'match' || input.cancelled || input.attendance[id] !== 'present') return undefined;
  const record = matchRecord(input.matches ?? [], id);
  if (record.wins + record.draws + record.losses === 0) return undefined;
  return {
    record,
    points: (rules) =>
      record.wins * rules.points.win + record.draws * rules.points.draw + record.losses * rules.points.loss,
  };
}

/**
 * CMP-14, 15: os pontos de cada membro do 1º fechamento, pela cópia do regulamento. O valor sai como ele é (negativo
 * continua negativo; o mínimo 0 é do total, no ranking). Amistoso: os acontecimentos continuam, com 0 ponto.
 */
export function gamePoints(input: ScoringInput, rules: CompetitionRules): Record<string, MemberScore> {
  return Object.fromEntries(
    input.members.map((id) => {
      const played = playedMatches(input, id);
      if (played)
        return [
          id,
          { event: 'played', points: input.friendly ? 0 : played.points(rules), record: played.record },
        ];
      const event = eventOf(input, id);
      return [id, { event, points: input.friendly ? 0 : pointsOf(event, rules, input.cancelled) }];
    }),
  );
}

/** CMP-22: as vitórias, empates e derrotas de uma pessoa nas partidas. */
export function matchRecord(matches: readonly ScoringMatch[], id: string): MatchRecord {
  const played = matches.flatMap((m) => {
    const side = m.teams[0].includes(id) ? 0 : m.teams[1].includes(id) ? 1 : undefined;
    if (side === undefined) return [];
    if (m.winner === 'draw') return ['draw' as const];
    return [m.winner === side ? ('win' as const) : ('loss' as const)];
  });
  return {
    wins: played.filter((r) => r === 'win').length,
    draws: played.filter((r) => r === 'draw').length,
    losses: played.filter((r) => r === 'loss').length,
  };
}

/** CMP-22: quem tem mais vitórias nas partidas (pelo menos 1); empate = todos, de qualquer papel. */
export function dayWinners(matches: readonly ScoringMatch[]): string[] {
  const wins = new Map<string, number>();
  for (const m of matches) {
    if (m.winner === 'draw') continue;
    for (const id of m.teams[m.winner]) wins.set(id, (wins.get(id) ?? 0) + 1);
  }
  const best = Math.max(0, ...wins.values());
  return best === 0 ? [] : [...wins].filter(([, n]) => n === best).map(([id]) => id);
}
