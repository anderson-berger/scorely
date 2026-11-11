// Times do jogo (TIM-06, docs/modules/times.md): a divisão das pessoas do jogo atual em times, rascunho ou publicada.
// Chave natural pelo jogo (grupo + data), como o `LOOKUP#GAME`: funciona com o jogo ainda virtual (GRP-10).
// Sem lookup: só se lê pelo jogo atual, e a chave se monta pela data.

export const TEAMS_ENTITY = 'Teams';

/**
 * Entidade: `PK=TEAMS#<groupId>#<date>`, `SK=META`,
 * `{ groupId, date, status, teams, positions, publishedAt?, createdAt, updatedAt }`.
 * Leitura: GetItem. Escrita: Put do item inteiro (um dono só, vale o último, ver "Limites" do doc). Descartar: Delete.
 */
export function teamsKey(groupId: string, date: string) {
  return { PK: `TEAMS#${groupId}#${date}`, SK: 'META' };
}
