import { VersionSchema } from '@scorely/contracts/src/entity';
import { z } from 'zod';

/** Alfabeto do id público (Crockford base32: sem `I`, `L`, `O` e `U`). */
export const PUBLIC_USER_ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PUBLIC_USER_ID_LENGTH = 8;

/**
 * Id público da pessoa, o código de amigo (USR-15). É o único id de pessoa que a api devolve ou recebe:
 * o id do sistema fica só no token e no banco (USR-16, 17; ADR 0011).
 */
export const PublicUserIdSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{8}$/, 'Invalid user id')
  .brand<'PublicUserId'>();
export type PublicUserId = z.infer<typeof PublicUserIdSchema>;

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

/** Limites do nome e do apelido (USR-03). */
export const USER_LIMITS = {
  name: { min: 1, max: 80 },
  nickname: { min: 1, max: 40 },
} as const;

/**
 * O perfil da pessoa: o que os outros módulos podem ler. Sem email nem nome (USR-13) e sem preferências (USR-14).
 * `id` é o id público (USR-16): não estende o `EntitySchema`, cujo `id` é o uuid do sistema.
 * `nickname` sempre existe: nasce igual ao `id` (USR-02) e é o nome mostrado (USR-04).
 */
export const UserSchema = z.object({
  id: PublicUserIdSchema,
  createdAt: z.iso.datetime(),
  nickname: z.string().min(USER_LIMITS.nickname.min).max(USER_LIMITS.nickname.max),
  gender: GenderSchema.optional(),
  /** URL pública da foto de perfil (USR-08: mídia `avatar`). */
  avatarUrl: z.url().optional(),
});
export type User = z.infer<typeof UserSchema>;

/** Idioma e fuso da pessoa (USR-06, 07, 14). Guardados à parte do perfil; o navegador guarda uma cópia. */
export const PreferencesSchema = z.object({
  locale: LocaleSchema.optional(),
  /** Texto livre na leitura: a api valida ao gravar (plano 003, D13). */
  timeZone: z.string().optional(),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

/** Só a própria pessoa recebe (USR-13): o email e o nome. */
export const PrivateSchema = z.object({
  email: z.email(),
  name: z.string().min(USER_LIMITS.name.min).max(USER_LIMITS.name.max).optional(),
});
export type Private = z.infer<typeof PrivateSchema>;

/**
 * `GET /me`, `PATCH /me`, as rotas da foto e o `user` do login: a raiz é o perfil (como os outros veem) e a `version`;
 * `private` (USR-13) e `preferences` (USR-14) só a própria pessoa recebe. Sem `updatedAt` (ADR 0013).
 */
export const MeSchema = UserSchema.extend({
  /** USR-18: a versão do perfil, que o `PATCH /me` manda. */
  version: VersionSchema,
  private: PrivateSchema,
  preferences: PreferencesSchema,
});
export type Me = z.infer<typeof MeSchema>;

/** Há algum campo no grupo (um grupo vazio não conta como mudança). */
function hasKeys(group: unknown): boolean {
  return typeof group === 'object' && group !== null && Object.keys(group).length > 0;
}

/** PATCH /me, no mesmo formato da resposta. O apelido não pode ser removido (USR-03). */
export const UpdateMeInputSchema = z
  .object({
    nickname: z
      .string()
      .trim()
      .min(USER_LIMITS.nickname.min, 'Nickname is required')
      .max(USER_LIMITS.nickname.max),
    gender: GenderSchema,
    private: z
      .object({
        name: z.string().trim().min(USER_LIMITS.name.min, 'Name is required').max(USER_LIMITS.name.max),
      })
      .partial(),
    preferences: z.object({ locale: LocaleSchema, timeZone: TimeZoneSchema }).partial(),
  })
  .partial()
  .extend({ version: VersionSchema })
  .refine(
    (patch) =>
      Object.entries(patch).some(([key, value]) =>
        key === 'version' ? false : key === 'private' || key === 'preferences' ? hasKeys(value) : true,
      ),
    'Nothing to update',
  );
export type UpdateMeInput = z.infer<typeof UpdateMeInputSchema>;
