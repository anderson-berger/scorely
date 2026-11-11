import type { RouteRecordRaw } from 'vue-router';

export const groupsRoutes: RouteRecordRaw[] = [
  // A tela inicial é a de Grupos (plano 013, D3); `/` continua valendo para quem tem o link.
  { path: '', redirect: { name: 'groups' } },
  // Criar grupo é um painel por cima da tela de Grupos (GRP-34): rota filha, o voltar fecha.
  {
    path: 'groups',
    name: 'groups',
    component: () => import('./pages/GroupsPage.vue'),
    children: [
      { path: 'new', name: 'group-create', component: () => import('./components/GroupCreateForm.vue') },
    ],
  },
  // Casco com as abas (plano 012, D1). `group` continua sendo o jogo, para os links que já existem.
  {
    path: 'groups/:id',
    component: () => import('./pages/GroupPage.vue'),
    children: [
      { path: '', name: 'group', component: () => import('./pages/GroupGamePage.vue') },
      { path: 'members', name: 'group-members', component: () => import('./pages/GroupMembersPage.vue') },
      { path: 'settings', name: 'group-settings', component: () => import('./pages/GroupSettingsPage.vue') },
    ],
  },
  // Não é pública: sem sessão, o guard manda para o login e volta aqui depois (caso 3).
  { path: 'join/:token', name: 'join', component: () => import('./pages/JoinPage.vue') },
  // Link do jogo para convidados (plano 007, D7). Também não é pública.
  { path: 'play/:token', name: 'play', component: () => import('./pages/PlayPage.vue') },
];
