import { GroupInviteInvalidReasonSchema, GroupPermissionSchema } from '@scorely/contracts/src/groups';
import { MatchGuestStatusSchema } from '@scorely/contracts/src/matches';
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
  'GROUP_PERMISSION_DENIED',
  'GROUP_INVITE_INVALID',
  'GROUP_INVITE_NOT_FOR_YOU',
  'GROUP_INVITE_LIMIT',
  'GROUP_MEMBER_NOT_FOUND',
  'GROUP_OWNER_NOT_REMOVABLE',
  'GROUP_REQUEST_NOT_FOUND',
  'GROUP_ROLE_TOO_HIGH',
  'GROUP_OWNER_ONLY',
  'GROUP_ROLE_NOT_FOUND',
  'GROUP_ROLE_NAME_TAKEN',
  'GROUP_ROLE_LIMIT',
  // matches
  'MATCH_NOT_FOUND',
  'MATCH_LIMIT',
  'MATCH_SERIES_NOT_FOUND',
  'MATCH_SERIES_LIMIT',
  'MATCH_SERIES_ENDED',
  'MATCH_NOT_OPEN_FOR_YOU',
  'MATCH_CLOSED',
  'MATCH_STARTED',
  'MATCH_CANCELLED',
  'MATCH_SLOTS_BELOW_CONFIRMED',
  'MATCH_GUEST_NOT_FOUND',
  'MATCH_GUEST_NOT_PENDING',
  'MATCH_GUEST_DUPLICATE',
  'MATCH_GUEST_LIMIT',
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
  /** A permissão que faltou (GRV-15). */
  GROUP_PERMISSION_DENIED: z.object({ permission: GroupPermissionSchema }),
  /** Por que o convite não vale (GRV-21). */
  GROUP_INVITE_INVALID: z.object({ reason: GroupInviteInvalidReasonSchema }),
  /** GRV-18: o máximo de convites ativos. */
  GROUP_INVITE_LIMIT: z.object({ limit: z.number().int().positive() }),
  /** GRV-44: o máximo de cargos criados. */
  GROUP_ROLE_LIMIT: z.object({ limit: z.number().int().positive() }),
  /** PAR-01: o máximo de partidas por vir. */
  MATCH_LIMIT: z.object({ limit: z.number().int().positive() }),
  /** PAR-20: o máximo de repetições ativas. */
  MATCH_SERIES_LIMIT: z.object({ limit: z.number().int().positive() }),
  /** PAR-08, 12, 13: a hora em que a onda abre; ausente quando a onda de convidados está desligada. */
  MATCH_NOT_OPEN_FOR_YOU: z.object({ opensAt: z.iso.datetime().optional() }),
  /** PAR-06: quantos já estão dentro. */
  MATCH_SLOTS_BELOW_CONFIRMED: z.object({ confirmed: z.number().int().nonnegative() }),
  /** PAR-13, 14: a situação atual do convidado. */
  MATCH_GUEST_NOT_PENDING: z.object({ status: MatchGuestStatusSchema }),
  /** PAR-12: o máximo de convidados ativos. */
  MATCH_GUEST_LIMIT: z.object({ limit: z.number().int().positive() }),
  /** ADR 0016: a versão atual do item (`0` = ele não existe mais), para a tela reler. */
  VERSION_CONFLICT: z.object({ currentVersion: z.number().int().nonnegative() }),
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
