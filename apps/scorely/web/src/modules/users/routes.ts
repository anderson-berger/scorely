import type { RouteRecordRaw } from 'vue-router';

export const usersRoutes: RouteRecordRaw[] = [
  {
    path: 'profile',
    name: 'profile',
    component: () => import('@scorely/web/src/modules/users/pages/ProfilePage.vue'),
  },
];
