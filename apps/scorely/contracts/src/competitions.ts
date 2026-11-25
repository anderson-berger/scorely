import { VersionSchema } from '@scorely/contracts/src/entity';
import { TimeZoneSchema, UserSchema } from '@scorely/contracts/src/users';
import { z } from 'zod';

// Competição (docs/modules/competicao.md).

/** Máximo de competições abertas ou no prazo por grupo (COM-01). */
export const COMPETITION_MAX_OPEN = 3;

/** Máximo de competições para que uma partida ou repetição vale (PAR-40). */
export const MATCH_COMPETITIONS_MAX = 3;

/** Limites de COM-02 e COM-03. */
export const COMPETITION_LIMITS = {
  /** A duração, em dias, contando o primeiro e o último. */
  durationDays: { min: 7, max: 366 },
  name: 40,
  /** Cada ponto, inteiro. */
  points: { min: 0, max: 10 },
  /** O prazo depois do fim (COM-11). */
  graceDays: 3,
} as const;

/** Os pontos que a tela sugere (COM-03). */
export const COMPETITION_DEFAULT_POINTS = { win: 3, draw: 1, loss: 0 } as const;

/** O tipo da competição (COM-01). Hoje só a temporada. */
export const CompetitionTypeSchema = z.enum(['season']);
export type CompetitionType = z.infer<typeof CompetitionTypeSchema>;

/** A situação (COM-11): aberta, no prazo ou travada. */
export const CompetitionStatusSchema = z.enum(['open', 'grace', 'locked']);
export type CompetitionStatus = z.infer<typeof CompetitionStatusSchema>;

/** O recorte do ranking (COM-08): geral, masculino ou feminino. */
export const CompetitionCutSchema = z.enum(['all', 'male', 'female']);
export type CompetitionCut = z.infer<typeof CompetitionCutSchema>;

const point = z.number().int().min(COMPETITION_LIMITS.points.min).max(COMPETITION_LIMITS.points.max);

/** Quanto vale cada coisa em cada jogo (COM-03). */
export const CompetitionPointsSchema = z.object({ win: point, draw: point, loss: point });
export type CompetitionPoints = z.infer<typeof CompetitionPointsSchema>;

/** COM-02: de 1 a 40 caracteres, sem os espaços das pontas. */
export const CompetitionNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(COMPETITION_LIMITS.name);

/** Uma data local (`AAAA-MM-DD`), no fuso da competição (COM-02). */
export const LocalDateSchema = z.iso.date();

/** Ids de competição sem repetir, até 3 (PAR-40). */
export const CompetitionIdsSchema = z
  .array(z.uuid())
  .max(MATCH_COMPETITIONS_MAX)
  .refine((ids) => new Set(ids).size === ids.length, 'Competitions cannot repeat');

/**
 * Corpo do `POST /groups/{publicId}/competitions` (COM-01, 02). Sem `name`, ela é "Temporada N". O início é hoje, no
 * `timeZone`; a duração (7 a 366 dias) a api confere, porque depende de hoje. `seriesIds`: as repetições que passam a
 * valer para ela (PAR-40), sem repetir.
 */
export const CreateCompetitionInputSchema = z
  .object({
    type: CompetitionTypeSchema,
    name: CompetitionNameSchema.optional(),
    endDate: LocalDateSchema,
    timeZone: z.string(),
    points: CompetitionPointsSchema,
    seriesIds: z.array(z.uuid()),
  })
  .superRefine((value, ctx) => {
    if (!TimeZoneSchema.safeParse(value.timeZone).success) {
      ctx.addIssue({ code: 'custom', path: ['timeZone'], message: 'Invalid time zone' });
    }
    if (new Set(value.seriesIds).size !== value.seriesIds.length) {
      ctx.addIssue({ code: 'custom', path: ['seriesIds'], message: 'Series cannot repeat' });
    }
  });
export type CreateCompetitionInput = z.infer<typeof CreateCompetitionInputSchema>;

/**
 * Corpo do `PUT /groups/{publicId}/competitions/{competitionId}` (COM-04): tudo o que muda e a `version` (ADR 0016).
 * Sem `name`, ela volta a ser "Temporada N". Os pontos só mudam sem resultado (`COMPETITION_HAS_RESULTS`).
 */
export const UpdateCompetitionInputSchema = z.object({
  name: CompetitionNameSchema.optional(),
  endDate: LocalDateSchema,
  points: CompetitionPointsSchema,
  expectedVersion: VersionSchema,
});
export type UpdateCompetitionInput = z.infer<typeof UpdateCompetitionInputSchema>;

/** Uma competição no "Vale para" da partida e da repetição (PAR-16, 40). Sem `name`: "Temporada `number`". */
export const CompetitionRefSchema = z.object({
  id: z.uuid(),
  name: z.string().optional(),
  number: z.number().int().positive(),
});
export type CompetitionRef = z.infer<typeof CompetitionRefSchema>;

/** Uma linha do ranking (COM-08, 09). `winRate` é vitórias ÷ jogos, de 0 a 1 (a tela mostra em %). */
export const CompetitionRankingRowSchema = z.object({
  /** A posição; os empatados de verdade repetem o número, e a próxima pula (COM-09). */
  position: z.number().int().positive(),
  user: UserSchema,
  points: z.number().int().nonnegative(),
  played: z.number().int().positive(),
  wins: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
});
export type CompetitionRankingRow = z.infer<typeof CompetitionRankingRowSchema>;

/** A competição na lista (COM-07). */
export const CompetitionSummarySchema = CompetitionRefSchema.extend({
  type: CompetitionTypeSchema,
  /** O primeiro e o último dia, inclusive, no `timeZone` (COM-02). */
  startDate: LocalDateSchema,
  endDate: LocalDateSchema,
  timeZone: z.string(),
  status: CompetitionStatusSchema,
  /** As 3 primeiras linhas do ranking geral. */
  podium: z.array(CompetitionRankingRowSchema).max(3),
  /** A posição de quem pede no ranking geral; ausente se não está nele. */
  myPosition: z.number().int().positive().optional(),
});
export type CompetitionSummary = z.infer<typeof CompetitionSummarySchema>;

/** Resposta do `GET /groups/{publicId}/competitions` (COM-07): abertas e no prazo pelo fim, depois as travadas. */
export const CompetitionListSchema = z.object({ items: z.array(CompetitionSummarySchema) });
export type CompetitionList = z.infer<typeof CompetitionListSchema>;

/** O que quem pede pode fazer (COM-08). A tela só mostra essas ações; a api confere de novo. */
export const CompetitionActionsSchema = z.object({
  /** Tem `competitions.manage`, até travar: editar (no prazo, só o nome, COM-11) e encerrar (COM-04, 10). */
  manage: z.boolean(),
  /** `manage`, aberta e nenhum resultado soma ainda: mudar os pontos (COM-04, 11). */
  editPoints: z.boolean(),
});
export type CompetitionActions = z.infer<typeof CompetitionActionsSchema>;

/** Resposta do `GET /groups/{publicId}/competitions/{competitionId}?cut=` e das ações sobre ela (COM-08). */
export const CompetitionSchema = CompetitionSummarySchema.extend({
  points: CompetitionPointsSchema,
  version: VersionSchema,
  /** Quando travou (COM-11); ausente antes. */
  lockedAt: z.iso.datetime().optional(),
  actions: CompetitionActionsSchema,
  /** O recorte das linhas de `ranking`. */
  cut: CompetitionCutSchema,
  ranking: z.array(CompetitionRankingRowSchema),
});
export type Competition = z.infer<typeof CompetitionSchema>;

/** Query do `GET .../competitions/{competitionId}` (COM-08). */
export const CompetitionQuerySchema = z.object({ cut: CompetitionCutSchema.default('all') });
export type CompetitionQuery = z.infer<typeof CompetitionQuerySchema>;

/** Corpo do `PUT /groups/{publicId}/matches/{matchId}/competitions` (PAR-40), com a `version` da partida. */
export const SetMatchCompetitionsInputSchema = z.object({
  competitionIds: CompetitionIdsSchema,
  expectedVersion: VersionSchema,
});
export type SetMatchCompetitionsInput = z.infer<typeof SetMatchCompetitionsInputSchema>;

// Ranking (COM-05, 09), em qualquer forma da pessoa.

/** O resultado de uma partida que soma (COM-05), como gravado (PAR-33, 34). */
export type RankingResult<T> =
  | { mode: 'day'; teams: readonly (readonly T[])[]; winner: number | 'draw' }
  | {
      mode: 'games';
      games: readonly { teams: readonly [readonly T[], readonly T[]]; winner: 'a' | 'b' | 'draw' }[];
    };

/** Uma linha do ranking, em qualquer forma da pessoa. */
export type RankingLine<T> = {
  position: number;
  member: T;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
};

type Outcome = 'win' | 'draw' | 'loss';

/** COM-05: cada jogo de cada pessoa. Pelo dia, a partida é 1 jogo; por jogo, cada jogo conta. */
function outcomes<T>(result: RankingResult<T>): { person: T; outcome: Outcome }[] {
  if (result.mode === 'day') {
    return result.teams.flatMap((team, index) =>
      team.map((person) => ({
        person,
        outcome:
          result.winner === 'draw' ? 'draw' : result.winner === index + 1 ? 'win' : ('loss' as Outcome),
      })),
    );
  }
  return result.games.flatMap((game) =>
    (
      [
        ['a', game.teams[0]],
        ['b', game.teams[1]],
      ] as const
    ).flatMap(([side, team]) =>
      team.map((person) => ({
        person,
        outcome: game.winner === 'draw' ? 'draw' : game.winner === side ? 'win' : ('loss' as Outcome),
      })),
    ),
  );
}

/**
 * COM-05, 06, 09: o ranking dos resultados. `key` identifica a pessoa; `eligible` diz quem disputa (os membros de
 * agora, no recorte). A ordem: mais pontos, maior aproveitamento, mais jogos; ainda empatados dividem a posição, e a
 * próxima pula (1, 2, 2, 4). Entre os empatados, a ordem é a de quem apareceu primeiro nos resultados.
 */
export function competitionRanking<T>(
  results: readonly RankingResult<T>[],
  points: CompetitionPoints,
  key: (person: T) => string,
  eligible: (person: T) => boolean,
): RankingLine<T>[] {
  const tally = results
    .flatMap(outcomes)
    .filter(({ person }) => eligible(person))
    .reduce((acc, { person, outcome }) => {
      const k = key(person);
      const current = acc.get(k) ?? { member: person, points: 0, played: 0, wins: 0, draws: 0, losses: 0 };
      acc.set(k, {
        ...current,
        points: current.points + points[outcome],
        played: current.played + 1,
        wins: current.wins + (outcome === 'win' ? 1 : 0),
        draws: current.draws + (outcome === 'draw' ? 1 : 0),
        losses: current.losses + (outcome === 'loss' ? 1 : 0),
      });
      return acc;
    }, new Map<string, Omit<RankingLine<T>, 'position' | 'winRate'>>());
  // Comparar o aproveitamento por produto cruzado evita o arredondamento da divisão.
  const compare = (x: Omit<RankingLine<T>, 'position' | 'winRate'>, y: typeof x): number =>
    y.points - x.points || y.wins * x.played - x.wins * y.played || y.played - x.played;
  const sorted = [...tally.values()].sort(compare);
  return sorted.map((line, index) => {
    const first = sorted.findIndex((other) => compare(other, line) === 0);
    return { ...line, position: (first === -1 ? index : first) + 1, winRate: line.wins / line.played };
  });
}
