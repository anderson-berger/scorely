/** Tokens da sessão guardados no navegador. O storage pode falhar (aba privada, bloqueio): nunca quebra o app. */
export interface StoredSession {
  accessToken: string;
  refreshToken: string;
}

const KEY = 'scorely.session';

function read(): StoredSession | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<StoredSession>) : undefined;
    return parsed?.accessToken && parsed.refreshToken
      ? { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken }
      : undefined;
  } catch {
    return undefined;
  }
}

const state: { current: StoredSession | undefined } = { current: read() };

export const session = {
  get: () => state.current,
  set(tokens: StoredSession) {
    state.current = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
    try {
      localStorage.setItem(KEY, JSON.stringify(state.current));
    } catch {
      // segue só em memória
    }
  },
  clear() {
    state.current = undefined;
    try {
      localStorage.removeItem(KEY);
    } catch {
      // nada a fazer
    }
  },
};
