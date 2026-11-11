import { z } from 'zod';
import { EntitySchema } from './entity';

/** Usado no sorteio misto e (depois) no MVP. */
export const GenderSchema = z.enum(['M', 'F']);
export type Gender = z.infer<typeof GenderSchema>;

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Invalid email' }));

/** Idiomas da interface (e do email do código de login). */
export const LocaleSchema = z.enum(['pt-BR', 'en']);
export type Locale = z.infer<typeof LocaleSchema>;

/** Nome canônico do fuso IANA (aliases como `Brazil/East` viram `America/Sao_Paulo`), ou `undefined` se inválido. */
function canonicalTimeZone(timeZone: string): string | undefined {
  try {
    return new Intl.DateTimeFormat('en', { timeZone }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** Fuso IANA (ex.: `America/Sao_Paulo`), validado pelo `Intl` e guardado no nome canônico. */
export const TimeZoneSchema = z
  .string()
  .trim()
  .refine((tz) => tz.length > 0 && canonicalTimeZone(tz) !== undefined, 'Invalid time zone')
  .transform((tz) => canonicalTimeZone(tz) as string);
export type TimeZone = z.infer<typeof TimeZoneSchema>;

export const UserSchema = EntitySchema.extend({
  email: z.email(),
  name: z.string().min(1).max(80).optional(),
  nickname: z.string().min(1).max(40).optional(),
  gender: GenderSchema.optional(),
  locale: LocaleSchema.optional(),
  /** Texto livre na leitura: a api valida ao gravar (plano 003, D13). */
  timeZone: z.string().optional(),
  /** URL pública da foto de perfil (USR-08: mídia `avatar`). */
  avatarUrl: z.url().optional(),
});
export type User = z.infer<typeof UserSchema>;

/** PATCH /me. `nickname: null` remove o apelido. */
export const UpdateMeInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80),
    nickname: z.string().trim().min(1).max(40).nullable(),
    gender: GenderSchema,
    locale: LocaleSchema,
    timeZone: TimeZoneSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateMeInput = z.infer<typeof UpdateMeInputSchema>;
