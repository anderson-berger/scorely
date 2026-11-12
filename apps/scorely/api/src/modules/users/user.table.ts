// Como o User é salvo e buscado (single-table, sem GSI). A pessoa tem três itens na mesma partição: o perfil
// (`META`, o `UserSchema` de @scorely/contracts), o email (`EMAIL`, USR-13) e as preferências (`PREFERENCES`, USR-14).
import type { Me, User } from '@scorely/contracts';

export const USER_ENTITY = 'User';

/**
 * Perfil: `PK=USER#<id>`, `SK=META`, com os atributos do `UserSchema` e o `avatarMediaId` (sem email nem preferências).
 * Leitura: GetItem.
 */
export function userKey(id: User['id']) {
  return { PK: `USER#${id}`, SK: 'META' };
}

/**
 * Lookup único por email: `PK=LOOKUP#USER#EMAIL#<email>`, `SK=META`, `{ id }`.
 * Escrita: na mesma transação do perfil e do email, com `attribute_not_exists(PK)` (email em uso → falha).
 * Leitura: GetItem no lookup → BatchGet do perfil, do email e das preferências (`getMe`).
 * O email já chega normalizado (minúsculas, sem espaços) pelo `EmailSchema`.
 */
export function userEmailLookupKey(email: Me['email']) {
  return { PK: `LOOKUP#USER#EMAIL#${email}`, SK: 'META' };
}

export const USER_EMAIL_ENTITY = 'UserEmail';
export const USER_PREFERENCES_ENTITY = 'UserPreferences';

/**
 * Email da conta (USR-13): `PK=USER#<id>`, `SK=EMAIL`, `{ email }`. Fora do perfil: só o auth e o `GET /me` leem.
 * Escrita: na transação da criação (com o perfil, as preferências e o lookup). Nunca muda (USR-01).
 */
export function userEmailKey(id: User['id']) {
  return { PK: `USER#${id}`, SK: 'EMAIL' };
}

/**
 * Preferências (USR-06, 07, 14): `PK=USER#<id>`, `SK=PREFERENCES`, `{ locale?, timeZone?, updatedAt }`.
 * Escrita: nasce vazia na criação; muda pelo `PATCH /me`, na mesma transação do perfil. Leitura: GetItem
 * (refresh, GRP-13) ou junto com o perfil e o email no `GET /me`.
 */
export function userPreferencesKey(id: User['id']) {
  return { PK: `USER#${id}`, SK: 'PREFERENCES' };
}
