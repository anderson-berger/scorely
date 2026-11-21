import type { GroupV2 } from '@scorely/contracts';

/** Uma área da barra de navegação do grupo (GRV-13). Áreas novas (Membros, Partidas) entram com as suas etapas. */
export type GroupV2NavItem = { key: 'home' | 'settings'; icon: string; to: { name: string } };

/** GRV-13: as áreas que a pessoa vê no grupo. Configurações só para o dono (GRV-14). Com menos de 2, a tela esconde a barra. */
export function groupV2NavItems(group: GroupV2): GroupV2NavItem[] {
  const home: GroupV2NavItem = { key: 'home', icon: 'home', to: { name: 'group-v2' } };
  const settings: GroupV2NavItem = { key: 'settings', icon: 'settings', to: { name: 'group-v2-settings' } };
  return group.myRole === 'owner' ? [home, settings] : [home];
}
