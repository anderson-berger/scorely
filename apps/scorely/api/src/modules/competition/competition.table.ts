import { groupPk } from '@scorely/api/src/modules/groups/group.table';

// Competição do grupo (CMP-01–07, docs/modules/competicao.md): ativação e regulamento.
// Um item por grupo, na partição do grupo. Sem item, a competição está desativada (CMP-01).

export const COMPETITION_ENTITY = 'Competition';

/**
 * Entidade: `PK=GROUP#<groupId>`, `SK=COMPETITION` (na partição do grupo, ADR 0014),
 * `{ groupId, plan, activeUntil, trialStartedAt, rules, createdAt, updatedAt }`.
 * Leitura: GetItem. Criar (CMP-02): Put com `attribute_not_exists(PK)` (um teste por grupo).
 * Regulamento (CMP-07): Update com `activeUntil > :now` (não grava no instante em que vence).
 */
export function competitionKey(groupId: string) {
  return { PK: groupPk(groupId), SK: 'COMPETITION' };
}
