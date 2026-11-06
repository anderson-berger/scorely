// Como o Group e os membros são salvos e buscados (single-table, sem GSI). O formato do grupo é o
// `GroupSchema` de @scorely/contracts. Membro não tem entidade na E1: são dois lookups (plano 003, D8).
import type { Group } from '@scorely/contracts';

export const GROUP_ENTITY = 'Group';

/**
 * Entidade: `PK=GROUP#<id>`, `SK=META`, com todos os atributos (inclusive `inviteToken`).
 * Leitura: GetItem.
 */
export function groupKey(id: Group['id']) {
  return { PK: `GROUP#${id}`, SK: 'META' };
}

/**
 * Lookup único do convite: `PK=LOOKUP#GROUP#INVITE#<token>`, `SK=META`, `{ id }` (D9).
 * Escrita: na criação do grupo e na troca do convite (Delete do antigo + Put do novo + Update do grupo).
 * Leitura: GetItem no lookup → GetItem em `groupKey(id)`.
 */
export function groupInviteLookupKey(token: string) {
  return { PK: `LOOKUP#GROUP#INVITE#${token}`, SK: 'META' };
}

/**
 * Membros do grupo: `PK=LOOKUP#GROUP#<groupId>#MEMBER`, `SK=<userId>`, `{ id: userId }`.
 * Leitura: GetItem (é membro?) ou Query em `groupMembersLookupPk(groupId)` (lista).
 */
export function groupMembersLookupPk(groupId: Group['id']) {
  return `LOOKUP#GROUP#${groupId}#MEMBER`;
}

export function groupMemberLookupKey(groupId: Group['id'], userId: string) {
  return { PK: groupMembersLookupPk(groupId), SK: userId };
}

/**
 * Grupos do usuário: `PK=LOOKUP#USER#<userId>#GROUP`, `SK=<groupId>`, `{ id: groupId }`.
 * Escrita: sempre junto com `groupMemberLookupKey`. Leitura: Query em `userGroupsLookupPk(userId)`.
 */
export function userGroupsLookupPk(userId: string) {
  return `LOOKUP#USER#${userId}#GROUP`;
}

export function userGroupLookupKey(userId: string, groupId: Group['id']) {
  return { PK: userGroupsLookupPk(userId), SK: groupId };
}

/**
 * Reservas do grupo (plano 007, D4): `PK=LOOKUP#GROUP#<groupId>#RESERVE`, `SK=<userId>`, `{ id: userId }`.
 * Escrita: junto com `userGroupLookupKey` (o mesmo de membro). Leitura: GetItem (é reserva?) ou Query (lista).
 */
export function groupReservesLookupPk(groupId: Group['id']) {
  return `LOOKUP#GROUP#${groupId}#RESERVE`;
}

export function groupReserveLookupKey(groupId: Group['id'], userId: string) {
  return { PK: groupReservesLookupPk(groupId), SK: userId };
}

/** Lookup único do link de reserva: `PK=LOOKUP#GROUP#RESERVE_INVITE#<token>`, `SK=META`, `{ id }` (D5). */
export function groupReserveInviteLookupKey(token: string) {
  return { PK: `LOOKUP#GROUP#RESERVE_INVITE#${token}`, SK: 'META' };
}

/** Lookup único do link do jogo (convidados): `PK=LOOKUP#GROUP#GUEST#<token>`, `SK=META`, `{ id }` (D5, D7). */
export function groupGuestLookupKey(token: string) {
  return { PK: `LOOKUP#GROUP#GUEST#${token}`, SK: 'META' };
}
