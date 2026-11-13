/** Abas da página do grupo (plano 012, GRP-29): nomes das rotas filhas de `groups/:id`. */
export type GroupTab = 'group' | 'group-teams' | 'group-members' | 'group-settings';

/** Abas visíveis: o Ajustes é só do dono (GRP-29). */
export function groupTabs(isOwner: boolean): GroupTab[] {
  const tabs: GroupTab[] = ['group', 'group-teams', 'group-members'];
  return isOwner ? [...tabs, 'group-settings'] : tabs;
}

/** Para onde mandar quem abriu uma aba que não pode ver (os Ajustes são só do dono); `undefined` = fica (D4). */
export function tabRedirect(routeName: string, isOwner: boolean): GroupTab | undefined {
  return routeName === 'group-settings' && !isOwner ? 'group' : undefined;
}

/** O fuso do grupo só aparece no cabeçalho quando muda o horário que a pessoa lê (D8). */
export function showGroupTimeZone(groupTimeZone: string, userTimeZone: string): boolean {
  return groupTimeZone !== userTimeZone;
}
