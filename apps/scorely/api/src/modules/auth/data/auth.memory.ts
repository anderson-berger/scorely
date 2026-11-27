import type { AuthRepository } from '@scorely/api/src/modules/auth/data/auth.repository';
import { type LoginCode, loginCodeKey, type Session } from '@scorely/api/src/modules/auth/data/auth.table';

/** Repositório em memória com a mesma semântica condicional do DynamoDB. */
export function memoryAuth(): AuthRepository {
  const codes = new Map<string, LoginCode>();
  const sessions = new Map<string, Session>();
  return {
    getCode: async (email) => structuredClone(codes.get(loginCodeKey(email).PK)),
    putCode: async (code) => void codes.set(loginCodeKey(code.email).PK, structuredClone(code)),
    async registerAttempt(email, max) {
      const code = codes.get(loginCodeKey(email).PK);
      if (!code || code.attempts >= max) return undefined;
      code.attempts += 1;
      return structuredClone(code);
    },
    async consumeCode(email, hash) {
      if (codes.get(loginCodeKey(email).PK)?.codeHash !== hash) return false;
      return codes.delete(loginCodeKey(email).PK);
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
