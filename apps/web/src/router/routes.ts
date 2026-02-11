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
      // Home
      {
        path: '',
        component: () => import('pages/app/home/HomeLayout.vue'),
        meta: { context: 'home', menuHeader: 'Início' },
        children: [
          {
            path: '',
            name: 'app.home',
            component: () => import('pages/app/IndexPage.vue'),
          },
          {
            path: 'matches',
            name: 'app.home.matches',
            component: () => import('pages/app/home/MatchesPage.vue'),
            meta: { status: 'dev' },
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

      // Rotas do Time (nested)
      {
        path: 'team',
        component: () => import('pages/app/team/TeamPage.vue'),
        meta: { context: 'team' },
        children: [
          {
            path: '',
            name: 'app.team',
            component: () => import('pages/app/team/TeamOverviewPage.vue'),
          },
          {
            path: 'dashboard',
            name: 'app.team.dashboard',
            component: () => import('pages/app/team/TeamDashboardPage.vue'),
          },
          {
            path: 'championships',
            name: 'app.team.championships',
            component: () => import('pages/app/team/TeamChampionshipsPage.vue'),
            meta: { status: 'soon' },
          },
          {
            path: 'calendar',
            name: 'app.team.calendar',
            component: () => import('pages/app/team/TeamCalendarPage.vue'),
            meta: { status: 'soon' },
          },
          {
            path: 'members',
            name: 'app.team.members',
            component: () => import('pages/app/team/TeamMembersPage.vue'),
            meta: { status: 'soon' },
          },
          {
            path: 'invites',
            name: 'app.team.invites',
            component: () => import('pages/app/team/TeamInvitesPage.vue'),
            meta: { status: 'soon' },
          },
          {
            path: 'settings',
            name: 'app.team.settings',
            component: () => import('pages/app/team/TeamSettingsPage.vue'),
            meta: { status: 'soon' },
          },
          {
            path: 'billing',
            name: 'app.team.billing',
            component: () => import('pages/app/team/TeamBillingPage.vue'),
            meta: { status: 'soon' },
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
