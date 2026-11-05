import type { User } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';
import type { EmailMessage, Mailer } from '../../lib/email';
import type { AppError } from '../../lib/errors';
import { range } from '../../lib/fn';
import { verifyJwt } from '../../lib/jwt';
import type { UserRepository } from '../users/user.repository';
import { createUserService } from '../users/user.service';
import type { AuthRepository } from './auth.repository';
import { AUTH_LIMITS, createAuthService } from './auth.service';
import type { LoginCode, Session } from './auth.table';

const SECRET = 'test-secret-with-at-least-32-characters!!';
const EMAIL = 'ana@example.com';

/** Repositório em memória com a mesma semântica condicional do DynamoDB. */
function memoryAuthRepo(): AuthRepository {
  const codes = new Map<string, LoginCode>();
  const sessions = new Map<string, Session>();
  return {
    getCode: async (email) => structuredClone(codes.get(email)),
    putCode: async (code) => void codes.set(code.email, structuredClone(code)),
    async registerAttempt(email, max) {
      const code = codes.get(email);
      if (!code || code.attempts >= max) return undefined;
      code.attempts += 1;
      return structuredClone(code);
    },
    async consumeCode(email, hash) {
      if (codes.get(email)?.codeHash !== hash) return false;
      return codes.delete(email);
    },
    getSession: async (id) => structuredClone(sessions.get(id)),
    putSession: async (s) => void sessions.set(s.id, structuredClone(s)),
    async rotateSession(id, current, next, expiresAt) {
      const s = sessions.get(id);
      if (!s || s.tokenHash !== current) return false;
      Object.assign(s, { tokenHash: next, expiresAt });
      return true;
    },
    deleteSession: async (id) => void sessions.delete(id),
  };
}

function memoryUserRepo(): UserRepository {
  const users = new Map<string, User>();
  return {
    get: async (id) => users.get(id),
    getByEmail: async (email) => [...users.values()].find((u) => u.email === email),
    async create(user) {
      if ([...users.values()].some((u) => u.email === user.email)) return false;
      users.set(user.id, user);
      return true;
    },
    async update(id, patch) {
      const user = users.get(id);
      if (!user) return undefined;
      Object.assign(user, patch);
      return user;
    },
  };
}

function setup() {
  const clock = { now: new Date('2026-11-06T12:00:00.000Z') };
  const sent: EmailMessage[] = [];
  const notified: string[] = [];
  const mailer: Mailer = { send: async (m) => void sent.push(m) };
  const service = createAuthService({
    repo: memoryAuthRepo(),
    users: createUserService(memoryUserRepo(), () => clock.now),
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
async function withCode() {
  const t = setup();
  await t.service.requestCode(EMAIL);
  return t;
}

/** Contexto com o usuário já logado. */
async function loggedIn() {
  const t = await withCode();
  const tokens = await t.service.verifyCode(EMAIL, t.lastCode());
  return { ...t, tokens };
}

const errorOf = async (p: Promise<unknown>) =>
  (await p.then(
    () => undefined,
    (e) => e,
  )) as AppError;
const wrong = (code: string) => (code === '000000' ? '111111' : '000000');

describe('auth: pedir código', () => {
  it('envia um código de 6 dígitos por email', async () => {
    const t = setup();
    const result = await t.service.requestCode(EMAIL);
    expect(result.expiresInSeconds).toBe(AUTH_LIMITS.codeTtlSeconds);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]?.to).toBe(EMAIL);
    expect(t.lastCode()).toMatch(/^\d{6}$/);
  });

  it('exige esperar antes de reenviar', async () => {
    const t = setup();
    await t.service.requestCode(EMAIL);
    const cooldown = await errorOf(t.service.requestCode(EMAIL));
    expect(cooldown).toMatchObject({ status: 429, code: 'AUTH_CODE_COOLDOWN' });
    expect(cooldown.details).toEqual({ retryInSeconds: expect.any(Number) });
    t.advance(AUTH_LIMITS.resendCooldownSeconds);
    await expect(t.service.requestCode(EMAIL)).resolves.toBeDefined();
  });

  it('limita quantos códigos por hora', async () => {
    const t = setup();
    for (const _ of range(AUTH_LIMITS.codesPerHour)) {
      await t.service.requestCode(EMAIL);
      t.advance(AUTH_LIMITS.resendCooldownSeconds);
    }
    expect(await errorOf(t.service.requestCode(EMAIL))).toMatchObject({
      status: 429,
      code: 'AUTH_CODE_LIMIT',
    });
    t.advance(60 * 60);
    await expect(t.service.requestCode(EMAIL)).resolves.toBeDefined();
  });
});

describe('auth: verificar código', () => {
  it('cria o usuário no primeiro login, avisa e devolve tokens válidos', async () => {
    const t = await withCode();
    const result = await t.service.verifyCode(EMAIL, t.lastCode());
    expect(result.isNewUser).toBe(true);
    expect(result.user.email).toBe(EMAIL);
    expect(t.notified).toEqual([`${result.user.id}:welcome`]);
    expect(verifyJwt(result.accessToken, SECRET, t.nowSeconds())?.sub).toBe(result.user.id);
  });

  it('reconhece o usuário no segundo login', async () => {
    const t = await withCode();
    const first = await t.service.verifyCode(EMAIL, t.lastCode());
    t.advance(AUTH_LIMITS.resendCooldownSeconds);
    await t.service.requestCode(EMAIL);
    const second = await t.service.verifyCode(EMAIL, t.lastCode());
    expect(second.isNewUser).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    expect(t.notified).toHaveLength(1);
  });

  it('o código é de uso único', async () => {
    const t = await withCode();
    const code = t.lastCode();
    await t.service.verifyCode(EMAIL, code);
    expect((await errorOf(t.service.verifyCode(EMAIL, code))).code).toBe('AUTH_CODE_INVALID');
  });

  it('rejeita código expirado', async () => {
    const t = await withCode();
    t.advance(AUTH_LIMITS.codeTtlSeconds);
    expect((await errorOf(t.service.verifyCode(EMAIL, t.lastCode()))).code).toBe('AUTH_CODE_INVALID');
  });

  it('bloqueia depois do limite de tentativas, mesmo com o código certo', async () => {
    const t = await withCode();
    const code = t.lastCode();
    for (const _ of range(AUTH_LIMITS.maxAttempts)) {
      expect((await errorOf(t.service.verifyCode(EMAIL, wrong(code)))).code).toBe('AUTH_CODE_INVALID');
    }
    expect((await errorOf(t.service.verifyCode(EMAIL, code))).code).toBe('AUTH_CODE_INVALID');
  });

  it('não aceita o código de outro email', async () => {
    const t = await withCode();
    expect((await errorOf(t.service.verifyCode('bia@example.com', t.lastCode()))).code).toBe(
      'AUTH_CODE_INVALID',
    );
  });
});

describe('auth: sessão', () => {
  it('refresh rotaciona o token e mantém o usuário', async () => {
    const t = await loggedIn();
    t.advance(60);
    const next = await t.service.refresh(t.tokens.refreshToken);
    expect(next.refreshToken).not.toBe(t.tokens.refreshToken);
    expect(verifyJwt(next.accessToken, SECRET, t.nowSeconds())?.sub).toBe(t.tokens.user.id);
  });

  it('reusar um refresh token antigo derruba a sessão inteira', async () => {
    const t = await loggedIn();
    const next = await t.service.refresh(t.tokens.refreshToken);
    expect((await errorOf(t.service.refresh(t.tokens.refreshToken))).status).toBe(401);
    expect((await errorOf(t.service.refresh(next.refreshToken))).status).toBe(401);
  });

  it('logout invalida o refresh token', async () => {
    const t = await loggedIn();
    const sid = verifyJwt(t.tokens.accessToken, SECRET, t.nowSeconds())?.sid ?? '';
    await t.service.logout(sid);
    expect((await errorOf(t.service.refresh(t.tokens.refreshToken))).status).toBe(401);
  });

  it('sessão expira depois de 30 dias sem uso', async () => {
    const t = await loggedIn();
    t.advance(AUTH_LIMITS.sessionTtlDays * 24 * 60 * 60);
    expect((await errorOf(t.service.refresh(t.tokens.refreshToken))).status).toBe(401);
  });

  it('rejeita refresh token malformado', async () => {
    const t = setup();
    expect((await errorOf(t.service.refresh('lixo'))).status).toBe(401);
  });
});
