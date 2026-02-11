export type MenuItemStatus = 'dev' | 'disabled' | 'deprecated' | 'soon';

export interface MenuItem {
  key: string;
  label: string;
  icon: string;
  routeName: string;
  params?: Record<string, string>;
  status?: MenuItemStatus;
}

export interface MenuSection {
  title: string;
  items: MenuItem[];
}
