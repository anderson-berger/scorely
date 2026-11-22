import type { RouteRecordRaw } from 'vue-router';

/** Grupo (docs/modules/grupos.md). */
export const groupsRoutes: RouteRecordRaw[] = [
  // GRV-07: criar grupo é um painel por cima da lista (rota filha, o voltar fecha).
  {
    path: 'groups',
    name: 'groups',
    component: () => import('@scorely/web/src/modules/groups/pages/GroupsPage.vue'),
    children: [
      {
        path: 'new',
        name: 'group-create',
        component: () => import('@scorely/web/src/modules/groups/components/GroupCreateForm.vue'),
      },
    ],
  },
  // GRV-13: o casco carrega o grupo e mostra a barra; cada área é uma rota filha.
  {
    path: 'groups/:id',
    component: () => import('@scorely/web/src/modules/groups/pages/GroupPage.vue'),
    children: [
      {
        path: '',
        name: 'group',
        component: () => import('@scorely/web/src/modules/groups/pages/GroupHomePage.vue'),
      },
      {
        path: 'members',
        name: 'group-members',
        component: () => import('@scorely/web/src/modules/groups/pages/GroupMembersPage.vue'),
      },
      {
        path: 'invites',
        name: 'group-invites',
        component: () => import('@scorely/web/src/modules/groups/pages/GroupInvitesPage.vue'),
      },
      {
        path: 'roles',
        name: 'group-roles',
        component: () => import('@scorely/web/src/modules/groups/pages/GroupRolesPage.vue'),
      },
      {
        path: 'settings',
        name: 'group-settings',
        component: () => import('@scorely/web/src/modules/groups/pages/GroupSettingsPage.vue'),
      },
    ],
  },
  // GRV-35: a página do convite (sem login, a pessoa passa pelo login e volta).
  {
    path: 'join/:token',
    name: 'group-join',
    component: () => import('@scorely/web/src/modules/groups/pages/GroupJoinPage.vue'),
  },
];
