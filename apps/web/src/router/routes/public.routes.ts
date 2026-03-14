import type { RouteRecordRaw } from 'vue-router';

export const publicRoutes: RouteRecordRaw[] = [
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
];
