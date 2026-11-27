import type { EmailMessage, Mailer } from '@scorely/api/src/lib/email';
import type { AppError } from '@scorely/api/src/lib/errors';
import { createAuthService } from '@scorely/api/src/modules/auth/auth.service';
import { memoryAuth } from '@scorely/api/src/modules/auth/data/auth.memory';
import { memoryUsers } from '@scorely/api/src/modules/users/data/users.memory';
import { createUserService } from '@scorely/api/src/modules/users/users.service';

// O setup único do auth (ADR 0021): relógio fake, repositórios em memória, email e avisos guardados.

export const SECRET = 'test-secret-with-at-least-32-characters!!';
export const EMAIL = 'ana@example.com';

export function setup() {
  const clock = { now: new Date('2026-11-06T12:00:00.000Z') };
  const sent: EmailMessage[] = [];
  const notified: string[] = [];
  const mailer: Mailer = { send: async (m) => void sent.push(m) };
  const userRepo = memoryUsers();
  const users = createUserService(userRepo.repo, () => clock.now);
  const service = createAuthService({
    repo: memoryAuth(),
    users,
    notifications: {
      async notify(userId, n) {
        notified.push(`${userId}:${n.type}`);
        return {} as never;
      },
    },
    mailer,
    secret: SECRET,
    now: () => clock.now,
  });
  return {
    service,
    users,
    systemIdOf: userRepo.systemIdOf,
    sent,
    notified,
    advance: (seconds: number) => {
      clock.now = new Date(clock.now.getTime() + seconds * 1000);
    },
    lastCode: () => sent.at(-1)?.subject.slice(0, 6) ?? '',
    nowSeconds: () => Math.floor(clock.now.getTime() / 1000),
  };
}

/** Contexto com um código já enviado para EMAIL. */
export async function withCode() {
  const t = setup();
  await t.service.requestCode(EMAIL);
  return t;
}

/** Contexto com o usuário já logado. */
export async function loggedIn() {
  const t = await withCode();
  const tokens = await t.service.verifyCode(EMAIL, t.lastCode());
  return { ...t, tokens };
}

export const errorOf = async (p: Promise<unknown>) =>
  (await p.then(
    () => undefined,
    (e) => e,
  )) as AppError;
export const wrong = (code: string) => (code === '000000' ? '111111' : '000000');
