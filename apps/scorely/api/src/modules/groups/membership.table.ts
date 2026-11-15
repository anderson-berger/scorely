// Quem participa de um grupo (ADR 0009, 0014, 0015). A participação é uma entidade de relação com chave natural e
// mora na partição do grupo: "os membros do grupo" é uma Query nela, sem lookup. A outra direção ("meus grupos") tem
// o seu lookup, gravado sempre junto com a participação.
//
//   "quem participa do grupo?"   GROUP#<groupId> / MEMBER#<userId>   (Query begins_with "MEMBER")
//   "quais grupos eu participo?" LOOKUP#USER#<userId>#GROUP / <groupId> ─▶ GROUP#<groupId> / META, SETTINGS, INVITES, MEMBER#<userId>
import type { UserId } from '@scorely/api/src/lib/ids';
import { groupPk } from '@scorely/api/src/modules/groups/group.table';
import type { MemberTier, RoleId } from '@scorely/contracts';

export const MEMBERSHIP_ENTITY = 'Membership';
export const MEMBER_INVITE_ENTITY = 'MemberInvite';

/**
 * A participação como fica no banco (tipo interno da api; a resposta é o `Member` de @scorely/contracts).
 * `createdAt` é a data de entrada e nunca muda (GRP-03). `tier` é o papel (membro ou reserva); `roleId`, o cargo
 * (GRP-48, 50), sempre presente. Some na remoção e na saída.
 */
export interface MembershipRecord {
  groupId: string;
  userId: UserId;
  tier: MemberTier;
  roleId: RoleId;
  createdAt: string;
}

/** Convite para membro pendente (GRP-40), com `ttl` (ADR 0004): o service confere o `expiresAt`. */
export interface MemberInviteRecord {
  groupId: string;
  userId: UserId;
  expiresAt: string;
}

/** Prefixo comum de `MEMBER#` e `MEMBER_INVITE#`: uma Query traz as participações e os convites juntos. */
export const MEMBER_SK_PREFIX = 'MEMBER';

/**
 * Participação: `PK=GROUP#<groupId>`, `SK=MEMBER#<userId>`. A chave garante uma participação por par.
 * Escrita: Put com `attribute_not_exists(PK)` ao entrar; Update de `tier` na promoção; Update de `roleId` no cargo e na
 * transferência (GRP-51, 54); Delete na remoção e na saída.
 */
export function membershipKey(groupId: string, userId: UserId) {
  return { PK: groupPk(groupId), SK: `MEMBER#${userId}` };
}

/**
 * Convite para membro: `PK=GROUP#<groupId>`, `SK=MEMBER_INVITE#<userId>`, `{ expiresAt, ttl }` (GRP-40). Apagado na
 * promoção (link ou aceite), na recusa, no cancelamento, na remoção e na saída.
 */
export function memberInviteKey(groupId: string, userId: UserId) {
  return { PK: groupPk(groupId), SK: `MEMBER_INVITE#${userId}` };
}

/**
 * Grupos do usuário: `PK=LOOKUP#USER#<userId>#GROUP`, `SK=<groupId>`, `{ id: groupId }`.
 * Leitura: Query → BatchGet dos itens do grupo e da participação.
 */
export function userGroupsLookupPk(userId: UserId) {
  return `LOOKUP#USER#${userId}#GROUP`;
}

export function userGroupLookupKey(userId: UserId, groupId: string) {
  return { PK: userGroupsLookupPk(userId), SK: groupId };
}
