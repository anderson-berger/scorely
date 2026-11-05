// Como o User é salvo e buscado (single-table, sem GSI). O formato da entidade é o `UserSchema` de @scorely/contracts.
import type { User } from '@scorely/contracts';

export const USER_ENTITY = 'User';

/**
 * Entidade: `PK=USER#<id>`, `SK=META`, com todos os atributos.
 * Leitura: GetItem.
 */
export function userKey(id: User['id']) {
  return { PK: `USER#${id}`, SK: 'META' };
}

/**
 * Lookup único por email: `PK=LOOKUP#USER#EMAIL#<email>`, `SK=META`, `{ id }`.
 * Escrita: na mesma transação do User, com `attribute_not_exists(PK)` (email em uso → falha).
 * Leitura: GetItem no lookup → GetItem em `userKey(id)`.
 * O email já chega normalizado (minúsculas, sem espaços) pelo `EmailSchema`.
 */
export function userEmailLookupKey(email: User['email']) {
  return { PK: `LOOKUP#USER#EMAIL#${email}`, SK: 'META' };
}
