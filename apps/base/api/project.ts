/** Identidade do projeto: nome do service e portas locais (únicas por projeto no monorepo). */
export const project = {
  name: 'base',
  ports: { http: 3000, websocket: 3001, lambda: 3002 },
} as const;

// Só para o dev local (fallback do param tableName). Mesma convenção de infra/shared/single-table.ts
export const tableNameFor = (stage: string) => `${project.name}-${stage}`;
