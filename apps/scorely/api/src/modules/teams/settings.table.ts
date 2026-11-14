// Configuração de times do grupo (TIM-17, docs/modules/times.md): quantidade padrão, regras e "permitir publicar fora".
// Um item por grupo, chave natural pelo grupo. Sem item, vale o padrão (o service monta).

export const TEAM_SETTINGS_ENTITY = 'TeamSettings';

/**
 * Entidade: `PK=TEAM_SETTINGS#<groupId>`, `SK=META`,
 * `{ groupId, teamCount, rules, allowOutsideRules, createdAt, updatedAt }`.
 * Leitura: GetItem. Escrita: o item inteiro pelo `replaceItem` (Update que soma a `version`, ADR 0013; só o dono muda,
 * vale o último).
 */
export function teamSettingsKey(groupId: string) {
  return { PK: `TEAM_SETTINGS#${groupId}`, SK: 'META' };
}
