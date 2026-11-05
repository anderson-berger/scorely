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
  // notifications
  'NOTIFICATION_NOT_FOUND',
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
