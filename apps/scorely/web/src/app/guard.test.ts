import { describe, expect, it } from 'vitest';
import { guardDecision, safeRedirect } from './guard';

/** Rota de destino mínima, como o guard recebe do router. */
function route(
  fullPath: string,
  opts: { name?: string; query?: Record<string, unknown>; public?: boolean } = {},
) {
  return {
    name: opts.name,
    fullPath,
    query: opts.query ?? {},
    meta: opts.public ? { public: true } : {},
  };
}

const joinPath = '/join/tok-123';

describe('safeRedirect', () => {
  it('caso 3: caminho interno volta como está', () => {
    expect(safeRedirect(joinPath)).toBe(joinPath);
    expect(safeRedirect('/groups/g1?x=1')).toBe('/groups/g1?x=1');
  });

  it('caso 3: ausente, array, URL externa ou // viram /', () => {
    expect(safeRedirect(undefined)).toBe('/');
    expect(safeRedirect(null)).toBe('/');
    expect(safeRedirect('')).toBe('/');
    expect(safeRedirect([joinPath])).toBe('/');
    expect(safeRedirect('https://evil.com')).toBe('/');
    expect(safeRedirect('//evil.com')).toBe('/');
    expect(safeRedirect('join/tok')).toBe('/');
    expect(safeRedirect(42)).toBe('/');
  });
});

describe('guardDecision: caso 3 (convite sem login, parte web)', () => {
  it('caso 3: /join/<token> sem sessão → login com redirect para o convite', () => {
    const decision = guardDecision({
      to: route(joinPath, { name: 'join' }),
      isAuthenticated: false,
      needsProfile: false,
    });
    expect(decision).toEqual({ name: 'login', query: { redirect: joinPath } });
  });

  it('caso 3: login sem sessão é liberado', () => {
    const decision = guardDecision({
      to: route(`/login?redirect=${encodeURIComponent(joinPath)}`, {
        name: 'login',
        query: { redirect: joinPath },
        public: true,
      }),
      isAuthenticated: false,
      needsProfile: false,
    });
    expect(decision).toBe(true);
  });

  it('caso 3: login com sessão → volta ao redirect', () => {
    const decision = guardDecision({
      to: route('/login', { name: 'login', query: { redirect: joinPath }, public: true }),
      isAuthenticated: true,
      needsProfile: false,
    });
    expect(decision).toBe(joinPath);
  });

  it('caso 3: login com sessão e redirect externo ou ausente → /', () => {
    const external = guardDecision({
      to: route('/login', { name: 'login', query: { redirect: '//evil.com' }, public: true }),
      isAuthenticated: true,
      needsProfile: false,
    });
    const missing = guardDecision({
      to: route('/login', { name: 'login', public: true }),
      isAuthenticated: true,
      needsProfile: false,
    });
    expect(external).toBe('/');
    expect(missing).toBe('/');
  });

  it('caso 3: outra rota pública com sessão é liberada', () => {
    const decision = guardDecision({
      to: route('/about', { name: 'about', public: true }),
      isAuthenticated: true,
      needsProfile: true,
    });
    expect(decision).toBe(true);
  });

  it('caso 3: conta nova no convite → perfil com welcome e redirect para o convite', () => {
    const decision = guardDecision({
      to: route(joinPath, { name: 'join' }),
      isAuthenticated: true,
      needsProfile: true,
    });
    expect(decision).toEqual({ name: 'profile', query: { welcome: '1', redirect: joinPath } });
  });

  it('caso 3: conta nova já no perfil é liberada (sem laço)', () => {
    const decision = guardDecision({
      to: route(`/profile?welcome=1&redirect=${encodeURIComponent(joinPath)}`, {
        name: 'profile',
        query: { welcome: '1', redirect: joinPath },
      }),
      isAuthenticated: true,
      needsProfile: true,
    });
    expect(decision).toBe(true);
  });

  it('caso 3: com sessão e perfil completo, o convite é liberado', () => {
    const decision = guardDecision({
      to: route(joinPath, { name: 'join' }),
      isAuthenticated: true,
      needsProfile: false,
    });
    expect(decision).toBe(true);
  });
});
