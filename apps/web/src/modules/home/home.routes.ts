import type { RouteRecordRaw } from 'vue-router';

const homeRoutes: RouteRecordRaw[] = [
  {
    path: 'home',
    component: () => import('./pages/HomeLayout.vue'),
    meta: { context: 'home', menuHeader: 'Início' },
    children: [
      {
        path: '',
        name: 'app.home',
        component: () => import('./pages/IndexPage.vue'),
      },
      {
        path: 'feed',
        name: 'app.home.feed',
        component: () => import('./pages/FeedPage.vue'),
        meta: { status: 'soon' },
      },
      {
        path: 'notifications',
        name: 'app.home.notifications',
        component: () => import('./pages/NotificationsPage.vue'),
        meta: { status: 'soon' },
      },
      {
        path: 'invites',
        name: 'app.home.invites',
        component: () => import('./pages/InvitesPage.vue'),
        meta: { status: 'soon' },
      },
    ],
  },
];

export default homeRoutes;
