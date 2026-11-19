import { PermissionSchema } from '@scorely/contracts/src/groups';
import {
  TeamPersonIdSchema,
  TeamRuleConflictSchema,
  TeamViolationSchema,
} from '@scorely/contracts/src/teams';
import { z } from 'zod';

/**
 * Códigos de erro da API. São o contrato: o web traduz cada um via i18n (`errors.<CODE>`).
 * A `message` da resposta é em inglês e serve só para logs e devs, nunca para mostrar ao usuário.
 */
export const ErrorCodeSchema = z.enum([
  // genéricos
  'VALIDATION_ERROR',
  'INVALID_JSON',
  'MISSING_PARAM',
  'INVALID_CURSOR',
  'VERSION_CONFLICT',
  'INTERNAL_ERROR',
  // auth
  'UNAUTHORIZED',
  'SESSION_INVALID',
  'SESSION_EXPIRED',
  'AUTH_CODE_INVALID',
  'AUTH_CODE_COOLDOWN',
  'AUTH_CODE_LIMIT',
  // users
  'USER_NOT_FOUND',
  'USER_CREATE_CONFLICT',
  'USER_NICKNAME_IS_PUBLIC_ID',
  // media
  'MEDIA_NOT_FOUND',
  'MEDIA_NOT_UPLOADED',
  'MEDIA_INVALID',
  // notifications
  'NOTIFICATION_NOT_FOUND',
  // groups
  'GROUP_NOT_FOUND',
  'GROUP_NOT_OWNER',
  'GROUP_PERMISSION_DENIED',
  'GROUP_INVITE_INVALID',
  'GROUP_MEMBER_NOT_FOUND',
  'GROUP_OWNER_NOT_REMOVABLE',
  'GROUP_LAYERS_INVALID',
  'GROUP_ARCHIVED',
  'GROUP_MEMBERS_FULL',
  'GROUP_RESERVES_FULL',
  'GROUP_MEMBER_INVITE_INVALID',
  'GROUP_MIN_PLAYERS_INVALID',
  'SPORT_NOT_FOUND',
  // lugares (GRP-60–62)
  'PLACE_NOT_FOUND',
  'PLACE_LIMIT_REACHED',
  'PLACE_IS_DEFAULT',
  // horários (GRP-64–67)
  'SCHEDULE_NOT_FOUND',
  'SCHEDULE_OVERLAP',
  'SCHEDULE_LIMIT_REACHED',
  'SCHEDULE_LAST',
  'GAME_SLOTS_BELOW_CONFIRMED',
  // games
  'GAME_NOT_FOUND',
  'GAME_LIST_NOT_OPEN',
  'GAME_CLOSED',
  'GAME_CANCELLED',
  'GAME_LINK_INVALID',
  // teams
  'TEAM_PLAYER_NOT_FOUND',
  'TEAM_POSITION_INVALID',
  'TEAM_EMPTY',
  'TEAM_RULES_CONFLICT',
  'TEAM_RULES_VIOLATED',
  // competition
  'COMPETITION_TRIAL_USED',
  'COMPETITION_INACTIVE',
  'GAME_NOT_STARTED',
  'RESULT_INVALID',
  'MATCH_INVALID',
  'GAME_MATCHES_FULL',
  'MATCH_NOT_FOUND',
  'SEASON_INVALID',
  'SEASON_NOT_FOUND',
  'SEASON_CLOSED',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Issue de validação como sai no JSON (formato do Zod, só os campos que o web usa). */
export const ValidationIssueSchema = z.looseObject({
  code: z.string(),
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

/** `error.details` de cada código que tem dados extras. Os demais códigos não têm `details`. */
export const ErrorDetailsSchemas = {
  VALIDATION_ERROR: z.object({ issues: z.array(ValidationIssueSchema) }),
  MISSING_PARAM: z.object({ param: z.string() }),
  AUTH_CODE_COOLDOWN: z.object({ retryInSeconds: z.number().int().positive() }),
  MEDIA_INVALID: z.object({
    maxBytes: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  /** A permissão que faltou (GRP-04, 52). */
  GROUP_PERMISSION_DENIED: z.object({ permission: PermissionSchema }),
  GAME_LIST_NOT_OPEN: z.object({ opensAt: z.iso.datetime() }),
  GROUP_LAYERS_INVALID: z.object({ field: z.enum(['reservesOpenHoursBefore', 'guestsOpenHoursBefore']) }),
  TEAM_POSITION_INVALID: z.object({ position: z.string() }),
  /** O número do time vazio, a partir de 1 (TIM-08). */
  TEAM_EMPTY: z.object({ team: z.number().int().positive() }),
  /** O que impede o sorteio (TIM-19). */
  TEAM_RULES_CONFLICT: z.object({ conflicts: z.array(TeamRuleConflictSchema).min(1) }),
  /** O que está fora das regras ao publicar (TIM-20). */
  TEAM_RULES_VIOLATED: z.object({ violations: z.array(TeamViolationSchema).min(1) }),
  /** As vagas que valem (GRP-46): o mínimo não passa delas. */
  GROUP_MIN_PLAYERS_INVALID: z.object({ max: z.number().int().positive() }),
  SPORT_NOT_FOUND: z.object({ sportId: z.string() }),
  /** Por que a temporada foi recusada (CMP-29, 30). */
  SEASON_INVALID: z.object({
    reason: z.enum(['duration', 'past_start', 'too_far', 'overlap', 'started']),
  }),
  /** Por que a partida foi recusada (CMP-19–21); `userId` quando é uma pessoa. */
  MATCH_INVALID: z.object({
    reason: z.enum(['day_unit', 'person_unknown', 'team_empty', 'person_repeated', 'person_absent']),
    userId: TeamPersonIdSchema.optional(),
  }),
  /** Por que o fechamento do jogo foi recusado (CMP-12, 13); `userId` quando é uma pessoa. */
  RESULT_INVALID: z.object({
    reason: z.enum([
      'attendance_missing',
      'attendance_unknown',
      'winner_without_teams',
      'winner_out_of_range',
      'winner_with_match_unit',
      'cancelled_with_result',
      'absent_played',
    ]),
    userId: TeamPersonIdSchema.optional(),
  }),
  /** Quantos já estão dentro (GRP-45): as vagas não descem abaixo disso. */
  GAME_SLOTS_BELOW_CONFIRMED: z.object({ confirmed: z.number().int().nonnegative() }),
  /** ADR 0016: a versão atual do item (`0` = ele não existe mais), para a tela reler. */
  VERSION_CONFLICT: z.object({ currentVersion: z.number().int().nonnegative() }),
  /** GRP-60: quantos lugares ativos o grupo pode ter. */
  PLACE_LIMIT_REACHED: z.object({ max: z.number().int().positive() }),
  /** GRP-65: o horário ativo com que o novo bate. */
  SCHEDULE_OVERLAP: z.object({ scheduleId: z.uuid() }),
  /** GRP-64: quantos horários ativos o plano do grupo permite. */
  SCHEDULE_LIMIT_REACHED: z.object({ max: z.number().int().positive() }),
} satisfies Partial<Record<ErrorCode, z.ZodType>>;
export type ErrorDetails = {
  [C in keyof typeof ErrorDetailsSchemas]: z.infer<(typeof ErrorDetailsSchemas)[C]>;
};

/** Formato de erro retornado pela API. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
    /** Só no 500: id da requisição, para achar o log. */
    requestId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
