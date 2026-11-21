import type { GroupPermissionV2, GroupV2 } from '@scorely/contracts';

/** Uma área da barra de navegação do grupo (GRV-13). Partidas entra com a sua etapa. */
export type GroupV2NavItem = {
  key: 'home' | 'members' | 'settings';
  icon: string;
  to: { name: string };
  /** Rotas em que a área aparece como ativa (a lista de convites é parte dos Membros). */
  active: string[];
};

/** GRV-16: a pessoa pode fazer isso no grupo? A api confere de novo a cada ação. */
export function can(group: Pick<GroupV2, 'myPermissions'>, permission: GroupPermissionV2): boolean {
  return group.myPermissions.includes(permission);
}

/** GRV-13: as áreas que a pessoa vê no grupo. Configurações só com `group.edit` (GRV-14, 16). */
export function groupV2NavItems(group: GroupV2): GroupV2NavItem[] {
  const home: GroupV2NavItem = { key: 'home', icon: 'home', to: { name: 'group-v2' }, active: ['group-v2'] };
  const members: GroupV2NavItem = {
    key: 'members',
    icon: 'group',
    to: { name: 'group-v2-members' },
    active: ['group-v2-members', 'group-v2-invites'],
  };
  const settings: GroupV2NavItem = {
    key: 'settings',
    icon: 'settings',
    to: { name: 'group-v2-settings' },
    active: ['group-v2-settings'],
  };
  return can(group, 'group.edit') ? [home, members, settings] : [home, members];
}
