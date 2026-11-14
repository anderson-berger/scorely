// Troféus das temporadas (CMP-36, 37, docs/modules/competicao.md).

export const TROPHY_ENTITY = 'Trophy';

/** O id do troféu: a chave natural temporada × pessoa × tipo (ADR 0009). */
export function trophyId(seasonId: string, userId: string, kind: string) {
  return `${seasonId}#${userId}#${kind}`;
}

/** Entidade de relação: `PK=TROPHY#<seasonId>#<userId>#<kind>`, `SK=META`, `{ seasonId, userId, kind, groupId, awardedAt }`. */
export function trophyKey(id: string) {
  return { PK: `TROPHY#${id}`, SK: 'META' };
}

/** Lookup de listagem: `PK=LOOKUP#USER#<userId>#TROPHY`, `SK=<awardedAt>#<seasonId>#<kind>`, `{ id }` (a sala de troféus). */
export function trophyLookupPk(userId: string) {
  return `LOOKUP#USER#${userId}#TROPHY`;
}

export function trophyLookupKey(userId: string, awardedAt: string, seasonId: string, kind: string) {
  return { PK: trophyLookupPk(userId), SK: `${awardedAt}#${seasonId}#${kind}` };
}
