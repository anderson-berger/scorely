import { hmac, randomCode, randomToken, safeEqual } from '@scorely/api/src/lib/crypto';
import type { Mailer } from '@scorely/api/src/lib/email';
import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import { signJwt } from '@scorely/api/src/lib/jwt';
import type { AuthRepository } from '@scorely/api/src/modules/auth/auth.repository';
import type { LoginCode, Session } from '@scorely/api/src/modules/auth/auth.table';
import { loginCodeEmail } from '@scorely/api/src/modules/auth/login-code.email';
import type { NotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import type { UserService } from '@scorely/api/src/modules/users/user.service';
import type { Locale, LoginResult, RefreshResult, RequestCodeResult, Tokens } from '@scorely/contracts';

export const AUTH_LIMITS = {
  codeTtlSeconds: 10 * 60,
  resendCooldownSeconds: 60,
  codesPerHour: 5,
  maxAttempts: 5,
  accessTtlSeconds: 60 * 60,
  sessionTtlDays: 30,
} as const;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface AuthDeps {
  repo: AuthRepository;
  users: UserService;
  notifications: Pick<NotificationService, 'notify'>;
  mailer: Mailer;
  secret: string;
  now?: () => Date;
}

export function createAuthService({
  repo,
  users,
  notifications,
  mailer,
  secret,
  now = () => new Date(),
}: AuthDeps) {
  const codeHash = (email: string, code: string) => hmac(secret, 'login-code', `${email}:${code}`);
  const refreshHash = (tokenSecret: string) => hmac(secret, 'refresh-token', tokenSecret);

  function accessToken(userId: UserId, sessionId: string, at: Date): Tokens['accessToken'] {
    const iat = Math.floor(at.getTime() / 1000);
    return signJwt({ sub: userId, sid: sessionId, iat, exp: iat + AUTH_LIMITS.accessTtlSeconds }, secret);
  }

  async function startSession(userId: UserId): Promise<Tokens> {
    const at = now();
    const tokenSecret = randomToken();
    const session = newEntity<Session>(
      {
        userId,
        tokenHash: refreshHash(tokenSecret),
        expiresAt: new Date(at.getTime() + AUTH_LIMITS.sessionTtlDays * DAY_MS).toISOString(),
      },
      at,
    );
    await repo.putSession(session);
    return {
      accessToken: accessToken(userId, session.id, at),
      refreshToken: `${session.id}.${tokenSecret}`,
      expiresIn: AUTH_LIMITS.accessTtlSeconds,
    };
  }

  return {
    /** Gera e envia um código de 6 dígitos, com o email no `locale` pedido. Serve para login e cadastro. */
    async requestCode(email: string, locale?: Locale): Promise<RequestCodeResult> {
      const at = now();
      const previous = await repo.getCode(email);

      if (previous) {
        const waitMs =
          new Date(previous.sentAt).getTime() + AUTH_LIMITS.resendCooldownSeconds * 1000 - at.getTime();
        if (waitMs > 0) throw appError('AUTH_CODE_COOLDOWN', { retryInSeconds: Math.ceil(waitMs / 1000) });
      }
      const sameWindow = previous && at.getTime() - new Date(previous.windowStart).getTime() < HOUR_MS;
      const windowStart = sameWindow ? previous.windowStart : at.toISOString();
      const windowCount = sameWindow ? previous.windowCount + 1 : 1;
      if (windowCount > AUTH_LIMITS.codesPerHour) {
        throw appError('AUTH_CODE_LIMIT');
      }

      const code = randomCode();
      const expiresAt = new Date(at.getTime() + AUTH_LIMITS.codeTtlSeconds * 1000);
      const record: LoginCode = {
        email,
        codeHash: codeHash(email, code),
        attempts: 0,
        expiresAt: expiresAt.toISOString(),
        sentAt: at.toISOString(),
        windowStart,
        windowCount,
      };
      // O item precisa viver até o fim da janela de limite, não só até o código expirar.
      const windowEnd = new Date(new Date(windowStart).getTime() + HOUR_MS);
      await repo.putCode(record, windowEnd > expiresAt ? windowEnd : expiresAt);

      await mailer.send({ to: email, ...loginCodeEmail(code, AUTH_LIMITS.codeTtlSeconds / 60, locale) });
      return {
        expiresInSeconds: AUTH_LIMITS.codeTtlSeconds,
        resendInSeconds: AUTH_LIMITS.resendCooldownSeconds,
      };
    },

    /** Confere o código e abre uma sessão. Cria o usuário no primeiro login. */
    async verifyCode(email: string, code: string): Promise<LoginResult> {
      // Conta a tentativa antes de comparar: chamadas em paralelo não ganham tentativas extras.
      const record = await repo.registerAttempt(email, AUTH_LIMITS.maxAttempts);
      if (!record || new Date(record.expiresAt) <= now()) throw appError('AUTH_CODE_INVALID');
      if (!safeEqual(codeHash(email, code), record.codeHash)) throw appError('AUTH_CODE_INVALID');
      if (!(await repo.consumeCode(email, record.codeHash))) throw appError('AUTH_CODE_INVALID');

      // USR-16: a sessão e o JWT usam o id do sistema; a pessoa devolvida sai com o id público.
      const { userId, me, created } = await users.findOrCreateByEmail(email);
      if (created) {
        await notifications.notify(userId, {
          type: 'welcome',
          title: 'Bem-vindo ao scorely!',
          body: 'Complete seu perfil para entrar nos grupos.',
          link: '/profile',
        });
      }
      return { ...(await startSession(userId)), user: me, isNewUser: created };
    },

    /**
     * Troca o refresh token por um novo par (rotação). Reuso de um token antigo derruba a sessão.
     * Devolve também as preferências atuais (AUTH-07, USR-14): é assim que a mudança feita em outro aparelho chega.
     */
    async refresh(refreshToken: string): Promise<RefreshResult> {
      const [sessionId, tokenSecret, ...rest] = refreshToken.split('.');
      if (!sessionId || !tokenSecret || rest.length > 0) throw appError('SESSION_INVALID');

      const session = await repo.getSession(sessionId);
      const at = now();
      if (!session || new Date(session.expiresAt) <= at) throw appError('SESSION_EXPIRED');
      if (!safeEqual(refreshHash(tokenSecret), session.tokenHash)) {
        // Token já rotacionado sendo usado de novo: provável vazamento, encerra a sessão.
        await repo.deleteSession(sessionId);
        throw appError('SESSION_INVALID');
      }

      const nextSecret = randomToken();
      const expiresAt = new Date(at.getTime() + AUTH_LIMITS.sessionTtlDays * DAY_MS).toISOString();
      if (!(await repo.rotateSession(sessionId, session.tokenHash, refreshHash(nextSecret), expiresAt))) {
        throw appError('SESSION_INVALID');
      }
      return {
        accessToken: accessToken(session.userId, sessionId, at),
        refreshToken: `${sessionId}.${nextSecret}`,
        expiresIn: AUTH_LIMITS.accessTtlSeconds,
        preferences: await users.preferences(session.userId),
      };
    },

    logout: (sessionId: string) => repo.deleteSession(sessionId),
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
