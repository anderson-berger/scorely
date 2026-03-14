import type { RouteRecordRaw } from 'vue-router';
import { teamGuard } from '../guards/teamGuard';

export const teamRoutes: RouteRecordRaw[] = [
  {
    path: 't/:teamId',
    component: () => import('pages/app/team/TeamPage.vue'),
    meta: { context: 'team' },
    beforeEnter: teamGuard,
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
];
