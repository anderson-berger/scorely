// Partidas de cada jogo na competição (CMP-19–22, docs/modules/competicao.md).

export const MATCH_ENTITY = 'Match';
export const MATCH_COUNTERS_ENTITY = 'MatchCounters';

/** Entidade: `PK=MATCH#<id>`, `SK=META`, `{ id, gameId, groupId, teams, winner, createdAt, updatedAt }`. */
export function matchKey(id: string) {
  return { PK: `MATCH#${id}`, SK: 'META' };
}

/** Lookup de listagem: `PK=LOOKUP#GAME#<gameId>#MATCH`, `SK=<createdAt>#<id>`, `{ id }` (a ordem das partidas). */
export function matchLookupPk(gameId: string) {
  return `LOOKUP#GAME#${gameId}#MATCH`;
}

export function matchLookupKey(gameId: string, createdAt: string, id: string) {
  return { PK: matchLookupPk(gameId), SK: `${createdAt}#${id}` };
}

/** Contagem: `PK=MATCHES#<gameId>`, `SK=COUNTERS`, `{ matchCount }`, com `ADD` na transação (limite, CMP-20). */
export function matchCountersKey(gameId: string) {
  return { PK: `MATCHES#${gameId}`, SK: 'COUNTERS' };
}
