// Como o jogo e os jogadores dele são salvos e buscados (single-table, sem GSI, ADR 0014 e 0015). O jogo mora na
// partição própria, `GAME#<gameId>`, com os jogadores (`PLAYER#<userId>`) e os times (`TEAMS`, módulo de times).
// O id do jogo de um horário é `<scheduleId>_<data>` (GRP-10): a própria chave garante um jogo por ocorrência.

export const GAME_ENTITY = 'Game';
export const PLAYER_ENTITY = 'GamePlayer';

/** Prefixo da partição do jogo: os itens de outros módulos que são do jogo usam o mesmo (ADR 0014). */
export function gamePk(gameId: string) {
  return `GAME#${gameId}`;
}

/**
 * Jogo: `PK=GAME#<gameId>`, `SK=META`, `{ id, groupId, scheduleId, date, startsAt, endsAt, placeId?, slots?,
 * minPlayers?, cancelledAt?, minReachedAt? }`. Nasce na 1ª escrita (GRP-10), com `attribute_not_exists(PK)`: duas
 * confirmações ao mesmo tempo criam um jogo só. Leitura: GetItem.
 */
export function gameKey(gameId: string) {
  return { PK: gamePk(gameId), SK: 'META' };
}

/** Prefixo dos jogadores na partição do jogo: a lista é uma Query `begins_with`. */
export const PLAYER_SK_PREFIX = 'PLAYER#';

/**
 * Jogador do jogo: `PK=GAME#<gameId>`, `SK=PLAYER#<userId>`, `{ gameId, userId, confirmedAt }`. Um por pessoa
 * (GRP-20). A ordem da lista é o `confirmedAt` (e o `userId`, no empate), lida na Query da partição (GRP-18, 19).
 */
export function playerKey(gameId: string, userId: string) {
  return { PK: gamePk(gameId), SK: `${PLAYER_SK_PREFIX}${userId}` };
}

/**
 * Jogos do grupo: `PK=LOOKUP#GROUP#<groupId>#GAME`, `SK=<startsAt>#<gameId>`, `{ id }`. Gravado na transação que
 * cria o jogo. Leitura: Query → BatchGet (a competição lê os passados, CMP-11, 16).
 */
export function groupGamesLookupPk(groupId: string) {
  return `LOOKUP#GROUP#${groupId}#GAME`;
}

export function groupGameLookupKey(groupId: string, startsAt: string, gameId: string) {
  return { PK: groupGamesLookupPk(groupId), SK: `${startsAt}#${gameId}` };
}
