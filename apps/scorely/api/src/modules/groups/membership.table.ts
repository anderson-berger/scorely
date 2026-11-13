// Quem participa de um grupo (plano 013). A participação é uma entidade de relação com chave natural
// (ADR 0009) e tem dois lookups, um por direção de busca. Os três itens são gravados sempre juntos.
//
//   "quais grupos eu participo?"  LOOKUP#USER#<userId>#GROUP / <groupId> ─┐
//                                                                         ├─▶ MEMBERSHIP#<groupId>#<userId> / META
//   "quem participa do grupo?"    LOOKUP#GROUP#<groupId>#MEMBERSHIP / <userId> ─┘
import type { UserId } from '@scorely/api/src/lib/ids';
import type { MemberRole, StaffRoleId } from '@scorely/contracts';

export const MEMBERSHIP_ENTITY = 'Membership';

/**
 * A participação como fica no banco (tipo interno da api; a resposta é o `Member` de @scorely/contracts).
 * `createdAt` é a data de entrada e nunca muda; `roleChangedAt` é quando a reserva virou membro.
 * `memberInviteExpiresAt`: prazo do convite para membro pendente (GRP-40), conferido na leitura e na condição do aceite.
 * `staffRoleId`: o cargo (GRP-48), ausente sem cargo. Some junto com a participação (remoção e saída).
 */
export interface MembershipRecord {
  groupId: string;
  userId: UserId;
  role: MemberRole;
  createdAt: string;
  roleChangedAt?: string;
  memberInviteExpiresAt?: string;
  staffRoleId?: StaffRoleId;
}

/**
 * Entidade: `PK=MEMBERSHIP#<groupId>#<userId>`, `SK=META` (D1). A chave garante uma participação por par.
 * Leitura: GetItem ("participa? com qual papel?") ou BatchGet a partir dos lookups.
 * Escrita: Put com `attribute_not_exists(PK)` ao entrar; Update de `role` na promoção (que apaga o convite);
 * Update de `memberInviteExpiresAt` no convite (GRP-40); Update de `staffRoleId` no cargo e na transferência
 * (GRP-51, 54); Delete na remoção e na saída.
 */
export function membershipKey(groupId: string, userId: UserId) {
  return { PK: `MEMBERSHIP#${groupId}#${userId}`, SK: 'META' };
}

/**
 * Participantes do grupo (membros e reservas, D3): `PK=LOOKUP#GROUP#<groupId>#MEMBERSHIP`, `SK=<userId>`, `{ id: userId }`.
 * Leitura: Query → BatchGet em `membershipKey(groupId, id)`.
 */
export function groupMembershipsLookupPk(groupId: string) {
  return `LOOKUP#GROUP#${groupId}#MEMBERSHIP`;
}

export function groupMembershipLookupKey(groupId: string, userId: UserId) {
  return { PK: groupMembershipsLookupPk(groupId), SK: userId };
}

/**
 * Grupos do usuário: `PK=LOOKUP#USER#<userId>#GROUP`, `SK=<groupId>`, `{ id: groupId }`.
 * Leitura: Query → BatchGet em `groupKey(id)` + `membershipKey(id, userId)`.
 */
export function userGroupsLookupPk(userId: UserId) {
  return `LOOKUP#USER#${userId}#GROUP`;
}

export function userGroupLookupKey(userId: UserId, groupId: string) {
  return { PK: userGroupsLookupPk(userId), SK: groupId };
}
