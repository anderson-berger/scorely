/** Um destino do menu do app (GRV-13). Itens novos entram em `navItems`. */
export type NavItem = { key: 'groups'; icon: string; to: { name: string } };

export function navItems(): NavItem[] {
  return [{ key: 'groups', icon: 'groups', to: { name: 'groups' } }];
}
