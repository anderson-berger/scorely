import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Raiz do monorepo. */
export const ROOT = join(import.meta.dirname, '..');

const SKIP = new Set(['node_modules', 'dist', '.serverless', '.turbo', '.esbuild', 'coverage']);

/** Projetos com api (`apps/<projeto>/api`). */
export function projects(): string[] {
  return readdirSync(join(ROOT, 'apps')).filter((p) =>
    existsSync(join(ROOT, 'apps', p, 'api', 'serverless.ts')),
  );
}

/** Arquivos (caminho relativo à raiz) sob `dir`, recursivo, sem pastas geradas. */
export function filesUnder(dir: string, match: (path: string) => boolean = () => true): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(abs, name);
    const rel = relative(ROOT, path);
    if (statSync(path).isDirectory()) return filesUnder(rel, match);
    return match(rel) ? [rel] : [];
  });
}

export function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

/** Código de produção da api (sem testes). */
export function apiSources(project: string): string[] {
  return filesUnder(`apps/${project}/api/src`, (p) => p.endsWith('.ts') && !p.endsWith('.test.ts'));
}

export interface HttpEvent {
  httpApi?: { method?: string; path?: string; authorizer?: unknown } | string;
}

export interface FunctionConfig {
  handler: string;
  events?: HttpEvent[];
}

/** O que os checks leem do `serverless.ts` (tipo mínimo, sem depender do @serverless/typescript). */
export interface ApiConfig {
  resources?: unknown;
  provider: { iam?: { role?: { statements?: { Action?: string[] }[] } } };
  functions?: Record<string, FunctionConfig>;
}

export async function loadConfig(project: string): Promise<ApiConfig> {
  const mod = (await import(join(ROOT, 'apps', project, 'api', 'serverless.ts'))) as { default: ApiConfig };
  return mod.default;
}
