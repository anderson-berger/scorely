// Temporadas do grupo (CMP-29–34, docs/modules/competicao.md).

export const SEASON_ENTITY = 'Season';

/**
 * Entidade: `PK=SEASON#<id>`, `SK=META`, `{ id, groupId, number, name?, startDate, endDate, rules, closedAt?, final?,
 * createdAt, updatedAt }`. Criar e cancelar: a entidade e o lookup numa transação. Mudar o início troca o lookup.
 */
export function seasonKey(id: string) {
  return { PK: `SEASON#${id}`, SK: 'META' };
}

/** Lookup de listagem: `PK=LOOKUP#GROUP#<groupId>#SEASON`, `SK=<startDate>#<id>`, `{ id }`. */
export function seasonLookupPk(groupId: string) {
  return `LOOKUP#GROUP#${groupId}#SEASON`;
}

export function seasonLookupKey(groupId: string, startDate: string, id: string) {
  return { PK: seasonLookupPk(groupId), SK: `${startDate}#${id}` };
}

/**
 * Lookup das temporadas que ainda vão travar (CMP-39, ADR 0012): `PK=LOOKUP#SEASON#OPEN`, `SK=<endDate>#<id>`, `{ id }`.
 * A rotina diária lê as de fim já passado; sai na transação que grava o ranking final.
 */
export const SEASON_OPEN_PK = 'LOOKUP#SEASON#OPEN';

export function seasonOpenKey(endDate: string, id: string) {
  return { PK: SEASON_OPEN_PK, SK: `${endDate}#${id}` };
}
