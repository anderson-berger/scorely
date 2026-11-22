import type { Group, GroupPermission } from '@scorely/contracts';

/** Uma área da barra de navegação do grupo (GRV-13). Partidas entra com a sua etapa. */
export type GroupNavItem = {
  key: 'home' | 'members' | 'settings';
  icon: string;
  to: { name: string };
  /** Rotas em que a área aparece como ativa (a lista de convites é parte dos Membros). */
  active: string[];
};

/** GRV-16: a pessoa pode fazer isso no grupo? A api confere de novo a cada ação. */
export function can(group: Pick<Group, 'myPermissions'>, permission: GroupPermission): boolean {
  return group.myPermissions.includes(permission);
}

/** GRV-13: as áreas que a pessoa vê no grupo. Configurações só com `group.edit` (GRV-14, 16). */
export function groupNavItems(group: Group): GroupNavItem[] {
  const home: GroupNavItem = { key: 'home', icon: 'home', to: { name: 'group' }, active: ['group'] };
  const members: GroupNavItem = {
    key: 'members',
    icon: 'group',
    to: { name: 'group-members' },
    active: ['group-members', 'group-invites'],
  };
  const settings: GroupNavItem = {
    key: 'settings',
    icon: 'settings',
    to: { name: 'group-settings' },
    active: ['group-settings'],
  };
  return can(group, 'group.edit') ? [home, members, settings] : [home, members];
}
