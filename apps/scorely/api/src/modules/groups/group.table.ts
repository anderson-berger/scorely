// Como o grupo é salvo e buscado (single-table, sem GSI; docs/modules/grupos.md).
import type { GroupId, UserId } from '@scorely/api/src/lib/ids';
import type { PublicGroupId } from '@scorely/contracts';

export const GROUP_ENTITY = 'Group';
export const GROUP_MEMBER_ENTITY = 'GroupMember';

/** Grupo: `PK=GROUP#<id>`, `SK=META`, `{ id, publicId, name, createdAt, updatedAt, version }`. Leitura: GetItem. */
export function groupKey(id: GroupId) {
  return { PK: `GROUP#${id}`, SK: 'META' };
}

/**
 * Participação (GRV-02): `PK=GROUP#<id>`, `SK=MEMBER#<userId>`, `{ groupId, userId, role, createdAt }`. Entidade de
 * relação (ADR 0009): chave natural, sem `id`. Os participantes são uma Query `begins_with(SK, "MEMBER#")`.
 */
export function groupMemberKey(id: GroupId, userId: UserId) {
  return { PK: `GROUP#${id}`, SK: `MEMBER#${userId}` };
}

/**
 * Id público → grupo (GRV-08): `PK=LOOKUP#GROUP#PUBLIC#<publicId>`, `SK=META`, `{ id }`. Escrita: na transação da
 * criação, com `attribute_not_exists(PK)` (código em uso → sorteia outro). Leitura: GetItem antes de toda rota.
 */
export function groupPublicIdLookupKey(publicId: PublicGroupId) {
  return { PK: `LOOKUP#GROUP#PUBLIC#${publicId}`, SK: 'META' };
}

/**
 * Grupos da pessoa (GRV-05): `PK=LOOKUP#USER#<userId>#GROUP`, `SK=<groupId>`, `{ id }`. Leitura: Query → BatchGet
 * do `META` e da `MEMBER#<userId>` de cada grupo.
 */
export function userGroupsLookupKey(userId: UserId, id: GroupId) {
  return { PK: userGroupsLookupPk(userId), SK: id };
}

export function userGroupsLookupPk(userId: UserId) {
  return `LOOKUP#USER#${userId}#GROUP`;
}

export const GROUP_INVITE_ENTITY = 'GroupInvite';
export const GROUP_INVITE_USE_ENTITY = 'GroupInviteUse';

/** Prefixos das Queries da partição do grupo (GRV-19, 29). */
export const GROUP_MEMBER_PREFIX = 'MEMBER#';
export const GROUP_INVITE_PREFIX = 'INVITE#';
export const GROUP_INVITE_USE_PREFIX = 'INVITEUSE#';

/** Convite (GRV-18): `PK=GROUP#<id>`, `SK=INVITE#<inviteId>`. Entidade (`newEntity`). Os do grupo: Query `INVITE#`. */
export function groupInviteKey(id: GroupId, inviteId: string) {
  return { PK: `GROUP#${id}`, SK: `${GROUP_INVITE_PREFIX}${inviteId}` };
}

/** Token → convite: `PK=LOOKUP#GROUP#INVITE#<token>`, `SK=META`, `{ groupId, inviteId }` (a chave do convite). */
export function groupInviteTokenLookupKey(token: string) {
  return { PK: `LOOKUP#GROUP#INVITE#${token}`, SK: 'META' };
}

/** Quem entrou pelo convite (GRV-19): `PK=GROUP#<id>`, `SK=INVITEUSE#<inviteId>#<userId>`. Entidade de relação. */
export function groupInviteUseKey(id: GroupId, inviteId: string, userId: UserId) {
  return { PK: `GROUP#${id}`, SK: `${GROUP_INVITE_USE_PREFIX}${inviteId}#${userId}` };
}

/**
 * Convites para a pessoa (GRV-24): `PK=LOOKUP#USER#<userId>#GROUPINVITE`, `SK=<inviteId>`, `{ groupId, inviteId }`.
 * Do convite pessoal pelo id público. Leitura: Query.
 */
export function userGroupInvitesLookupKey(userId: UserId, inviteId: string) {
  return { PK: userGroupInvitesLookupPk(userId), SK: inviteId };
}

export function userGroupInvitesLookupPk(userId: UserId) {
  return `LOOKUP#USER#${userId}#GROUPINVITE`;
}

/** Convites para o email (GRV-24): `PK=LOOKUP#EMAIL#<email>#GROUPINVITE`, `SK=<inviteId>`. O email já vem normalizado. */
export function emailGroupInvitesLookupKey(email: string, inviteId: string) {
  return { PK: emailGroupInvitesLookupPk(email), SK: inviteId };
}

export function emailGroupInvitesLookupPk(email: string) {
  return `LOOKUP#EMAIL#${email}#GROUPINVITE`;
}

/** Id → convite pessoal (GRV-24, recusar): `PK=LOOKUP#GROUPINVITEID#<inviteId>`, `SK=META`, `{ groupId, inviteId }`. */
export function groupInviteIdLookupKey(inviteId: string) {
  return { PK: `LOOKUP#GROUPINVITEID#${inviteId}`, SK: 'META' };
}

export const GROUP_REQUEST_ENTITY = 'GroupJoinRequest';
export const GROUP_REQUEST_PREFIX = 'REQUEST#';

/**
 * Pedido para entrar (GRV-27): `PK=GROUP#<id>`, `SK=REQUEST#<userId>`, `{ groupId, userId, createdAt }`. Entidade de
 * relação (ADR 0009). Os do grupo: Query `REQUEST#`; o da pessoa: GetItem.
 */
export function groupRequestKey(id: GroupId, userId: UserId) {
  return { PK: `GROUP#${id}`, SK: `${GROUP_REQUEST_PREFIX}${userId}` };
}
