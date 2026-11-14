import { LocalDateSchema } from '@scorely/contracts/src/groups';
import { TeamPersonIdSchema } from '@scorely/contracts/src/teams';
import { GenderSchema, PublicUserIdSchema } from '@scorely/contracts/src/users';
import { z } from 'zod';

// Competição (docs/modules/competicao.md): ativação por grupo e o regulamento do grupo.

/** Estado da competição, calculado pela data `activeUntil` (CMP-01). */
export const CompetitionStatusSchema = z.enum(['inactive', 'active', 'expired']);
export type CompetitionStatus = z.infer<typeof CompetitionStatusSchema>;

/** Teste (30 dias, uma vez por grupo, CMP-02) ou plano liberado pela equipe (CMP-03). */
export const CompetitionPlanSchema = z.enum(['trial', 'paid']);
export type CompetitionPlan = z.infer<typeof CompetitionPlanSchema>;

export const COMPETITION_TRIAL_DAYS = 30;

/** Faixa de cada valor de pontos (CMP-06). */
export const COMPETITION_POINTS = { min: -10, max: 10 } as const;

const PointSchema = z.number().int().min(COMPETITION_POINTS.min).max(COMPETITION_POINTS.max);

/** Quanto vale cada acontecimento (CMP-06). */
export const CompetitionPointsSchema = z.object({
  win: PointSchema,
  draw: PointSchema,
  loss: PointSchema,
  /** O membro que não confirmou presença. */
  notConfirmed: PointSchema,
  /** Quem confirmou, estava dentro e não veio. */
  noShow: PointSchema,
  /** Quem estava dentro de um jogo cancelado. */
  cancelled: PointSchema,
});
export type CompetitionPoints = z.infer<typeof CompetitionPointsSchema>;

/** O que vale ponto: cada partida ou o dia inteiro (CMP-06). */
export const CompetitionUnitSchema = z.enum(['match', 'day']);
export type CompetitionUnit = z.infer<typeof CompetitionUnitSchema>;

/** Catálogo de critérios de desempate (CMP-06): mais presente e maior sequência de presenças. */
export const TiebreakSchema = z.enum(['attendance', 'streak']);
export type Tiebreak = z.infer<typeof TiebreakSchema>;

/** O regulamento do grupo (CMP-06). O PUT recebe ele inteiro (CMP-07). */
export const CompetitionRulesSchema = z.object({
  points: CompetitionPointsSchema,
  unit: CompetitionUnitSchema,
  /** Ordem do desempate, sem repetir. Pode ficar vazia. */
  tiebreak: z
    .array(TiebreakSchema)
    .max(TiebreakSchema.options.length)
    .refine((list) => new Set(list).size === list.length, {
      message: 'Tiebreak criteria must not repeat',
    }),
});
export type CompetitionRules = z.infer<typeof CompetitionRulesSchema>;

/** Modelos prontos (CMP-08): só preenchem o regulamento; o app não guarda qual foi escolhido. */
export const CompetitionPresetIdSchema = z.enum(['classic', 'winsOnly', 'attendance']);
export type CompetitionPresetId = z.infer<typeof CompetitionPresetIdSchema>;
export const COMPETITION_PRESETS: Record<CompetitionPresetId, CompetitionRules> = {
  classic: {
    points: { win: 3, draw: 2, loss: 1, notConfirmed: 0, noShow: -2, cancelled: 0 },
    unit: 'day',
    tiebreak: ['attendance', 'streak'],
  },
  winsOnly: {
    points: { win: 1, draw: 0, loss: 0, notConfirmed: 0, noShow: 0, cancelled: 0 },
    unit: 'match',
    tiebreak: ['attendance'],
  },
  attendance: {
    points: { win: 3, draw: 2, loss: 2, notConfirmed: 0, noShow: -3, cancelled: 1 },
    unit: 'day',
    tiebreak: ['streak', 'attendance'],
  },
};

/** GET /groups/{id}/competition (CMP-05). `plan`, `activeUntil` e `rules` ficam ausentes enquanto desativada. */
export const CompetitionSchema = z.object({
  status: CompetitionStatusSchema,
  plan: CompetitionPlanSchema.optional(),
  activeUntil: z.iso.datetime().optional(),
  trialAvailable: z.boolean(),
  rules: CompetitionRulesSchema.optional(),
});
export type Competition = z.infer<typeof CompetitionSchema>;

// Fechar o jogo (CMP-11–16).

/** Chamada (CMP-12): veio ou faltou. */
export const AttendanceMarkSchema = z.enum(['present', 'absent']);
export type AttendanceMark = z.infer<typeof AttendanceMarkSchema>;

/** Resultado do dia (CMP-13): o índice do time vencedor (0 = "Time 1") ou empate. */
export const GameResultWinnerSchema = z.union([z.number().int().min(0), z.literal('draw')]);
export type GameResultWinner = z.infer<typeof GameResultWinnerSchema>;

/**
 * PUT /groups/{id}/competition/games/{date} (CMP-11–15): fecha (1ª vez) ou corrige. A chamada traz todos da lista
 * do jogo, pelo id público. Sem `winner` = sem resultado. Jogo cancelado: chamada vazia e sem vencedor.
 */
export const CloseGameInputSchema = z.object({
  attendance: z.record(TeamPersonIdSchema, AttendanceMarkSchema),
  winner: GameResultWinnerSchema.optional(),
  friendly: z.boolean().default(false),
});
export type CloseGameInput = z.input<typeof CloseGameInputSchema>;

/** Estado do jogo na competição (CMP-16). */
export const CompetitionGameStateSchema = z.enum(['closed', 'open', 'cancelled']);
export type CompetitionGameState = z.infer<typeof CompetitionGameStateSchema>;

/** Um jogo da lista (CMP-16). `cancelled` = cancelado e ainda não fechado. */
export const CompetitionGameSchema = z.object({
  date: LocalDateSchema,
  startsAt: z.iso.datetime(),
  state: CompetitionGameStateSchema,
  /** Jogo cancelado (fechado ou não). */
  cancelled: z.boolean(),
  friendly: z.boolean(),
});
export type CompetitionGame = z.infer<typeof CompetitionGameSchema>;

/** O que aconteceu com a pessoa no jogo (CMP-14). */
export const GameEventSchema = z.enum([
  'win',
  'loss',
  'draw',
  'played',
  'noResult',
  'noShow',
  'absentQueue',
  'notConfirmed',
  'cancelled',
]);
export type GameEvent = z.infer<typeof GameEventSchema>;

/** Quem é a pessoa no jogo: membro e reserva pelo papel (na lista do 1º fechamento), convidado ou avulso. */
export const GamePersonKindSchema = z.enum(['member', 'reserve', 'guest', 'extra']);
export type GamePersonKind = z.infer<typeof GamePersonKindSchema>;

export const GamePersonSchema = z.object({
  id: TeamPersonIdSchema,
  /** O apelido (USR-04); do avulso, o nome digitado (TIM-24). */
  nickname: z.string(),
  kind: GamePersonKindSchema,
  /** Está na lista do jogo: dentro (`true`) ou na fila (`false`). Ausente = não está na lista (membro que não confirmou, ou avulso). */
  inside: z.boolean().optional(),
  /** A chamada (CMP-12); sem fechar, a sugerida (só para quem fecha). */
  attendance: AttendanceMarkSchema.optional(),
  /** O índice do time publicado em que está. */
  team: z.number().int().min(0).optional(),
  /** Só membros do 1º fechamento, com o jogo fechado (CMP-14). */
  event: GameEventSchema.optional(),
  points: z.number().int().optional(),
  /** Com a unidade por partida: as partidas que a pessoa jogou (CMP-22). */
  record: z
    .object({
      wins: z.number().int().min(0),
      draws: z.number().int().min(0),
      losses: z.number().int().min(0),
    })
    .optional(),
});
export type GamePerson = z.infer<typeof GamePersonSchema>;

// Partidas (CMP-19–22).

export const COMPETITION_MATCH_LIMIT = 30;

/** O resultado da partida: o Time A (0) ou o Time B (1) venceu, ou empate (CMP-20). */
export const MatchWinnerSchema = z.union([z.literal(0), z.literal(1), z.literal('draw')]);
export type MatchWinner = z.infer<typeof MatchWinnerSchema>;

const MatchSideSchema = z.array(TeamPersonIdSchema).min(1);

/** POST e PUT de uma partida: os dois times, pelo id público ou o do avulso, e o resultado. */
export const MatchInputSchema = z.object({
  teams: z.tuple([MatchSideSchema, MatchSideSchema]),
  winner: MatchWinnerSchema,
});
export type MatchInput = z.infer<typeof MatchInputSchema>;

/** Uma partida do jogo: o número sai da ordem de registro (Partida 1, 2...). */
export const MatchSchema = MatchInputSchema.extend({
  id: z.uuid(),
  number: z.number().int().min(1),
});
export type Match = z.infer<typeof MatchSchema>;

/** GET /groups/{id}/competition/games/{date} (CMP-12–16). */
export const CompetitionGameDetailSchema = CompetitionGameSchema.extend({
  closed: z.boolean(),
  /** A unidade que vale no jogo: a da cópia, se fechado; senão, a do regulamento de agora. */
  unit: CompetitionUnitSchema,
  /** Os times publicados (cópia, se fechado), pelo id da pessoa ou do avulso. */
  teams: z.array(z.array(TeamPersonIdSchema)),
  winner: GameResultWinnerSchema.optional(),
  people: z.array(GamePersonSchema),
  /** As partidas do jogo, na ordem (CMP-20). Vazio com a unidade pelo dia. */
  matches: z.array(MatchSchema),
  /** Quem tem mais vitórias nas partidas (pelo menos 1); empate = todos (CMP-22). */
  dayWinners: z.array(TeamPersonIdSchema),
});
export type CompetitionGameDetail = z.infer<typeof CompetitionGameDetailSchema>;

// Ranking e histórico (CMP-24–27).

/** As vitórias, empates e derrotas somadas (do dia ou das partidas). */
const RecordSchema = z.object({
  wins: z.number().int().min(0),
  draws: z.number().int().min(0),
  losses: z.number().int().min(0),
});

// Temporadas (CMP-29–34): o estado entra também no ranking da temporada.

/** Limites da temporada (CMP-29, 30, 32). */
export const SEASON_LIMITS = {
  days: { min: 7, max: 366 },
  name: { max: 40 },
  aheadDays: 366,
  graceDays: 3,
} as const;

/** Programada, aberta, no prazo de 3 dias depois do fim, ou encerrada (travada) (CMP-32). */
export const SeasonStateSchema = z.enum(['scheduled', 'open', 'grace', 'closed']);
export type SeasonState = z.infer<typeof SeasonStateSchema>;

/** GET /groups/{id}/competition/ranking: o recorte (CMP-25). Ausente = geral. */
export const RankingQuerySchema = z.object({ gender: GenderSchema.optional(), season: z.uuid().optional() });
export type RankingQuery = z.infer<typeof RankingQuerySchema>;

/** Uma linha do ranking (CMP-24–26). */
export const RankingRowSchema = z.object({
  userId: PublicUserIdSchema,
  /** O apelido (USR-04). O nome da pessoa nunca sai aqui (USR-13). */
  nickname: z.string(),
  gender: GenderSchema.optional(),
  /** Empate divide a posição (1, 2, 2, 4). */
  position: z.number().int().min(1),
  /** O total, nunca abaixo de 0. */
  points: z.number().int().min(0),
  /** Jogos com presença, sem amistoso nem cancelado (CMP-26). */
  attendance: z.number().int().min(0),
  /** A maior sequência de presenças seguidas (CMP-26). */
  streak: z.number().int().min(0),
  record: RecordSchema,
});
export type RankingRow = z.infer<typeof RankingRowSchema>;

export const RankingSchema = z.object({
  rows: z.array(RankingRowSchema),
  /** Quantos jogos fechados entraram no ranking. */
  games: z.number().int().min(0),
  /** Só no ranking da temporada (CMP-33). */
  season: z
    .object({
      id: z.uuid(),
      name: z.string().optional(),
      state: SeasonStateSchema,
    })
    .optional(),
  /** Só no ranking da temporada: `true` = o ranking final guardado ao travar (CMP-32). */
  final: z.boolean().optional(),
});
export type Ranking = z.infer<typeof RankingSchema>;

/** Um jogo no histórico da pessoa (CMP-27). `member` = era membro no fechamento (então tem pontos). */
export const PersonGameSchema = z.object({
  date: LocalDateSchema,
  startsAt: z.iso.datetime(),
  friendly: z.boolean(),
  cancelled: z.boolean(),
  member: z.boolean(),
  event: GameEventSchema.optional(),
  points: z.number().int().optional(),
  attendance: AttendanceMarkSchema.optional(),
  team: z.number().int().min(0).optional(),
  record: RecordSchema.optional(),
});
export type PersonGame = z.infer<typeof PersonGameSchema>;

/** GET /groups/{id}/competition/people/{userId} (CMP-27). */
export const PersonHistorySchema = z.object({
  userId: PublicUserIdSchema,
  /** O apelido (USR-04). O nome da pessoa nunca sai aqui (USR-13). */
  nickname: z.string(),
  points: z.number().int().min(0),
  attendance: z.number().int().min(0),
  streak: z.number().int().min(0),
  record: RecordSchema,
  games: z.array(PersonGameSchema),
  /** Os troféus da pessoa neste grupo (CMP-37). */
  trophies: z.array(z.lazy(() => TrophySchema)),
});
export type PersonHistory = z.infer<typeof PersonHistorySchema>;

// Temporadas (CMP-29–34).

const SeasonNameSchema = z.string().trim().min(1).max(SEASON_LIMITS.name.max);

/** POST /groups/{id}/competition/seasons: abrir (início hoje) ou programar (CMP-29, 30). Sem nome = "Temporada N". */
export const SeasonInputSchema = z.object({
  name: SeasonNameSchema.optional(),
  startDate: LocalDateSchema,
  endDate: LocalDateSchema,
});
export type SeasonInput = z.infer<typeof SeasonInputSchema>;

/**
 * PUT /groups/{id}/competition/seasons/{seasonId} (CMP-30): a programada muda tudo (com `copyRules`, copia de novo o
 * regulamento do grupo); a que já começou, só o nome.
 */
export const SeasonUpdateInputSchema = z.object({
  name: SeasonNameSchema.optional(),
  startDate: LocalDateSchema.optional(),
  endDate: LocalDateSchema.optional(),
  copyRules: z.boolean().optional(),
});
export type SeasonUpdateInput = z.infer<typeof SeasonUpdateInputSchema>;

/** Uma temporada (CMP-34). `podium` só nas encerradas: as posições 1 a 3, com os empatados (CMP-33). */
export const SeasonSchema = z.object({
  id: z.uuid(),
  /** A ordem de criação no grupo (o "N" de "Temporada N"). */
  number: z.number().int().min(1),
  /** Sem nome, a tela mostra "Temporada {number}" (o texto é do web). */
  name: z.string().optional(),
  startDate: LocalDateSchema,
  endDate: LocalDateSchema,
  state: SeasonStateSchema,
  rules: CompetitionRulesSchema,
  /** Encerrada antes da data (CMP-32). */
  closedAt: z.iso.datetime().optional(),
  /** Até quando dá para fechar e corrigir os jogos (o fim do prazo, ou o encerramento antes da data). */
  graceUntil: z.iso.datetime(),
  podium: z.array(RankingRowSchema).optional(),
  /** Os destaques, só nas encerradas (CMP-36). */
  highlights: z.array(z.lazy(() => SeasonHighlightSchema)).optional(),
});
export type Season = z.infer<typeof SeasonSchema>;

// Prêmios (CMP-36–41).

/** O troféu: o pódio (1º, 2º, 3º) ou um destaque da temporada (CMP-36). */
export const TrophyKindSchema = z.enum(['champion', 'second', 'third', 'attendance', 'streak']);
export type TrophyKind = z.infer<typeof TrophyKindSchema>;

/** GET /me/trophies e o histórico da pessoa (CMP-37). */
export const TrophySchema = z.object({
  kind: TrophyKindSchema,
  groupId: z.uuid(),
  groupName: z.string(),
  seasonId: z.uuid(),
  seasonName: z.string().optional(),
  seasonNumber: z.number().int().min(1),
  awardedAt: z.iso.datetime(),
});
export type Trophy = z.infer<typeof TrophySchema>;

/** Os destaques de uma temporada encerrada (CMP-36), com quem levou (empate = todos). */
export const SeasonHighlightSchema = z.object({
  kind: z.enum(['attendance', 'streak']),
  rows: z.array(RankingRowSchema),
});
export type SeasonHighlight = z.infer<typeof SeasonHighlightSchema>;
