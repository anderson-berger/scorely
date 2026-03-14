import type { RouteRecordRaw } from 'vue-router';

export const matchRoutes: RouteRecordRaw[] = [
  {
    path: 'matches',
    name: 'app.matches',
    component: () => import('src/modules/match/pages/MatchesPage.vue'),
  },
  {
    path: 'matches/create',
    name: 'app.match.create',
    component: () => import('src/modules/match/pages/CreateMatchPage.vue'),
  },
  {
    path: 'matches/:id',
    name: 'app.match.detail',
    component: () => import('src/modules/match/pages/MatchDetailsPage.vue'),
  },
];
