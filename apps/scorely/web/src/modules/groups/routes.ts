import type { RouteRecordRaw } from 'vue-router';

export const groupsRoutes: RouteRecordRaw[] = [
  // A tela inicial é a de Grupos (plano 013, D3); `/` continua valendo para quem tem o link.
  { path: '', redirect: { name: 'groups' } },
  // Criar grupo é um painel por cima da tela de Grupos (GRP-34): rota filha, o voltar fecha.
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
  // Casco com as abas (plano 012, D1). `group` continua sendo o jogo, para os links que já existem.
  {
    path: 'groups/:id',
    component: () => import('@scorely/web/src/modules/groups/pages/GroupPage.vue'),
    children: [
      {
        path: '',
        name: 'group',
        component: () => import('@scorely/web/src/modules/groups/pages/GroupGamePage.vue'),
      },
      // GRP-29: os times do jogo numa aba própria (TIM-14).
      {
        path: 'teams',
        name: 'group-teams',
        component: () => import('@scorely/web/src/modules/groups/pages/GroupTeamsPage.vue'),
      },
      {
        path: 'members',
        name: 'group-members',
        component: () => import('@scorely/web/src/modules/groups/pages/GroupMembersPage.vue'),
      },
      {
        path: 'settings',
        name: 'group-settings',
        component: () => import('@scorely/web/src/modules/groups/pages/GroupSettingsPage.vue'),
      },
    ],
  },
  // Não é pública: sem sessão, o guard manda para o login e volta aqui depois (caso 3).
  {
    path: 'join/:token',
    name: 'join',
    component: () => import('@scorely/web/src/modules/groups/pages/JoinPage.vue'),
  },
  // Link do jogo para convidados (plano 007, D7). Também não é pública.
  {
    path: 'play/:token',
    name: 'play',
    component: () => import('@scorely/web/src/modules/groups/pages/PlayPage.vue'),
  },
];
