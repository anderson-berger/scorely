import type { AppError } from '@scorely/api/src/lib/errors';
import { asUserId } from '@scorely/api/src/lib/ids';
import { expect } from 'vitest';

// O setup único das notificações (ADR 0021): as pessoas e o erro de não achada. O repositório em memória fica em data/.

export async function expectNotFound(p: Promise<unknown>) {
  const err = (await p.then(
    () => undefined,
    (e: unknown) => e,
  )) as AppError | undefined;
  expect(err?.code).toBe('NOTIFICATION_NOT_FOUND');
  expect(err?.status).toBe(404);
}

export const USER = asUserId('11111111-1111-4111-8111-111111111111');
export const OTHER = asUserId('22222222-2222-4222-8222-222222222222');
