/** Identidade do projeto: nome do service e portas locais (únicas por projeto no monorepo). */
export const project = {
  name: 'scorely',
  ports: { http: 3010, websocket: 3011, lambda: 3012 },
} as const;

/**
 * Segredo de auth usado só no serverless offline. O env.ts recusa qualquer segredo com este prefixo
 * fora do offline; no deploy o valor vem do SSM (/scorely/<stage>/auth-secret).
 */
export const DEV_AUTH_SECRET_PREFIX = 'dev-insecure-';
export const devAuthSecret = `${DEV_AUTH_SECRET_PREFIX}local-only-secret-0123456789abcdef`;

// Só para o dev local (fallback do param tableName). Mesma convenção de infra/shared/single-table.ts
export const tableNameFor = (stage: string) => `${project.name}-${stage}`;
