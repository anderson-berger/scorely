// Como o grupo v2 é salvo e buscado (single-table, sem GSI; docs/modules/grupos-v2.md, ADR 0017). O prefixo
// `GROUP2` é provisório: na troca, volta a `GROUP`.
import type { GroupId, UserId } from '@scorely/api/src/lib/ids';
import type { PublicGroupId } from '@scorely/contracts';

export const GROUP_V2_ENTITY = 'GroupV2';
export const GROUP_V2_MEMBER_ENTITY = 'GroupV2Member';

/** Grupo: `PK=GROUP2#<id>`, `SK=META`, `{ id, publicId, name, createdAt, updatedAt, version }`. Leitura: GetItem. */
export function groupV2Key(id: GroupId) {
  return { PK: `GROUP2#${id}`, SK: 'META' };
}

/**
 * Participação (GRV-02): `PK=GROUP2#<id>`, `SK=MEMBER#<userId>`, `{ groupId, userId, role, createdAt }`. Entidade de
 * relação (ADR 0009): chave natural, sem `id`. Os participantes são uma Query `begins_with(SK, "MEMBER#")`.
 */
export function groupV2MemberKey(id: GroupId, userId: UserId) {
  return { PK: `GROUP2#${id}`, SK: `MEMBER#${userId}` };
}

/**
 * Id público → grupo (GRV-08): `PK=LOOKUP#GROUP2#PUBLIC#<publicId>`, `SK=META`, `{ id }`. Escrita: na transação da
 * criação, com `attribute_not_exists(PK)` (código em uso → sorteia outro). Leitura: GetItem antes de toda rota.
 */
export function groupV2PublicIdLookupKey(publicId: PublicGroupId) {
  return { PK: `LOOKUP#GROUP2#PUBLIC#${publicId}`, SK: 'META' };
}

/**
 * Grupos da pessoa (GRV-05): `PK=LOOKUP#USER#<userId>#GROUP2`, `SK=<groupId>`, `{ id }`. Leitura: Query → BatchGet
 * do `META` e da `MEMBER#<userId>` de cada grupo.
 */
export function userGroupsV2LookupKey(userId: UserId, id: GroupId) {
  return { PK: userGroupsV2LookupPk(userId), SK: id };
}

export function userGroupsV2LookupPk(userId: UserId) {
  return `LOOKUP#USER#${userId}#GROUP2`;
}

export const GROUP_V2_INVITE_ENTITY = 'GroupV2Invite';
export const GROUP_V2_INVITE_USE_ENTITY = 'GroupV2InviteUse';

/** Prefixos das Queries da partição do grupo (GRV-19, 29). */
export const GROUP_V2_MEMBER_PREFIX = 'MEMBER#';
export const GROUP_V2_INVITE_PREFIX = 'INVITE#';
export const GROUP_V2_INVITE_USE_PREFIX = 'INVITEUSE#';

/** Convite (GRV-18): `PK=GROUP2#<id>`, `SK=INVITE#<inviteId>`. Entidade (`newEntity`). Os do grupo: Query `INVITE#`. */
export function groupV2InviteKey(id: GroupId, inviteId: string) {
  return { PK: `GROUP2#${id}`, SK: `${GROUP_V2_INVITE_PREFIX}${inviteId}` };
}

/** Token → convite: `PK=LOOKUP#GROUP2#INVITE#<token>`, `SK=META`, `{ groupId, inviteId }` (a chave do convite). */
export function groupV2InviteTokenLookupKey(token: string) {
  return { PK: `LOOKUP#GROUP2#INVITE#${token}`, SK: 'META' };
}

/** Quem entrou pelo convite (GRV-19): `PK=GROUP2#<id>`, `SK=INVITEUSE#<inviteId>#<userId>`. Entidade de relação. */
export function groupV2InviteUseKey(id: GroupId, inviteId: string, userId: UserId) {
  return { PK: `GROUP2#${id}`, SK: `${GROUP_V2_INVITE_USE_PREFIX}${inviteId}#${userId}` };
}
