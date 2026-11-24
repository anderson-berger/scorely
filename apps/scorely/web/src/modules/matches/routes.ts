import type { RouteRecordRaw } from 'vue-router';

/** Partidas (docs/modules/partidas.md): áreas filhas do casco do grupo (`groups/:id`, GRV-13). */
export const matchesGroupRoutes: RouteRecordRaw[] = [
  {
    path: 'matches',
    name: 'group-matches',
    component: () => import('@scorely/web/src/modules/matches/pages/MatchListPage.vue'),
  },
  // PAR-18: o link que vai no WhatsApp.
  {
    path: 'matches/:matchId',
    name: 'group-match',
    component: () => import('@scorely/web/src/modules/matches/pages/MatchPage.vue'),
  },
  // PAR-30: a tela de dividir, só para quem tem `matches.manage` (a página leva os outros à partida).
  {
    path: 'matches/:matchId/teams',
    name: 'group-match-teams',
    component: () => import('@scorely/web/src/modules/matches/pages/MatchTeamsPage.vue'),
  },
];
