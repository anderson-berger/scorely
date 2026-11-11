/** Abas da página do grupo (plano 012): nomes das rotas filhas de `groups/:id`. */
export type GroupTab = 'group' | 'group-members' | 'group-settings';

/** Abas visíveis: o Ajustes é só do dono (D3). */
export function groupTabs(isOwner: boolean): GroupTab[] {
  return isOwner ? ['group', 'group-members', 'group-settings'] : ['group', 'group-members'];
}

/** Para onde mandar quem abriu uma aba que não pode ver; `undefined` = fica (D4). */
export function tabRedirect(routeName: string, isOwner: boolean): GroupTab | undefined {
  return routeName === 'group-settings' && !isOwner ? 'group' : undefined;
}

/** O fuso do grupo só aparece no cabeçalho quando muda o horário que a pessoa lê (D8). */
export function showGroupTimeZone(groupTimeZone: string, userTimeZone: string): boolean {
  return groupTimeZone !== userTimeZone;
}
