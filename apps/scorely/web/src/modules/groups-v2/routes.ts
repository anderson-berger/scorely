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
  // GRV-13: o casco carrega o grupo e mostra a barra; cada área é uma rota filha.
  {
    path: 'v2/groups/:id',
    component: () => import('@scorely/web/src/modules/groups-v2/pages/GroupV2Page.vue'),
    children: [
      {
        path: '',
        name: 'group-v2',
        component: () => import('@scorely/web/src/modules/groups-v2/pages/GroupV2HomePage.vue'),
      },
      {
        path: 'members',
        name: 'group-v2-members',
        component: () => import('@scorely/web/src/modules/groups-v2/pages/GroupV2MembersPage.vue'),
      },
      {
        path: 'invites',
        name: 'group-v2-invites',
        component: () => import('@scorely/web/src/modules/groups-v2/pages/GroupV2InvitesPage.vue'),
      },
      {
        path: 'settings',
        name: 'group-v2-settings',
        component: () => import('@scorely/web/src/modules/groups-v2/pages/GroupV2SettingsPage.vue'),
      },
    ],
  },
  // GRV-35: a página do convite (sem login, a pessoa passa pelo login e volta).
  {
    path: 'v2/join/:token',
    name: 'group-v2-join',
    component: () => import('@scorely/web/src/modules/groups-v2/pages/GroupV2JoinPage.vue'),
  },
];
