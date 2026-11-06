import type { RouteRecordRaw } from 'vue-router';

export const groupsRoutes: RouteRecordRaw[] = [
  { path: 'groups/new', name: 'group-create', component: () => import('./pages/GroupCreatePage.vue') },
  { path: 'groups/:id', name: 'group', component: () => import('./pages/GroupPage.vue') },
  // Não é pública: sem sessão, o guard manda para o login e volta aqui depois (caso 3).
  { path: 'join/:token', name: 'join', component: () => import('./pages/JoinPage.vue') },
  // Link do jogo para convidados (plano 007, D7). Também não é pública.
  { path: 'play/:token', name: 'play', component: () => import('./pages/PlayPage.vue') },
];
