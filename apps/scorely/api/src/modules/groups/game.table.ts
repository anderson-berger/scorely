// Como o jogo e a presença são salvos e buscados (single-table, sem GSI). Jogo e presença são tipos
// internos da api (`GameRecord`, `AttendanceRecord`); a resposta `Game` é montada pelo service.

export const GAME_ENTITY = 'Game';
export const ATTENDANCE_ENTITY = 'Attendance';

/** Entidade: `PK=GAME#<id>`, `SK=META`. Leitura: GetItem. */
export function gameKey(id: string) {
  return { PK: `GAME#${id}`, SK: 'META' };
}

/**
 * Lookup único do jogo pela data local: `PK=LOOKUP#GAME#<groupId>#<date>`, `SK=META`, `{ id }` (D2).
 * Escrita: na mesma transação do jogo, com `attribute_not_exists(PK)` (perdeu a corrida → relê consistente).
 */
export function gameDateLookupKey(groupId: string, date: string) {
  return { PK: `LOOKUP#GAME#${groupId}#${date}`, SK: 'META' };
}

/** Entidade: `PK=ATTENDANCE#<id>`, `SK=META`, `{ gameId, userId, confirmedAt }`. */
export function attendanceKey(id: string) {
  return { PK: `ATTENDANCE#${id}`, SK: 'META' };
}

/**
 * Ordem da lista (D4): `PK=LOOKUP#GAME#<gameId>#ATTENDANCE`, `SK=<confirmedAt>#<userId>`, `{ id }`.
 * A posição na Query é a posição na lista: `< slots` = dentro, o resto = fila.
 */
export function attendanceOrderLookupPk(gameId: string) {
  return `LOOKUP#GAME#${gameId}#ATTENDANCE`;
}

export function attendanceOrderLookupKey(a: { gameId: string; confirmedAt: string; userId: string }) {
  return { PK: attendanceOrderLookupPk(a.gameId), SK: `${a.confirmedAt}#${a.userId}` };
}

/** Lookup único da presença por usuário: `PK=LOOKUP#GAME#<gameId>#ATTENDANCE#USER#<userId>`, `SK=META`, `{ id }`. */
export function attendanceUserLookupKey(gameId: string, userId: string) {
  return { PK: `LOOKUP#GAME#${gameId}#ATTENDANCE#USER#${userId}`, SK: 'META' };
}
