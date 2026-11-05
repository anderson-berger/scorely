import { z } from 'zod';
import { DEV_AUTH_SECRET_PREFIX } from '../../project';
import { lazy } from './fn';

const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const EnvSchema = z
  .object({
    TABLE_NAME: z.string().min(1),
    AWS_REGION: z.string().default('sa-east-1'),
    DYNAMODB_ENDPOINT: optional,
    /** Definido pelo serverless-offline. */
    IS_OFFLINE: z
      .string()
      .optional()
      .transform((v) => v === 'true'),
    /** Assina os JWTs e os hashes de código/sessão. No deploy vem do SSM. */
    AUTH_SECRET: z.string().min(32),
    /** `console` só loga o email (dev); `ses` envia de verdade e exige EMAIL_FROM. */
    EMAIL_MODE: z.enum(['console', 'ses']).default('console'),
    EMAIL_FROM: optional,
  })
  .superRefine((e, ctx) => {
    if (!e.IS_OFFLINE && e.AUTH_SECRET.startsWith(DEV_AUTH_SECRET_PREFIX)) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_SECRET'],
        message: 'dev secret used outside serverless offline',
      });
    }
    if (e.EMAIL_MODE === 'ses' && !e.EMAIL_FROM) {
      ctx.addIssue({ code: 'custom', path: ['EMAIL_FROM'], message: 'required when EMAIL_MODE=ses' });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

const cachedEnv = lazy((): Env => {
  const parsed = EnvSchema.safeParse(process.env);
  // Erro comum (não ZodError): config quebrada é 500, não "dados inválidos" do cliente.
  if (!parsed.success) throw new Error(`Invalid configuration: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
});

export function env(): Env {
  return cachedEnv();
}
