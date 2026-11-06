import type { RouteLocationRaw } from 'vue-router';

/** O que o guard precisa da rota de destino (o `RouteLocationNormalized` do router serve). */
export interface GuardTarget {
  name?: string | symbol | null | undefined;
  fullPath: string;
  query: Record<string, unknown>;
  meta: { public?: boolean | undefined };
}

/** Destino interno seguro: só caminho do próprio app (`/...`, não `//...`). Qualquer outra coisa → `/`. */
export function safeRedirect(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

/**
 * Para onde a navegação vai (plano 003, bloco 3). O `loadMe` fica no router; aqui é só a regra:
 * sem sessão → login (lembrando o destino); conta nova → perfil (lembrando o destino); senão segue.
 */
export function guardDecision(input: {
  to: GuardTarget;
  isAuthenticated: boolean;
  needsProfile: boolean;
}): true | RouteLocationRaw {
  const { to, isAuthenticated, needsProfile } = input;
  if (to.meta.public) {
    return to.name === 'login' && isAuthenticated ? safeRedirect(to.query.redirect) : true;
  }
  if (!isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } };
  if (needsProfile && to.name !== 'profile') {
    return { name: 'profile', query: { welcome: '1', redirect: to.fullPath } };
  }
  return true;
}
