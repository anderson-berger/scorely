// Regras de handlers (.claude/rules/api.md): toda rota HTTP aponta para um método desestruturado de
// `handlers({...})` ou `authHandlers({...})`; rota com authorizer ⇔ método em `authHandlers`.
// Nenhum código lê o header Authorization fora de `src/lib/auth.ts`.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apiSources, type FunctionConfig, loadConfig, projects, ROOT, read } from './lib';

type Kind = 'handlers' | 'authHandlers';

/** Nomes exportados por `export const { a, b } = handlers({` / `authHandlers({`. */
function exportedHandlers(text: string): Map<string, Kind> {
  const found = new Map<string, Kind>();
  for (const m of text.matchAll(/export const \{([^}]+)\}\s*=\s*(authHandlers|handlers)\(/g)) {
    for (const name of (m[1] as string)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      found.set(name, m[2] as Kind);
    }
  }
  return found;
}

interface Route {
  fn: string;
  handlerFile: string;
  exportName: string;
  hasAuthorizer: boolean;
}

function routes(functions: Record<string, FunctionConfig>): Route[] {
  return Object.entries(functions).flatMap(([fn, cfg]) => {
    const http = (cfg.events ?? []).filter((e) => e.httpApi);
    if (!http.length) return [];
    const dot = cfg.handler.lastIndexOf('.');
    return [
      {
        fn,
        handlerFile: `${cfg.handler.slice(0, dot)}.ts`,
        exportName: cfg.handler.slice(dot + 1),
        hasAuthorizer: http.some((e) => typeof e.httpApi === 'object' && e.httpApi.authorizer !== undefined),
      },
    ];
  });
}

function routeViolations(list: Route[], exportsOf: (file: string) => Map<string, Kind>): string[] {
  return list.flatMap((r) => {
    const kind = exportsOf(r.handlerFile).get(r.exportName);
    if (!kind) return [`${r.fn}: ${r.handlerFile} não exporta \`${r.exportName}\` via handlers/authHandlers`];
    if (r.hasAuthorizer && kind !== 'authHandlers')
      return [`${r.fn}: rota com authorizer deve usar authHandlers`];
    if (!r.hasAuthorizer && kind === 'authHandlers') return [`${r.fn}: authHandlers em rota sem authorizer`];
    return [];
  });
}

function authHeaderViolations(files: { path: string; text: string }[]): string[] {
  return files
    .filter(
      (f) => !f.path.endsWith('/src/lib/auth.ts') && /headers\??\.\s*\[?['"]?authorization/i.test(f.text),
    )
    .map((f) => `${f.path}: lê o header Authorization (use authHandlers / auth.userId)`);
}

describe.each(projects())('api: %s', (project) => {
  it('rotas ↔ handlers/authHandlers', async () => {
    const config = await loadConfig(project);
    const exportsOf = (file: string) => {
      const path = join('apps', project, 'api', file);
      return existsSync(join(ROOT, path)) ? exportedHandlers(read(path)) : new Map<string, Kind>();
    };
    const list = routes(config.functions ?? {});
    expect(list.length).toBeGreaterThan(0);
    expect(routeViolations(list, exportsOf)).toEqual([]);
  });

  it('Authorization só em src/lib/auth.ts', () => {
    const files = apiSources(project).map((path) => ({ path, text: read(path) }));
    expect(authHeaderViolations(files)).toEqual([]);
  });
});

describe('api: os checks pegam a violação plantada', () => {
  const file = 'export const { me } = authHandlers({});\nexport const { health } = handlers({});';
  const exportsOf = () => exportedHandlers(file);
  const route = (exportName: string, hasAuthorizer: boolean): Route => ({
    fn: exportName,
    handlerFile: 'h.ts',
    exportName,
    hasAuthorizer,
  });

  it('rota com authorizer usando handlers', () => {
    expect(routeViolations([route('health', true)], exportsOf)).toHaveLength(1);
  });
  it('authHandlers sem authorizer', () => {
    expect(routeViolations([route('me', false)], exportsOf)).toHaveLength(1);
  });
  it('export solto (`export const x = handler(...)`)', () => {
    expect(routeViolations([route('loose', false)], exportsOf)).toHaveLength(1);
  });
  it('rotas certas passam', () => {
    expect(routeViolations([route('me', true), route('health', false)], exportsOf)).toEqual([]);
  });
  it('header Authorization fora de lib/auth.ts', () => {
    const text = 'const h = event.headers?.authorization;';
    expect(authHeaderViolations([{ path: 'apps/x/api/src/modules/a/handlers.ts', text }])).toHaveLength(1);
    expect(authHeaderViolations([{ path: 'apps/x/api/src/lib/auth.ts', text }])).toEqual([]);
  });
});
