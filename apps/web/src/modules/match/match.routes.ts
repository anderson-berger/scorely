import type { RouteRecordRaw } from 'vue-router';

const matchRoutes: RouteRecordRaw[] = [
  {
    path: 'matches',
    name: 'app.matches',
    component: () => import('./pages/MatchesPage.vue'),
  },
  {
    path: 'matches/create',
    name: 'app.match.create',
    component: () => import('./pages/CreateMatchPage.vue'),
  },
  {
    path: 'matches/:id',
    name: 'app.match.detail',
    component: () => import('./pages/MatchDetailsPage.vue'),
  },
];

export default matchRoutes;
