import type { RouteRecordRaw } from 'vue-router';

/** Competição (docs/modules/competicao.md): áreas filhas do casco do grupo (`groups/:id`, GRV-13). */
export const competitionsGroupRoutes: RouteRecordRaw[] = [
  // COM-12: a lista.
  {
    path: 'competitions',
    name: 'group-competitions',
    component: () => import('@scorely/web/src/modules/groups/competitions/pages/CompetitionListPage.vue'),
  },
  // COM-13: a página da competição, com o ranking.
  {
    path: 'competitions/:competitionId',
    name: 'group-competition',
    component: () => import('@scorely/web/src/modules/groups/competitions/pages/CompetitionPage.vue'),
  },
];
