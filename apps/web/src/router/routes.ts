import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  // 🌍 PUBLIC AREA
  {
    path: '/',
    component: () => import('layouts/PublicLayout.vue'),
    children: [
      {
        path: '',
        name: 'public.home',
        component: () => import('pages/public/HomePage.vue'),
      },
      {
        path: 'teams/:alias',
        name: 'public.team',
        component: () => import('pages/public/TeamPublicPage.vue'),
      },
      {
        path: 'championships/:alias',
        name: 'public.championship',
        component: () => import('pages/public/ChampionshipPublicPage.vue'),
      },
    ],
  },

  // 🔐 AUTH AREA
  {
    path: '/auth',
    component: () => import('layouts/PublicLayout.vue'),
    children: [
      {
        path: 'login',
        name: 'auth.login',
        component: () => import('pages/auth/LoginPage.vue'),
      },
      {
        path: 'verify',
        name: 'auth.verify',
        component: () => import('pages/auth/AuthVerifyPage.vue'),
      },
    ],
  },

  // 🔒 PRIVATE AREA
  {
    path: '/app',
    component: () => import('layouts/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'app.dashboard',
        component: () => import('pages/app/DashboardPage.vue'),
      },
      {
        path: 'teams',
        name: 'app.teams',
        component: () => import('pages/app/teams/TeamListPage.vue'),
      },
      {
        path: 'teams/:id',
        name: 'app.team.detail',
        component: () => import('pages/app/teams/TeamDetailPage.vue'),
      },
      {
        path: 'teams/:id/members',
        name: 'app.team.members',
        component: () => import('pages/app/teams/TeamMembersPage.vue'),
      },
      {
        path: 'championships',
        name: 'app.championships',
        component: () => import('pages/app/championships/ChampionshipListPage.vue'),
      },
      {
        path: 'championships/:id',
        name: 'app.championship.detail',
        component: () => import('pages/app/championships/ChampionshipDetailPage.vue'),
      },
      {
        path: 'invites',
        name: 'app.invites',
        component: () => import('pages/app/InvitesPage.vue'),
      },
    ],
  },

  // ❌ 404
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;
