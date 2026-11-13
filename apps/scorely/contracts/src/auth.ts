import { EmailSchema, LocaleSchema, MeSchema, PreferencesSchema } from '@scorely/contracts/src/users';
import { z } from 'zod';

/** Código de login: 6 dígitos. */
export const CodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Code must have 6 digits');

/** `locale`: idioma do email com o código (padrão `pt-BR`). A web manda o idioma efetivo. */
export const RequestCodeInputSchema = z.object({ email: EmailSchema, locale: LocaleSchema.optional() });
export type RequestCodeInput = z.infer<typeof RequestCodeInputSchema>;

export const RequestCodeResultSchema = z.object({
  expiresInSeconds: z.number().int().positive(),
  resendInSeconds: z.number().int().nonnegative(),
});
export type RequestCodeResult = z.infer<typeof RequestCodeResultSchema>;

export const VerifyCodeInputSchema = z.object({
  email: EmailSchema,
  code: CodeSchema,
});
export type VerifyCodeInput = z.infer<typeof VerifyCodeInputSchema>;

export const RefreshInputSchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshInput = z.infer<typeof RefreshInputSchema>;

export const TokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Validade do access token, em segundos. */
  expiresIn: z.number().int().positive(),
});
export type Tokens = z.infer<typeof TokensSchema>;

/** `POST /auth/refresh`: o par novo e as preferências atuais (AUTH-07, USR-14). */
export const RefreshResultSchema = TokensSchema.extend({ preferences: PreferencesSchema });
export type RefreshResult = z.infer<typeof RefreshResultSchema>;

/** `POST /auth/verify`: os tokens e a pessoa, com o email e as preferências (AUTH-06, USR-14). */
export const LoginResultSchema = TokensSchema.extend({
  user: MeSchema,
  isNewUser: z.boolean(),
});
export type LoginResult = z.infer<typeof LoginResultSchema>;
