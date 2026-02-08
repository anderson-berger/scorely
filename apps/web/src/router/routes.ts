import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  //  PUBLIC AREA
  {
    path: '/',
    component: () => import('layouts/PublicLayout.vue'),
    meta: { requiresAuth: false },
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

  // AUTH AREA
  {
    path: '/auth',
    component: () => import('layouts/PublicLayout.vue'),
    meta: { requiresAuth: false },
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

  // PRIVATE AREA
  {
    path: '/app',
    component: () => import('layouts/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      // Home / Dashboard geral
      {
        path: '',
        name: 'app.index',
        component: () => import('pages/app/IndexPage.vue'),
      },

      {
        path: 'perfil',
        name: 'app.perfil',
        component: () => import('pages/app/perfil/PerfilPage.vue'),
      },

      // Rotas do Time (com teamId dinâmico)
      {
        path: 'team/:teamId',
        name: 'app.team',
        component: () => import('pages/app/team/TeamPage.vue'),
        children: [
          {
            path: 'dashboard',
            name: 'app.team.dashboard',
            component: () => import('pages/app/team/TeamDashboardPage.vue'),
          },
          {
            path: 'championships',
            name: 'app.team.championships',
            component: () => import('pages/app/team/TeamChampionshipsPage.vue'),
          },
          {
            path: 'calendar',
            name: 'app.team.calendar',
            component: () => import('pages/app/team/TeamCalendarPage.vue'),
          },
          {
            path: 'members',
            name: 'app.team.members',
            component: () => import('pages/app/team/TeamMembersPage.vue'),
          },
          {
            path: 'invites',
            name: 'app.team.invites',
            component: () => import('pages/app/team/TeamInvitesPage.vue'),
          },
          {
            path: 'settings',
            name: 'app.team.settings',
            component: () => import('pages/app/team/TeamSettingsPage.vue'),
          },
          {
            path: 'billing',
            name: 'app.team.billing',
            component: () => import('pages/app/team/TeamBillingPage.vue'),
          },
        ],
      },

      // Campeonatos
      {
        path: 'championship',
        name: 'app.championship',
        component: () => import('pages/app/championship/ChampionshipPage.vue'),
      },
    ],
  },

  // ❌ 404
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
    meta: { requiresAuth: false },
  },
];

export default routes;
