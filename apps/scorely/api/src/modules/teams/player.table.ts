// Jogador no grupo (TIM-01, docs/modules/times.md): as posições de uma pessoa num grupo, valendo também para
// convidados. Entidade de relação com chave natural (ADR 0009), separada da participação (o convidado não tem uma).
// Sem lookup: quem aparece vem dos membros e do jogo atual, e a chave se monta pelo par.

export const PLAYER_ENTITY = 'Player';

/**
 * Entidade: `PK=PLAYER#<groupId>#<userId>`, `SK=META`, `{ groupId, userId, positions, createdAt, updatedAt }`.
 * Leitura: BatchGet pelas chaves do par. Escrita: Update (upsert), com `createdAt` só na primeira vez.
 */
export function playerKey(groupId: string, userId: string) {
  return { PK: `PLAYER#${groupId}#${userId}`, SK: 'META' };
}
