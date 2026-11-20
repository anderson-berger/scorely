import type { RouteRecordRaw } from 'vue-router';

/** Grupo v2 (ADR 0017): rotas em `/v2`, ao lado do grupo antigo. */
export const groupsV2Routes: RouteRecordRaw[] = [
  // GRV-07: criar grupo é um painel por cima da lista (rota filha, o voltar fecha).
  {
    path: 'v2/groups',
    name: 'groups-v2',
    component: () => import('@scorely/web/src/modules/groups-v2/pages/GroupsV2Page.vue'),
    children: [
      {
        path: 'new',
        name: 'group-v2-create',
        component: () => import('@scorely/web/src/modules/groups-v2/components/GroupV2CreateForm.vue'),
      },
    ],
  },
  {
    path: 'v2/groups/:id',
    name: 'group-v2',
    component: () => import('@scorely/web/src/modules/groups-v2/pages/GroupV2Page.vue'),
  },
];
