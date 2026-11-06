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
