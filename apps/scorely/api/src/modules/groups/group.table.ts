// Como o Group é salvo e buscado (single-table, sem GSI). O formato do grupo é o `GroupSchema` de
// @scorely/contracts. Quem participa do grupo (membro/reserva) fica em `membership.table.ts` (plano 013).
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
 * Contagem do grupo (GRP-39): `PK=GROUP#<id>`, `SK=COUNTERS`, `{ memberCount, reserveCount }`.
 * Nasce na criação do grupo; muda com `ADD` na mesma transação da entrada, da promoção, da remoção e da saída.
 * A condição do limite fica neste item (`memberCount < :max`), com um `ConditionCheck` no `META` de que o limite
 * lido não mudou.
 */
export function groupCountersKey(id: Group['id']) {
  return { PK: `GROUP#${id}`, SK: 'COUNTERS' };
}

/**
 * Lookup único do convite: `PK=LOOKUP#GROUP#INVITE#<token>`, `SK=META`, `{ id }` (D9).
 * Escrita: na criação do grupo e na troca do convite (Delete do antigo + Put do novo + Update do grupo).
 * Leitura: GetItem no lookup → GetItem em `groupKey(id)`.
 */
export function groupInviteLookupKey(token: string) {
  return { PK: `LOOKUP#GROUP#INVITE#${token}`, SK: 'META' };
}

/** Lookup único do link de reserva: `PK=LOOKUP#GROUP#RESERVE_INVITE#<token>`, `SK=META`, `{ id }` (D5). */
export function groupReserveInviteLookupKey(token: string) {
  return { PK: `LOOKUP#GROUP#RESERVE_INVITE#${token}`, SK: 'META' };
}

/** Lookup único do link do jogo (convidados): `PK=LOOKUP#GROUP#GUEST#<token>`, `SK=META`, `{ id }` (D5, D7). */
export function groupGuestLookupKey(token: string) {
  return { PK: `LOOKUP#GROUP#GUEST#${token}`, SK: 'META' };
}
