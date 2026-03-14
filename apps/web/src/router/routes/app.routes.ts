import type { RouteRecordRaw } from 'vue-router';
import { profileRoutes } from './profile.routes';
import { teamRoutes } from './team.routes';
import { matchRoutes } from './match.routes';

export const appRoutes: RouteRecordRaw[] = [
  {
    path: '/app',
    component: () => import('layouts/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      // Redirect /app → /app/home
      {
        path: '',
        redirect: { name: 'app.home' },
      },

      // Home workspace
      {
        path: 'home',
        component: () => import('pages/app/home/HomeLayout.vue'),
        meta: { context: 'home', menuHeader: 'Início' },
        children: [
          {
            path: '',
            name: 'app.home',
            component: () => import('pages/app/IndexPage.vue'),
          },
          {
            path: 'feed',
            name: 'app.home.feed',
            component: () => import('pages/app/home/FeedPage.vue'),
            meta: { status: 'soon' },
          },
          {
            path: 'notifications',
            name: 'app.home.notifications',
            component: () => import('pages/app/home/NotificationsPage.vue'),
            meta: { status: 'soon' },
          },
          {
            path: 'invites',
            name: 'app.home.invites',
            component: () => import('pages/app/home/InvitesPage.vue'),
            meta: { status: 'soon' },
          },
        ],
      },

      // Profile workspace
      ...profileRoutes,

      // Team workspaces — /app/t/:teamId/...
      ...teamRoutes,

      // Matches (standalone)
      ...matchRoutes,

      // Campeonatos
      {
        path: 'championship',
        name: 'app.championship',
        component: () => import('pages/app/championship/ChampionshipPage.vue'),
      },
    ],
  },
];
