export interface MenuItem {
  key: string;
  label: string;
  icon: string;
  routeName: string;
  params?: Record<string, string>;
}

export type DrawerSelection =
  | { type: 'home' }
  | { type: 'profile' }
  | { type: 'team'; teamId: string };
