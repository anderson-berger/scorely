/** Abas da página do grupo (plano 012, GRP-29): nomes das rotas filhas de `groups/:id`. */
export type GroupTab = 'group' | 'group-teams' | 'group-members' | 'group-competition' | 'group-settings';

/**
 * Abas visíveis (GRP-29): a Competição só com a competição já ativada alguma vez (CMP-09), e o Ajustes só para quem
 * pode mudar alguma linha dele.
 */
export function groupTabs(showsSettings: boolean, showsCompetition = false): GroupTab[] {
  const tabs: GroupTab[] = ['group', 'group-teams', 'group-members'];
  return [
    ...tabs,
    ...(showsCompetition ? (['group-competition'] as const) : []),
    ...(showsSettings ? (['group-settings'] as const) : []),
  ];
}

/** Para onde mandar quem abriu uma aba que não pode ver (Ajustes ou Competição); `undefined` = fica (D4). */
export function tabRedirect(
  routeName: string,
  showsSettings: boolean,
  showsCompetition = false,
): GroupTab | undefined {
  if (routeName === 'group-settings' && !showsSettings) return 'group';
  if (routeName === 'group-competition' && !showsCompetition) return 'group';
  return undefined;
}

/** O fuso do grupo só aparece no cabeçalho quando muda o horário que a pessoa lê (D8). */
export function showGroupTimeZone(groupTimeZone: string, userTimeZone: string): boolean {
  return groupTimeZone !== userTimeZone;
}
