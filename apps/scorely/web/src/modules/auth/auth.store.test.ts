import { type LoginResult, PublicUserIdSchema } from '@scorely/contracts';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';

// USR-14 (docs/modules/usuarios.md): o login guarda as preferências no navegador; ao sair, o navegador volta
// para o idioma da tela de login (último usado / idioma do navegador) e para o fuso dele.

vi.mock('@scorely/web/src/modules/auth/auth.api', () => ({
  authApi: { requestCode: vi.fn(), verifyCode: vi.fn(), logout: vi.fn(async () => undefined) },
}));
vi.mock('@scorely/web/src/modules/users/users.api', () => ({
  usersApi: { me: vi.fn(), updateMe: vi.fn(), uploadAvatar: vi.fn(), removeAvatar: vi.fn() },
}));
vi.mock('@scorely/web/src/modules/groups/groups.store', () => ({
  useGroupsStore: () => ({ reset: () => undefined }),
}));

const PREFS_KEY = 'scorely.preferences';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
    key: (i: number) => [...items.keys()][i] ?? null,
    get length() {
      return items.size;
    },
  };
}

const LOGIN: LoginResult = {
  accessToken: 'access',
  refreshToken: 'session.secret',
  expiresIn: 3600,
  isNewUser: false,
  user: {
    id: PublicUserIdSchema.parse('7K3QX9TA'),
    createdAt: '2026-01-01T00:00:00.000Z',
    email: 'ana@example.com',
    name: 'Ana',
    preferences: { locale: 'en', timeZone: 'Asia/Tokyo' },
  },
};

/** App do zero (módulos novos) num navegador em pt-BR, com o login mockado. */
async function boot() {
  vi.resetModules();
  const storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('navigator', { languages: ['pt-BR'], language: 'pt-BR' });
  const { authApi } = await import('@scorely/web/src/modules/auth/auth.api');
  vi.mocked(authApi.verifyCode).mockResolvedValue(LOGIN);
  const { useAuthStore } = await import('@scorely/web/src/modules/auth/auth.store');
  const { i18n } = await import('@scorely/web/src/i18n');
  const datetime = await import('@scorely/web/src/lib/datetime');
  setActivePinia(createPinia());
  return {
    storage,
    auth: useAuthStore(),
    locale: () => i18n.global.locale.value,
    timeZone: () => datetime.currentTimeZone(),
    detected: datetime.detectTimeZone(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auth store: preferências no navegador (USR-14)', () => {
  it('USR-14: o login aplica e guarda as preferências que vieram com a pessoa', async () => {
    const t = await boot();
    await t.auth.login('ana@example.com', '123456');
    expect(t.locale()).toBe('en');
    expect(t.timeZone()).toBe('Asia/Tokyo');
    expect(JSON.parse(t.storage.items.get(PREFS_KEY) ?? 'null')).toEqual({
      locale: 'en',
      timeZone: 'Asia/Tokyo',
    });
  });

  it('USR-14: ao sair, apaga as preferências guardadas; fica o último idioma usado e o fuso do navegador', async () => {
    const t = await boot();
    await t.auth.login('ana@example.com', '123456');
    await t.auth.logout();
    expect(t.storage.items.has(PREFS_KEY)).toBe(false);
    expect(t.locale()).toBe('en');
    expect(t.timeZone()).toBe(t.detected);
  });
});
