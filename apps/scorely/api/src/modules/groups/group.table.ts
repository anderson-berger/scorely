// Como o grupo é salvo e buscado (single-table, sem GSI, ADR 0014 e 0015). Tudo o que é do grupo mora na partição
// `GROUP#<id>`: a identidade (`META`), o padrão do jogo (`SETTINGS`), os links (`INVITES`), a contagem (`COUNTERS`) e
// as participações (`MEMBER#<userId>`, em `membership.table.ts`). O service enxerga o `StoredGroup`, que junta os três
// primeiros (o repositório monta e separa).
import type { Group } from '@scorely/contracts';

export const GROUP_ENTITY = 'Group';
export const GROUP_SETTINGS_ENTITY = 'GroupSettings';
export const GROUP_INVITES_ENTITY = 'GroupInvites';

/** Prefixo da partição do grupo: os itens de outros módulos que são do grupo usam o mesmo (ADR 0014). */
export function groupPk(id: Group['id']) {
  return `GROUP#${id}`;
}

/**
 * A identidade: `PK=GROUP#<id>`, `SK=META`, `{ id, name, sportId, timeZone, archivedAt?, logoMediaId?, coverMediaId? }`.
 * Sem segredo, sem dono e sem padrão do jogo: todo módulo lê por GetItem (ou confere `archivedAt` num ConditionCheck).
 */
export function groupKey(id: Group['id']) {
  return { PK: groupPk(id), SK: 'META' };
}

/**
 * O padrão do jogo (GRP-14, 16, 38, 45, 46): `PK=GROUP#<id>`, `SK=SETTINGS`, `{ weekday, time, defaultPlaceId?, slots,
 * minPlayers?, listOpensHoursBefore, reservesOpenHoursBefore, guestsOpenHoursBefore?, maxMembers, maxReserves }`.
 * Escrita: o `PATCH /groups/{id}`. A condição do limite (GRP-39) confere o `maxMembers`/`maxReserves` daqui.
 */
export function groupSettingsKey(id: Group['id']) {
  return { PK: groupPk(id), SK: 'SETTINGS' };
}

/**
 * Os links (GRP-07): `PK=GROUP#<id>`, `SK=INVITES`, `{ inviteToken, reserveInviteToken, guestToken }`. Fora do `META`
 * por ser segredo (ADR 0014). Apagado ao arquivar e recriado com tokens novos ao desarquivar (GRP-31, 33).
 */
export function groupInvitesKey(id: Group['id']) {
  return { PK: groupPk(id), SK: 'INVITES' };
}

/**
 * Contagem do grupo (GRP-39): `PK=GROUP#<id>`, `SK=COUNTERS`, `{ memberCount, reserveCount }`.
 * Nasce na criação do grupo; muda com `ADD` na mesma transação da entrada, da promoção, da remoção e da saída.
 * A condição do limite fica neste item (`memberCount < :max`), com um `ConditionCheck` no `SETTINGS` de que o limite
 * lido não mudou.
 */
export function groupCountersKey(id: Group['id']) {
  return { PK: groupPk(id), SK: 'COUNTERS' };
}

/**
 * Lookup único do convite: `PK=LOOKUP#GROUP#INVITE#<token>`, `SK=META`, `{ id }` (D9).
 * Escrita: na criação do grupo e na troca do convite (Delete do antigo + Put do novo + Update do `INVITES`).
 * Leitura: GetItem no lookup → o grupo pelo id.
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

/**
 * Grupos de um esporte (GRP-58): `PK=LOOKUP#SPORT#<sportId>#GROUP`, `SK=<groupId>`, `{ id }`. Gravado na transação
 * que cria o grupo (o esporte não muda). Leitura futura: o filtro por esporte (Query → BatchGet).
 */
export function sportGroupLookupKey(sportId: string, groupId: Group['id']) {
  return { PK: `LOOKUP#SPORT#${sportId}#GROUP`, SK: groupId };
}

export const PLACE_ENTITY = 'Place';

/** Prefixo dos lugares na partição do grupo: a lista é uma Query `begins_with`. */
export const PLACE_SK_PREFIX = 'PLACE#';

/**
 * Lugar do grupo (GRP-60, 61): `PK=GROUP#<id>`, `SK=PLACE#<placeId>`, `{ id, groupId, name, address, lat, lng,
 * archivedAt? }`. Nunca apagado, só arquivado. O limite de ativos é o `placeCount` do `COUNTERS`.
 */
export function placeKey(groupId: Group['id'], placeId: string) {
  return { PK: groupPk(groupId), SK: `${PLACE_SK_PREFIX}${placeId}` };
}
