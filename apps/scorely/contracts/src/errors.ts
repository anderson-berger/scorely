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
  // media
  'MEDIA_NOT_FOUND',
  'MEDIA_NOT_UPLOADED',
  'MEDIA_INVALID',
  // notifications
  'NOTIFICATION_NOT_FOUND',
  // groups
  'GROUP_NOT_FOUND',
  'GROUP_NOT_OWNER',
  'GROUP_INVITE_INVALID',
  'GROUP_MEMBER_NOT_FOUND',
  'GROUP_OWNER_NOT_REMOVABLE',
  'GROUP_LAYERS_INVALID',
  'GROUP_ARCHIVED',
  'GROUP_MEMBERS_FULL',
  'GROUP_RESERVES_FULL',
  'GROUP_MEMBER_INVITE_INVALID',
  'GROUP_MIN_PLAYERS_INVALID',
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
  GAME_LIST_NOT_OPEN: z.object({ opensAt: z.iso.datetime() }),
  GROUP_LAYERS_INVALID: z.object({ field: z.enum(['reservesOpenHoursBefore', 'guestsOpenHoursBefore']) }),
  TEAM_POSITION_INVALID: z.object({ position: z.string() }),
  /** O número do time vazio, a partir de 1 (TIM-08). */
  TEAM_EMPTY: z.object({ team: z.number().int().positive() }),
  /** As vagas que valem (GRP-46): o mínimo não passa delas. */
  GROUP_MIN_PLAYERS_INVALID: z.object({ max: z.number().int().positive() }),
  /** Quantos já estão dentro (GRP-45): as vagas não descem abaixo disso. */
  GAME_SLOTS_BELOW_CONFIRMED: z.object({ confirmed: z.number().int().nonnegative() }),
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
