// Times do jogo (TIM-06, docs/modules/times.md): a divisão das pessoas de um dos próximos jogos em times, rascunho ou
// publicada. Moram na partição do jogo (ADR 0014): funciona com o jogo ainda virtual (GRP-10), porque o id do jogo é
// `<scheduleId>_<data>` e a chave se monta por ele.
import { gamePk } from '@scorely/api/src/modules/groups/game.table';

export const TEAMS_ENTITY = 'Teams';

/**
 * Entidade: `PK=GAME#<gameId>`, `SK=TEAMS`,
 * `{ gameId, groupId, date, status, teams, positions, pinned?, publishedAt?, rules?, createdAt, updatedAt }`.
 * Leitura: GetItem. Escrita: o item inteiro pelo `replaceItem` (Update que soma a `version`, ADR 0013), na versão que a
 * tela mostrou (TIM-25). Descartar: Delete, também na versão.
 */
export function teamsKey(gameId: string) {
  return { PK: gamePk(gameId), SK: 'TEAMS' };
}
