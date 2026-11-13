// Como o código de login e a sessão são salvos e buscados (single-table, sem GSI).
// Os dois são internos do servidor (não estão em @scorely/contracts) e expiram: além do `ttl`
// (o DynamoDB apaga com até ~48h de atraso), o service confere o `expiresAt` ao ler.
import type { UserId } from '@scorely/api/src/lib/ids';
import type { Entity } from '@scorely/contracts';

export const LOGIN_CODE_ENTITY = 'LoginCode';
export const SESSION_ENTITY = 'Session';

/** Código de login pendente de um email (só o hash é guardado). */
export interface LoginCode {
  email: string;
  codeHash: string;
  attempts: number;
  expiresAt: string;
  sentAt: string;
  /** Janela de 1h para limitar quantos códigos um email pode pedir. */
  windowStart: string;
  windowCount: number;
}

/** Sessão de login: o refresh token é `<id>.<segredo>` e só o hash do segredo fica aqui. */
export interface Session extends Entity {
  userId: UserId;
  tokenHash: string;
  expiresAt: string;
}

/**
 * Código de login: `PK=AUTH#CODE#<email>`, `SK=META`, com `ttl`. Um por email: um novo substitui o anterior.
 * Leitura: GetItem. Tentativas contadas com `ADD attempts` antes de comparar; uso único (Delete condicional).
 */
export function loginCodeKey(email: LoginCode['email']) {
  return { PK: `AUTH#CODE#${email}`, SK: 'META' };
}

/**
 * Sessão: `PK=SESSION#<id>`, `SK=META`, com `ttl`.
 * Leitura: GetItem. A rotação do refresh token é um Update condicional no `tokenHash` atual.
 */
export function sessionKey(id: Session['id']) {
  return { PK: `SESSION#${id}`, SK: 'META' };
}
