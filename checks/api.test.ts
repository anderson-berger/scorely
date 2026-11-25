// Regras de handlers (.claude/rules/api.md): toda rota HTTP aponta para uma `export async function` do
// handlers.ts que responde por `route(event, ...)` ou `authRoute(event, ...)`; rota com authorizer ⇔ `authRoute`.
// Toda função do serverless (também `schedule`) aponta para um arquivo e um export que existem.
// O handlers.ts não exporta nenhuma `const`. Nenhum código lê o header Authorization fora de `src/lib/auth.ts`.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { apiSources, type FunctionConfig, loadConfig, projects, ROOT, read } from '@checks/lib';
import { describe, expect, it } from 'vitest';

type Kind = 'route' | 'authRoute';

/** `export (async) function <nome>(` → o wrapper que o corpo da função chama, ou `undefined`. */
function exportedHandlers(text: string): Map<string, Kind | undefined> {
  const found = new Map<string, Kind | undefined>();
  const starts = [...text.matchAll(/^export (?:async )?function (\w+)\s*\(/gm)];
  for (const [i, m] of starts.entries()) {
    // O corpo vai até o primeiro `}` na coluna 0 (o fim da função, como o biome formata), sem pegar helpers abaixo.
    const next = starts[i + 1]?.index ?? text.length;
    const close = text.indexOf('\n}', m.index);
    const body = text.slice(m.index, close === -1 ? next : Math.min(close, next));
    const kind = /\bauthRoute\(/.test(body)
      ? 'authRoute'
      : /(?<![\w.])route\(/.test(body)
        ? 'route'
        : undefined;
    found.set(m[1] as string, kind);
  }
  return found;
}

/** `export const` no handlers.ts (o modelo antigo, `export const { a } = handlers({...})`, ou um export solto). */
function exportedConsts(path: string, text: string): string[] {
  return [...text.matchAll(/^export const .*$/gm)].map(
    (m) =>
      `${path}:${text.slice(0, m.index).split('\n').length}: \`export const\` (use \`export async function\`)`,
  );
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

function routeViolations(
  list: Route[],
  exportsOf: (file: string) => Map<string, Kind | undefined>,
): string[] {
  return list.flatMap((r) => {
    const exports = exportsOf(r.handlerFile);
    if (!exports.has(r.exportName))
      return [`${r.fn}: ${r.handlerFile} não tem \`export async function ${r.exportName}\``];
    const kind = exports.get(r.exportName);
    if (!kind) return [`${r.fn}: \`${r.exportName}\` não responde por route()/authRoute()`];
    if (r.hasAuthorizer && kind !== 'authRoute') return [`${r.fn}: rota com authorizer deve usar authRoute`];
    if (!r.hasAuthorizer && kind === 'authRoute') return [`${r.fn}: authRoute em rota sem authorizer`];
    return [];
  });
}

/** Toda função (HTTP, `schedule`, authorizer) aponta para um arquivo que existe e exporta o nome. */
function handlerTargetViolations(
  functions: Record<string, FunctionConfig>,
  exportsOf: (file: string) => Set<string> | undefined,
): string[] {
  return Object.entries(functions).flatMap(([fn, cfg]) => {
    const dot = cfg.handler.lastIndexOf('.');
    const file = `${cfg.handler.slice(0, dot)}.ts`;
    const name = cfg.handler.slice(dot + 1);
    const exports = exportsOf(file);
    if (!exports) return [`${fn}: ${file} não existe`];
    if (!exports.has(name)) return [`${fn}: ${file} não exporta a função ${name}`];
    return [];
  });
}

/** Nomes exportados como função: `export (async) function x` e `export { a as x, y } from '...'`. */
function exportedNames(text: string): Set<string> {
  const reexports = [...text.matchAll(/^export \{([^}]+)\}/gm)].flatMap((m) =>
    (m[1] as string).split(',').map(
      (part) =>
        part
          .trim()
          .split(/\s+as\s+/)
          .pop() as string,
    ),
  );
  return new Set([...exportedHandlers(text).keys(), ...reexports.filter(Boolean)]);
}

function authHeaderViolations(files: { path: string; text: string }[]): string[] {
  return files
    .filter(
      (f) => !f.path.endsWith('/src/lib/auth.ts') && /headers\??\.\s*\[?['"]?authorization/i.test(f.text),
    )
    .map((f) => `${f.path}: lê o header Authorization (use authRoute / auth.userId)`);
}

describe.each(projects())('api: %s', (project) => {
  it('rotas ↔ export function com route/authRoute', async () => {
    const config = await loadConfig(project);
    const exportsOf = (file: string) => {
      const path = join('apps', project, 'api', file);
      return existsSync(join(ROOT, path))
        ? exportedHandlers(read(path))
        : new Map<string, Kind | undefined>();
    };
    const list = routes(config.functions ?? {});
    expect(list.length).toBeGreaterThan(0);
    expect(routeViolations(list, exportsOf)).toEqual([]);
  });

  it('todo handler aponta para um arquivo e um export que existem', async () => {
    const config = await loadConfig(project);
    const exportsOf = (file: string) => {
      const path = join('apps', project, 'api', file);
      return existsSync(join(ROOT, path)) ? exportedNames(read(path)) : undefined;
    };
    expect(handlerTargetViolations(config.functions ?? {}, exportsOf)).toEqual([]);
  });

  it('handlers.ts sem `export const`', () => {
    const files = apiSources(project).filter((path) => path.endsWith('/handlers.ts'));
    expect(files.flatMap((path) => exportedConsts(path, read(path)))).toEqual([]);
  });

  it('Authorization só em src/lib/auth.ts', () => {
    const files = apiSources(project).map((path) => ({ path, text: read(path) }));
    expect(authHeaderViolations(files)).toEqual([]);
  });
});

describe('api: os checks pegam a violação plantada', () => {
  const file = [
    'export async function me(event: HttpEvent) {',
    '  return authRoute(event, async (auth) => auth.userId);',
    '}',
    'export async function health(event: HttpEvent) {',
    '  return route(event, async () => ({ ok: true }));',
    '}',
    'export async function raw(event: HttpEvent) {',
    '  return { statusCode: 200 };',
    '}',
    'function helper(event: HttpEvent) {',
    '  return route(event, async () => 1);',
    '}',
  ].join('\n');
  const exportsOf = () => exportedHandlers(file);
  const route = (exportName: string, hasAuthorizer: boolean): Route => ({
    fn: exportName,
    handlerFile: 'h.ts',
    exportName,
    hasAuthorizer,
  });

  it('rota com authorizer usando route', () => {
    expect(routeViolations([route('health', true)], exportsOf)).toHaveLength(1);
  });
  it('authRoute sem authorizer', () => {
    expect(routeViolations([route('me', false)], exportsOf)).toHaveLength(1);
  });
  it('função sem route/authRoute', () => {
    expect(routeViolations([route('raw', false)], exportsOf)).toHaveLength(1);
  });
  it('rota sem export function', () => {
    expect(routeViolations([route('loose', false)], exportsOf)).toHaveLength(1);
  });
  it('rotas certas passam', () => {
    expect(routeViolations([route('me', true), route('health', false)], exportsOf)).toEqual([]);
  });
  it('handler para arquivo ou export que não existe (inclusive rotina sem http)', () => {
    const fns = {
      ok: { handler: 'h.raw', events: [{ schedule: 'rate(1 day)' }] as never },
      semExport: { handler: 'h.loose' },
      semArquivo: { handler: 'src/modules/matches/handlers.me' },
      reexport: { handler: 'a.handler' },
    };
    const texts: Record<string, string> = {
      'h.ts': file,
      'a.ts': "export { authorizer as handler, other } from '@x/lib/auth';",
    };
    const of = (f: string) => (texts[f] === undefined ? undefined : exportedNames(texts[f]));
    expect(handlerTargetViolations(fns, of)).toEqual([
      'semExport: h.ts não exporta a função loose',
      'semArquivo: src/modules/matches/handlers.ts não existe',
    ]);
  });
  it('`export const` no handlers.ts', () => {
    expect(exportedConsts('h.ts', 'export const { me } = authHandlers({});')).toHaveLength(1);
    expect(exportedConsts('h.ts', 'export const x = handler(async () => 1);')).toHaveLength(1);
    expect(exportedConsts('h.ts', file)).toEqual([]);
  });
  it('header Authorization fora de lib/auth.ts', () => {
    const text = 'const h = event.headers?.authorization;';
    expect(authHeaderViolations([{ path: 'apps/x/api/src/modules/a/handlers.ts', text }])).toHaveLength(1);
    expect(authHeaderViolations([{ path: 'apps/x/api/src/lib/auth.ts', text }])).toEqual([]);
  });
});
