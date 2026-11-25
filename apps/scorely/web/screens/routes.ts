export interface ScreenIds {
  groupId: string;
  matchId: string;
}

export interface ScreenRoute {
  /** O nome usado no relatório, no arquivo do print e no `/screens <rota>`. */
  id: string;
  path: (ids: ScreenIds) => string;
  /** Tela vista sem sessão. */
  anonymous?: boolean;
  /** Painel por cima da tela: o texto do botão que abre (sem ele, a própria rota já é o painel). */
  panel?: { openWith?: string };
}

export const ROUTES: ScreenRoute[] = [
  { id: 'login', path: () => '/login', anonymous: true },
  { id: 'grupos', path: () => '/groups' },
  { id: 'criar-grupo', path: () => '/groups/new', panel: {} },
  { id: 'grupo', path: ({ groupId }) => `/groups/${groupId}` },
  { id: 'partidas', path: ({ groupId }) => `/groups/${groupId}/matches` },
  { id: 'partida', path: ({ groupId, matchId }) => `/groups/${groupId}/matches/${matchId}` },
  {
    id: 'nova-partida',
    path: ({ groupId }) => `/groups/${groupId}/matches`,
    panel: { openWith: 'Criar partida' },
  },
  { id: 'membros', path: ({ groupId }) => `/groups/${groupId}/members` },
  { id: 'configuracoes', path: ({ groupId }) => `/groups/${groupId}/settings` },
  { id: 'perfil', path: () => '/profile' },
];
