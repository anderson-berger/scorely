import { lazy } from '@base/api/src/lib/fn';
import { z } from 'zod';

const EnvSchema = z.object({
  TABLE_NAME: z.string().min(1),
  AWS_REGION: z.string().default('sa-east-1'),
  DYNAMODB_ENDPOINT: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type Env = z.infer<typeof EnvSchema>;

const cachedEnv = lazy(() => EnvSchema.parse(process.env));

export function env(): Env {
  return cachedEnv();
}
