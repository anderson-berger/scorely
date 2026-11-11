/** Um destino do menu lateral (plano 013, D2/D11). Itens novos entram em `navItems`. */
export type NavItem = { key: 'groups'; icon: string; to: { name: string } };

export function navItems(): NavItem[] {
  return [{ key: 'groups', icon: 'groups', to: { name: 'groups' } }];
}
