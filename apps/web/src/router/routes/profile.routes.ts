import type { RouteRecordRaw } from 'vue-router';

export const profileRoutes: RouteRecordRaw[] = [
  {
    path: 'profile',
    component: () => import('pages/app/profile/ProfileLayout.vue'),
    meta: { context: 'profile', menuHeader: 'Meu Perfil' },
    children: [
      {
        path: '',
        name: 'app.profile',
        component: () => import('pages/app/profile/ProfileOverviewPage.vue'),
      },
      {
        path: 'edit',
        name: 'app.profile.edit',
        component: () => import('pages/app/profile/ProfilePage.vue'),
      },
      {
        path: 'security',
        name: 'app.profile.security',
        component: () => import('pages/app/profile/SecurityPage.vue'),
        meta: { status: 'soon' },
      },
      {
        path: 'settings',
        name: 'app.profile.settings',
        component: () => import('pages/app/profile/SettingsPage.vue'),
        meta: { status: 'soon' },
      },
      {
        path: 'appearance',
        name: 'app.profile.appearance',
        component: () => import('pages/app/profile/AppearancePage.vue'),
        meta: { status: 'soon' },
      },
    ],
  },
];
