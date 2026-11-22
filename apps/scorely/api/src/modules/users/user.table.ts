// Como o User é salvo e buscado (single-table, sem GSI). A pessoa tem três itens na mesma partição: o perfil
// (`META`, o `UserSchema` de @scorely/contracts), a parte privada (`PRIVATE`: email e nome, USR-13) e as preferências
// (`PREFERENCES`, USR-14). Só o `META` é entidade (`createdAt`, `updatedAt` e `version`, ADR 0013): a parte privada e as
// preferências têm só `createdAt` e a `version` da pessoa é a do perfil (USR-18).
import { normalizeEmail } from '@scorely/api/src/lib/email';
import type { UserId } from '@scorely/api/src/lib/ids';
import type { Private, PublicUserId } from '@scorely/contracts';

export const USER_ENTITY = 'User';

/**
 * Perfil: `PK=USER#<id>`, `SK=META`, com os atributos do `UserSchema` (o `id` aqui é o do sistema), o `publicId`
 * (USR-15), o `nickname` (nasce = `publicId`, USR-02) e o `avatarMediaId` (sem email, nome nem preferências; a URL
 * da foto é montada na resposta, MID-12). Leitura: GetItem.
 */
export function userKey(id: UserId) {
  return { PK: `USER#${id}`, SK: 'META' };
}

/**
 * Lookup único pelo id público (USR-15, 17): `PK=LOOKUP#USER#PUBLIC#<publicId>`, `SK=META`, `{ id }`.
 * Escrita: na transação da criação, com `attribute_not_exists(PK)` (código em uso → sorteia outro).
 * Leitura: BatchGet para traduzir ids públicos da entrada em ids do sistema (`resolve`).
 */
export function userPublicIdLookupKey(publicId: PublicUserId) {
  return { PK: `LOOKUP#USER#PUBLIC#${publicId}`, SK: 'META' };
}

/**
 * Lookup único por email: `PK=LOOKUP#USER#EMAIL#<email>`, `SK=META`, `{ id }`.
 * Escrita: na mesma transação do perfil e da parte privada, com `attribute_not_exists(PK)` (email em uso → falha).
 * Leitura: GetItem no lookup → BatchGet do perfil, da parte privada e das preferências (`getMe`).
 * A chave normaliza o email (sem espaços nas pontas e em minúsculas, USR-01), como a do auth.
 */
export function userEmailLookupKey(email: Private['email']) {
  return { PK: `LOOKUP#USER#EMAIL#${normalizeEmail(email)}`, SK: 'META' };
}

export const USER_PRIVATE_ENTITY = 'UserPrivate';
export const USER_PREFERENCES_ENTITY = 'UserPreferences';

/**
 * Parte privada (USR-13): `PK=USER#<id>`, `SK=PRIVATE`, `{ email, name?, createdAt }` (não é entidade: sem
 * `updatedAt` nem `version`). Fora do perfil: só o auth e o `GET /me` leem. Escrita: na transação da criação (com o perfil, as preferências e os lookups); o `name` muda pelo
 * `PATCH /me`, na mesma transação do perfil. O email nunca muda (USR-01).
 */
export function userPrivateKey(id: UserId) {
  return { PK: `USER#${id}`, SK: 'PRIVATE' };
}

/**
 * Preferências (USR-06, 07, 14): `PK=USER#<id>`, `SK=PREFERENCES`, `{ locale?, timeZone?, createdAt }` (não é
 * entidade: sem `updatedAt` nem `version`). Escrita: nasce vazia na criação; o `PATCH /me` só altera
 * (`attribute_exists(PK)`), na mesma transação do perfil. Leitura: GetItem
 * (refresh, USR-14) ou junto com o perfil e o email no `GET /me`.
 */
export function userPreferencesKey(id: UserId) {
  return { PK: `USER#${id}`, SK: 'PREFERENCES' };
}
