/** Abas da página do grupo (plano 012, GRP-29): nomes das rotas filhas de `groups/:id`. */
export type GroupTab = 'group' | 'group-teams' | 'group-members' | 'group-settings';

/** Abas visíveis: o Ajustes só para quem pode mudar alguma linha dele (GRP-29). */
export function groupTabs(showsSettings: boolean): GroupTab[] {
  const tabs: GroupTab[] = ['group', 'group-teams', 'group-members'];
  return showsSettings ? [...tabs, 'group-settings'] : tabs;
}

/** Para onde mandar quem abriu uma aba que não pode ver (os Ajustes, para quem não pode mudar nada neles); `undefined` = fica (D4). */
export function tabRedirect(routeName: string, showsSettings: boolean): GroupTab | undefined {
  return routeName === 'group-settings' && !showsSettings ? 'group' : undefined;
}

/** O fuso do grupo só aparece no cabeçalho quando muda o horário que a pessoa lê (D8). */
export function showGroupTimeZone(groupTimeZone: string, userTimeZone: string): boolean {
  return groupTimeZone !== userTimeZone;
}
