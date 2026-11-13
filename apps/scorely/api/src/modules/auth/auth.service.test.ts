import type { EmailMessage, Mailer } from '@scorely/api/src/lib/email';
import type { AppError } from '@scorely/api/src/lib/errors';
import { range } from '@scorely/api/src/lib/fn';
import type { UserId } from '@scorely/api/src/lib/ids';
import { verifyJwt } from '@scorely/api/src/lib/jwt';
import type { AuthRepository } from '@scorely/api/src/modules/auth/auth.repository';
import { AUTH_LIMITS, createAuthService } from '@scorely/api/src/modules/auth/auth.service';
import type { LoginCode, Session } from '@scorely/api/src/modules/auth/auth.table';
import type { MeRecord, UserRecord, UserRepository } from '@scorely/api/src/modules/users/user.repository';
import { createUserService } from '@scorely/api/src/modules/users/user.service';
import {
  type Preferences,
  type PublicUserId,
  PublicUserIdSchema,
  type UpdateMeInput,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

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

type ReadOpts = { consistent?: boolean };

/**
 * Repositório de usuários em memória com as três partes da pessoa (usuarios.md, seção 3). `systemIdOf` dá o id do
 * sistema de um email: é ele que vai no JWT (USR-16), e o `user` do login só tem o público.
 */
function memoryUserRepo() {
  const profiles = new Map<UserId, UserRecord>();
  const emails = new Map<UserId, string>();
  const prefs = new Map<UserId, Preferences>();
  const me = (id: UserId): MeRecord | undefined => {
    const profile = profiles.get(id);
    const email = emails.get(id);
    if (!profile || email === undefined) return undefined;
    return structuredClone({ ...profile, email, preferences: prefs.get(id) ?? {} });
  };
  const idOf = (email: string) => [...emails.entries()].find(([, e]) => e === email)?.[0];
  const repo: UserRepository = {
    get: async (id: UserId, _opts?: ReadOpts) => structuredClone(profiles.get(id)),
    getMe: async (id: UserId, _opts?: ReadOpts) => me(id),
    getByEmail: async (email: string, _opts?: ReadOpts) => {
      const id = idOf(email);
      return id === undefined ? undefined : me(id);
    },
    getPreferences: async (id: UserId): Promise<Preferences> => structuredClone(prefs.get(id) ?? {}),
    async create(user: UserRecord, email: string) {
      if (idOf(email) !== undefined) return 'email_taken';
      if ([...profiles.values()].some((p) => p.publicId === user.publicId)) return 'public_id_taken';
      profiles.set(user.id, structuredClone(user));
      emails.set(user.id, email);
      prefs.set(user.id, {});
      return 'created';
    },
    async update(id: UserId, patch: UpdateMeInput) {
      const profile = profiles.get(id);
      const preferences = prefs.get(id);
      if (!profile || !preferences) return undefined;
      const { locale, timeZone, ...rest } = patch;
      Object.assign(preferences, { ...(locale && { locale }), ...(timeZone && { timeZone }) });
      Object.assign(profile, rest);
      return me(id);
    },
    resolve: async (codes: readonly PublicUserId[]) =>
      new Map(
        [...profiles.values()]
          .filter((u) => codes.includes(u.publicId))
          .map((u) => [u.publicId, u.id] as const),
      ),
  };
  const systemIdOf = (email: string): UserId => {
    const id = idOf(email);
    if (id === undefined) throw new Error('no user for email in memory store');
    return id;
  };
  return { repo, systemIdOf };
}

function setup() {
  const clock = { now: new Date('2026-11-06T12:00:00.000Z') };
  const sent: EmailMessage[] = [];
  const notified: string[] = [];
  const mailer: Mailer = { send: async (m) => void sent.push(m) };
  const userRepo = memoryUserRepo();
  const users = createUserService(userRepo.repo, () => clock.now);
  const service = createAuthService({
    repo: memoryAuthRepo(),
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
    const userId = t.systemIdOf(EMAIL);
    expect(t.notified).toEqual([`${userId}:welcome`]);
    expect(verifyJwt(result.accessToken, SECRET, t.nowSeconds())?.sub).toBe(userId);
  });

  it('USR-16: o JWT leva o id do sistema; a pessoa devolvida no login, só o id público', async () => {
    const t = await withCode();
    const result = await t.service.verifyCode(EMAIL, t.lastCode());
    const userId = t.systemIdOf(EMAIL);
    expect(verifyJwt(result.accessToken, SECRET, t.nowSeconds())?.sub).toBe(userId);
    expect(PublicUserIdSchema.safeParse(result.user.id).success).toBe(true);
    expect(result.user.id).not.toBe(userId);
    expect(JSON.stringify(result.user)).not.toContain(userId);
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
    expect(verifyJwt(next.accessToken, SECRET, t.nowSeconds())?.sub).toBe(t.systemIdOf(EMAIL));
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

describe('auth: idioma do email do código', () => {
  const codeIn = (text: string) => text.match(/\d{6}/)?.[0];

  it('caso 5: requestCode com locale en → assunto e texto em inglês, com o código', async () => {
    const t = setup();
    await t.service.requestCode(EMAIL, 'en');
    const email = t.sent[0];
    expect(email?.to).toBe(EMAIL);
    expect(codeIn(email?.text ?? '')).toMatch(/^\d{6}$/);
    expect(email?.subject).toMatch(/code/i);
    expect(email?.text).toMatch(/code/i);
    expect(`${email?.subject} ${email?.text}`).not.toMatch(/código|seu|expira/i);
  });

  it('caso 5: o código do email em inglês é o que vale no login', async () => {
    const t = setup();
    await t.service.requestCode(EMAIL, 'en');
    const result = await t.service.verifyCode(EMAIL, codeIn(t.sent[0]?.text ?? '') ?? '');
    expect(result.user.email).toBe(EMAIL);
  });

  it('caso 6: requestCode sem locale → email em português (igual a hoje)', async () => {
    const t = setup();
    await t.service.requestCode(EMAIL);
    const email = t.sent[0];
    expect(codeIn(email?.text ?? '')).toMatch(/^\d{6}$/);
    expect(`${email?.subject} ${email?.text}`).toMatch(/código/i);
  });

  it('caso 6: locale pt-BR explícito → mesmo email que sem locale', async () => {
    const a = setup();
    const b = setup();
    await a.service.requestCode(EMAIL);
    await b.service.requestCode(EMAIL, 'pt-BR');
    const strip = (s: string | undefined) => (s ?? '').replace(/\d{6}/g, '######');
    expect(strip(b.sent[0]?.subject)).toBe(strip(a.sent[0]?.subject));
    expect(strip(b.sent[0]?.text)).toBe(strip(a.sent[0]?.text));
  });
});

/** Mais um login de EMAIL no mesmo contexto (outro aparelho): espera o intervalo, pede e confere um código novo. */
async function loginAgain(t: ReturnType<typeof setup>) {
  t.advance(AUTH_LIMITS.resendCooldownSeconds);
  await t.service.requestCode(EMAIL);
  return t.service.verifyCode(EMAIL, t.lastCode());
}

describe('auth: a pessoa e as preferências no login e na renovação (USR-14)', () => {
  it('AUTH-06: o login devolve a pessoa com o email e as preferências (vazias numa conta nova)', async () => {
    const t = await withCode();
    const result = await t.service.verifyCode(EMAIL, t.lastCode());
    expect(result.user).toMatchObject({ email: EMAIL, preferences: {} });
    expect(result.user).not.toHaveProperty('locale');
    expect(result.user).not.toHaveProperty('timeZone');
  });

  it('AUTH-06: o login traz o idioma e o fuso guardados nas preferências', async () => {
    const t = await loggedIn();
    await t.users.update(t.systemIdOf(EMAIL), { locale: 'en', timeZone: 'Asia/Tokyo' });
    const again = await loginAgain(t);
    expect(again.user.preferences).toEqual({ locale: 'en', timeZone: 'Asia/Tokyo' });
    expect(again.user.email).toBe(EMAIL);
  });

  it('AUTH-07: a renovação devolve as preferências atuais da pessoa', async () => {
    const t = await loggedIn();
    const next = await t.service.refresh(t.tokens.refreshToken);
    expect(next.preferences).toEqual({});
  });

  it('AUTH-07: mudou num aparelho → a renovação do outro já traz as preferências novas', async () => {
    const t = await loggedIn();
    const other = await loginAgain(t);
    await t.users.update(t.systemIdOf(EMAIL), { locale: 'en', timeZone: 'Europe/Lisbon' });
    const next = await t.service.refresh(other.refreshToken);
    expect(next.preferences).toEqual({ locale: 'en', timeZone: 'Europe/Lisbon' });
    expect(next.refreshToken).not.toBe(other.refreshToken);
    expect(verifyJwt(next.accessToken, SECRET, t.nowSeconds())?.sub).toBe(t.systemIdOf(EMAIL));
  });

  it('AUTH-07: a renovação não traz o perfil nem o email, só os tokens e as preferências', async () => {
    const t = await loggedIn();
    const next = await t.service.refresh(t.tokens.refreshToken);
    expect(Object.keys(next).sort()).toEqual(['accessToken', 'expiresIn', 'preferences', 'refreshToken']);
  });
});
