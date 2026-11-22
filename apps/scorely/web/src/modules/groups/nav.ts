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

/** GRV-13: as áreas que a pessoa vê no grupo. Configurações com `group.edit` ou `roles.manage` (GRV-14, 16). */
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
  return can(group, 'group.edit') || can(group, 'roles.manage') ? [home, members, settings] : [home, members];
}

/** Uma seção de Configurações (GRV-14) e as linhas que a pessoa pode usar nela. */
export type SettingsSection = {
  key: 'identity' | 'entry' | 'people';
  rows: ('images' | 'joinMode' | 'roles')[];
};

/** GRV-14: as seções de Configurações, na ordem; a seção sem linha para a pessoa não aparece. */
export function settingsSections(group: Pick<Group, 'myPermissions'>): SettingsSection[] {
  const sections: SettingsSection[] = [];
  if (can(group, 'group.edit')) {
    sections.push({ key: 'identity', rows: ['images'] }, { key: 'entry', rows: ['joinMode'] });
  }
  if (can(group, 'roles.manage')) sections.push({ key: 'people', rows: ['roles'] });
  return sections;
}
