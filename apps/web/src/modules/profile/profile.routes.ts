import type { RouteRecordRaw } from 'vue-router';

const profileRoutes: RouteRecordRaw[] = [
  {
    path: 'profile',
    component: () => import('./pages/ProfileLayout.vue'),
    meta: { context: 'profile', menuHeader: 'Meu Perfil' },
    children: [
      {
        path: '',
        name: 'app.profile',
        component: () => import('./pages/ProfileOverviewPage.vue'),
      },
      {
        path: 'edit',
        name: 'app.profile.edit',
        component: () => import('./pages/ProfilePage.vue'),
      },
      {
        path: 'security',
        name: 'app.profile.security',
        component: () => import('./pages/SecurityPage.vue'),
        meta: { status: 'soon' },
      },
      {
        path: 'settings',
        name: 'app.profile.settings',
        component: () => import('./pages/SettingsPage.vue'),
        meta: { status: 'soon' },
      },
      {
        path: 'appearance',
        name: 'app.profile.appearance',
        component: () => import('./pages/AppearancePage.vue'),
        meta: { status: 'soon' },
      },
    ],
  },
];

export default profileRoutes;
