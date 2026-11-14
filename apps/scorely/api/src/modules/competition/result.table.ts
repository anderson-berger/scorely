// Fechamento de cada jogo na competição (CMP-11–16, docs/modules/competicao.md).

export const GAME_RESULT_ENTITY = 'GameResult';

/**
 * Entidade: `PK=GAME_RESULT#<gameId>`, `SK=META`, com a cópia do regulamento, os membros e as reservas do 1º
 * fechamento, a chamada, os times copiados, o vencedor e o amistoso (ids do sistema ou do avulso).
 * 1º fechamento: Put com `attribute_not_exists(PK)`, junto com o lookup. Correção: Update com `attribute_exists(PK)`.
 */
export function gameResultKey(gameId: string) {
  return { PK: `GAME_RESULT#${gameId}`, SK: 'META' };
}

/** Lookup de listagem: `PK=LOOKUP#GROUP#<groupId>#GAME_RESULT`, `SK=<startsAt>#<gameId>`, `{ id: gameId }`. */
export function gameResultLookupPk(groupId: string) {
  return `LOOKUP#GROUP#${groupId}#GAME_RESULT`;
}

export function gameResultLookupKey(groupId: string, startsAt: string, gameId: string) {
  return { PK: gameResultLookupPk(groupId), SK: `${startsAt}#${gameId}` };
}
