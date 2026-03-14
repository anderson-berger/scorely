import type { RouteRecordRaw } from 'vue-router';

const championshipRoutes: RouteRecordRaw[] = [
  {
    path: 'championship',
    name: 'app.championship',
    component: () => import('./pages/ChampionshipPage.vue'),
  },
];

export default championshipRoutes;
