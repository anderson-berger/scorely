// Regras de handlers (.claude/rules/api.md): toda rota HTTP aponta para uma `export async function` do
// handlers.ts que responde por `route(event, ...)` ou `authRoute(event, ...)`; rota com authorizer ⇔ `authRoute`.
// Toda função do serverless (também `schedule`) aponta para um arquivo e um export que existem.
// O handlers.ts não exporta nenhuma `const`. Nenhum código lê o header Authorization fora de `src/lib/auth.ts`.
// Handlers em passos (ler → chamar → responder): `await` só como comando ou valor de `const`, sem chamada
// aninhada no que é aguardado nem no `created`, `return` só do valor pronto, e tipo escrito no input e no resultado.
// Forma do módulo (ADR 0021): raiz, `rules/`, `data/` e `tests/` com nome fixo; só submódulos têm nome livre.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { apiSources, type FunctionConfig, filesUnder, loadConfig, projects, ROOT, read } from '@checks/lib';
import ts from 'typescript';
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

/** Todos os nós abaixo de `node`, na ordem do texto. */
function descendants(node: ts.Node): ts.Node[] {
  const found: ts.Node[] = [];
  ts.forEachChild(node, (child) => {
    found.push(child, ...descendants(child));
  });
  return found;
}

/** Tira o que não muda o valor: parênteses, `as`, `satisfies` e `!`. */
function unwrap(node: ts.Expression): ts.Expression {
  const wraps =
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node);
  return wraps ? unwrap(node.expression) : node;
}

function hasCall(node: ts.Node): boolean {
  return [node, ...descendants(node)].some(
    (n) => ts.isCallExpression(n) || ts.isNewExpression(n) || ts.isTaggedTemplateExpression(n),
  );
}

/** Nome, propriedade, ou objeto/literal sem chamada nem `await`. */
function isReadyValue(node: ts.Expression): boolean {
  const value = unwrap(node);
  if (ts.isIdentifier(value)) return true;
  if (ts.isPropertyAccessExpression(value)) return isReadyValue(value.expression);
  if (ts.isElementAccessExpression(value))
    return isReadyValue(value.expression) && !hasCall(value.argumentExpression);
  if (ts.isPrefixUnaryExpression(value)) return ts.isNumericLiteral(value.operand);
  const literal =
    ts.isLiteralExpression(value) ||
    ts.isTemplateExpression(value) ||
    ts.isObjectLiteralExpression(value) ||
    ts.isArrayLiteralExpression(value) ||
    [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(value.kind);
  return literal && !hasCall(value) && !descendants(value).some(ts.isAwaitExpression);
}

function calleeName(node: ts.CallExpression): string | undefined {
  return ts.isIdentifier(node.expression) ? node.expression.text : undefined;
}

/** O que o callback do `route`/`authRoute` devolve: o corpo-expressão ou cada `return` dele (sem os de funções internas). */
function returnedValues(callback: ts.ArrowFunction | ts.FunctionExpression): ts.Expression[] {
  if (!ts.isBlock(callback.body)) return [callback.body];
  const visit = (node: ts.Node): ts.Expression[] => {
    if (ts.isFunctionLike(node)) return [];
    if (ts.isReturnStatement(node)) return node.expression ? [node.expression] : [];
    const found: ts.Expression[] = [];
    ts.forEachChild(node, (child) => {
      found.push(...visit(child));
    });
    return found;
  };
  return visit(callback.body);
}

/** `await`, `parseBody(...)` e `<Schema>.parse(...)`: a `const` que recebe um deles tem o tipo escrito. */
function needsType(initializer: ts.Expression): boolean {
  const value = unwrap(initializer);
  if (ts.isAwaitExpression(value)) return true;
  if (!ts.isCallExpression(value)) return false;
  if (calleeName(value) === 'parseBody') return true;
  const callee = value.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === 'parse' &&
    /Schema$/.test(callee.expression.getText())
  );
}

type StepRule = 'await-solto' | 'chamada-aninhada' | 'return' | 'sem-tipo';

const STEP_MESSAGES: Record<StepRule, string> = {
  'await-solto': '`await` só como comando ou como valor de uma `const`',
  'chamada-aninhada': 'chamada dentro do argumento (guarde numa `const` antes)',
  return: '`return` só de nome, propriedade, literal sem chamada ou `created(nome)`',
  'sem-tipo': '`const` de `await`, `parseBody` ou `<Schema>.parse` sem o tipo escrito',
};

function stepNodeViolations(node: ts.Node): [StepRule, ts.Node][] {
  if (ts.isAwaitExpression(node)) {
    const { parent } = node;
    const statement = ts.isExpressionStatement(parent);
    const constValue =
      ts.isVariableDeclaration(parent) &&
      parent.initializer === node &&
      (ts.getCombinedNodeFlags(parent) & ts.NodeFlags.Const) !== 0;
    const loose: [StepRule, ts.Node][] = statement || constValue ? [] : [['await-solto', node]];
    const call = unwrap(node.expression);
    const nested = ts.isCallExpression(call) && call.arguments.some(hasCall);
    return nested ? [...loose, ['chamada-aninhada', node]] : loose;
  }
  if (ts.isVariableDeclaration(node))
    return node.initializer && !node.type && needsType(node.initializer) ? [['sem-tipo', node]] : [];
  if (!ts.isCallExpression(node)) return [];
  const name = calleeName(node);
  if (name === 'created') return node.arguments.some(hasCall) ? [['chamada-aninhada', node]] : [];
  if (name !== 'route' && name !== 'authRoute') return [];
  return node.arguments
    .filter((arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))
    .flatMap(returnedValues)
    .filter((returned) => {
      const value = unwrap(returned);
      const isCreated =
        ts.isCallExpression(value) && calleeName(value) === 'created' && value.arguments.every(isReadyValue);
      return !isCreated && !isReadyValue(value);
    })
    .map((returned): [StepRule, ts.Node] => ['return', returned]);
}

/** Dentro das `export async function` do handlers.ts: ler → chamar → responder, um passo por vez. */
function stepViolations(path: string, text: string): string[] {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  return source.statements
    .filter(ts.isFunctionDeclaration)
    .filter((fn) => {
      const kinds = ts.getModifiers(fn)?.map((m) => m.kind) ?? [];
      return kinds.includes(ts.SyntaxKind.ExportKeyword) && kinds.includes(ts.SyntaxKind.AsyncKeyword);
    })
    .flatMap((fn) =>
      descendants(fn)
        .flatMap(stepNodeViolations)
        .map(([rule, node]) => {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          return `${path}:${line} (${fn.name?.text}) [${rule}]: ${STEP_MESSAGES[rule]}`;
        }),
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

  it('handlers.ts em passos (ler → chamar → responder)', () => {
    const files = apiSources(project).filter((path) => path.endsWith('/handlers.ts'));
    expect(files.length).toBeGreaterThan(0);
    expect(files.flatMap((path) => stepViolations(path, read(path)))).toEqual([]);
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

describe('api: o check dos handlers em passos', () => {
  const inHandler = (...lines: string[]) =>
    [
      'export async function x(event: HttpEvent) {',
      '  return authRoute(event, async (auth) => {',
      ...lines,
      '  });',
      '}',
    ].join('\n');
  const rulesOf = (text: string) =>
    stepViolations('h.ts', text).map((violation) => /\[([\w-]+)\]/.exec(violation)?.[1]);

  it.each([
    [
      'ler, chamar com tipo e responder 201',
      inHandler(
        "const publicId = asPublicGroupId(pathParam(event, 'publicId'));",
        'const input: CreateGroupInviteInput = parseBody(event, CreateGroupInviteInputSchema);',
        'const invite: GroupInvite = await groups.createInvite(auth.userId, publicId, input);',
        'return created(invite);',
      ),
    ],
    [
      '`await` como comando e `return` vazio',
      inHandler('await groups.remove(auth.userId, input.version);', 'return;'),
    ],
    ['`return` de nome', inHandler('const user: Me = await users.get(auth.userId);', 'return user;')],
    [
      '`return` de objeto sem chamada',
      inHandler("return { items, total: page.total, ok: true, kind: 'a' };"),
    ],
    ['`return` dentro de `if`', inHandler('if (!page.next) {', '  return page.items;', '}', 'return [];')],
    [
      'corpo-expressão com propriedade ou objeto literal',
      [
        'export async function me(event: HttpEvent) {',
        '  return authRoute(event, async (auth) => auth.userId);',
        '}',
        'export async function health(event: HttpEvent) {',
        '  return route(event, async () => ({ ok: true }));',
        '}',
      ].join('\n'),
    ],
    [
      'chamada no callee não é argumento',
      inHandler('const session: Session = await auth().login(input);', 'return session;'),
    ],
    [
      'desestruturação com tipo',
      inHandler('const { user }: LoginResult = await service.login(input);', 'return user;'),
    ],
    [
      '`<Schema>.parse` com tipo e valores simples sem tipo',
      inHandler(
        'const query: ListQuery = ListQuerySchema.parse(event.queryStringParameters ?? {});',
        "const id = pathParam(event, 'id');",
        'const raw = JSON.parse(text);',
      ),
    ],
    [
      '`return` de função interna não é o do callback',
      inHandler('const ids = list.map((item) => {', '  return toId(item);', '});', 'return ids;'),
    ],
    [
      'helper sem `export` fica de fora',
      [
        'async function groupOf(publicId: string) {',
        '  return await groups.get(asPublicGroupId(publicId));',
        '}',
      ].join('\n'),
    ],
  ])('passa: %s', (_what, text) => {
    expect(stepViolations('h.ts', text)).toEqual([]);
  });

  it.each([
    ['`return await`', inHandler('return await users.get(auth.userId);'), ['return', 'await-solto']],
    [
      '`created(await ...)`',
      inHandler('return created(await groups.create(auth.userId, input));'),
      ['return', 'chamada-aninhada', 'await-solto'],
    ],
    [
      '`await` dentro de objeto',
      inHandler('return { items: await groups.list(auth.userId) };'),
      ['return', 'await-solto'],
    ],
    [
      '`await` no argumento de outra chamada',
      inHandler('toView(await groups.get(publicId));'),
      ['await-solto'],
    ],
    [
      '`await` encadeado numa propriedade',
      inHandler('const id = (await groups.get(publicId)).id;'),
      ['await-solto'],
    ],
    [
      '`await` em variável que não é `const`',
      inHandler('var group: Group = await groups.get(id);'),
      ['await-solto'],
    ],
    [
      'chamada no argumento do que é aguardado',
      inHandler('await groups.remove(auth.userId, asPublicGroupId(publicId));'),
      ['chamada-aninhada'],
    ],
    [
      'chamada dentro de um objeto no argumento',
      inHandler('await groups.update(auth.userId, { id: toId(publicId) });'),
      ['chamada-aninhada'],
    ],
    [
      '`parseBody` direto no argumento',
      inHandler('const group: Group = await groups.create(auth.userId, parseBody(event, Schema));'),
      ['chamada-aninhada'],
    ],
    [
      'chamada no argumento do `created`',
      inHandler('return created(toView(group));'),
      ['return', 'chamada-aninhada'],
    ],
    ['`return` de chamada', inHandler('return users.get(auth.userId);'), ['return']],
    ['`return` de objeto com chamada', inHandler('return { items: toViews(items) };'), ['return']],
    ['`return` de propriedade de chamada', inHandler('return toView(group).id;'), ['return']],
    [
      '`return` de chamada dentro de `if`',
      inHandler('if (input.all) {', '  return groups.list();', '}', 'return;'),
      ['return'],
    ],
    [
      'corpo-expressão com chamada',
      [
        'export async function me(event: HttpEvent) {',
        '  return authRoute(event, async (auth) => users.get(auth.userId));',
        '}',
      ].join('\n'),
      ['return'],
    ],
    ['`await` sem tipo', inHandler('const user = await users.get(auth.userId);'), ['sem-tipo']],
    ['`parseBody` sem tipo', inHandler('const input = parseBody(event, UpdateMeInputSchema);'), ['sem-tipo']],
    [
      '`<Schema>.parse` sem tipo',
      inHandler('const query = ListQuerySchema.parse(event.queryStringParameters);'),
      ['sem-tipo'],
    ],
    ['desestruturação sem tipo', inHandler('const { user } = await service.login(input);'), ['sem-tipo']],
  ])('pega: %s', (_what, text, rules) => {
    expect(rulesOf(text)).toEqual(rules);
  });

  it('a violação diz o arquivo, a linha e a função', () => {
    expect(stepViolations('h.ts', inHandler('return users.get(auth.userId);'))).toEqual([
      expect.stringMatching(/^h\.ts:3 \(x\) \[return\]: /),
    ]);
  });
});

const FIXED_DIRS = ['rules', 'data', 'tests'];
const DATA_KIND = /\.(table|repository|memory)\.ts$/;
/** Quem lê os nomes de entidade de `auth/data` e `users/data` (ADR 0021). */
const DATA_IMPORT_EXCEPTIONS = ['lib/db.ts'];

/**
 * Forma do módulo (ADR 0021). `path` relativo a `src/` (`modules/groups/matches/rules/x.ts`, `lib/tests/x.test.ts`).
 * Devolve o motivo da violação, ou `undefined`.
 */
function shapeViolation(path: string, all: Set<string>): string | undefined {
  const segs = path.split('/');
  const name = segs.at(-1) as string;
  if (segs[0] === 'lib') {
    const ok = !name.endsWith('.test.ts') || (segs.length === 3 && segs[1] === 'tests');
    return ok ? undefined : 'teste de lib só em lib/tests/';
  }
  if (segs[0] !== 'modules' || segs.length < 3) return undefined;
  const base = ['modules', segs[1] as string];
  while (segs.length > base.length + 1) {
    const next = segs[base.length] as string;
    if (FIXED_DIRS.includes(next)) break;
    if (!all.has([...base, next, 'functions.ts'].join('/')))
      return `pasta \`${next}/\` de nome livre que não é submódulo (sem functions.ts)`;
    base.push(next);
  }
  const mod = base.at(-1) as string;
  const rest = segs.slice(base.length);
  const dir = rest.length > 1 ? (rest[0] as string) : undefined;
  if (name.endsWith('.test.ts') && dir !== 'tests') return 'teste só em tests/';
  if (DATA_KIND.test(name) && dir !== 'data') return 'table/repository/memory só em data/';
  if (dir === undefined) {
    const ok =
      ['functions.ts', 'handlers.ts', 'authorizer.ts', `${mod}.service.ts`, `${mod}.access.ts`].includes(
        name,
      ) || name.endsWith('.schema.ts');
    return ok ? undefined : 'arquivo não previsto na raiz do módulo';
  }
  if (!FIXED_DIRS.includes(dir)) return `pasta \`${dir}/\` não prevista`;
  if (rest.length > 2) return `subpasta dentro de ${dir}/ (assunto é arquivo)`;
  if (dir === 'data' && DATA_KIND.test(name) && !name.startsWith(`${mod}.`))
    return `arquivo de data/ sem o prefixo \`${mod}.\``;
  if (dir === 'tests' && name !== 'fixtures.ts' && !name.endsWith('.test.ts'))
    return 'tests/ só com fixtures.ts e *.test.ts';
  return undefined;
}

function shapeViolations(paths: string[]): string[] {
  const all = new Set(paths);
  return paths.flatMap((path) => {
    const reason = shapeViolation(path, all);
    return reason ? [`${path}: ${reason}`] : [];
  });
}

/** O `data/` de outro módulo de cima só no `handlers.ts` e nos `tests/` (o mesmo módulo de cima é livre). */
function dataImportViolations(files: { path: string; text: string }[]): string[] {
  return files.flatMap(({ path, text }) => {
    if (DATA_IMPORT_EXCEPTIONS.includes(path)) return [];
    const segs = path.split('/');
    const own = segs[0] === 'modules' ? segs[1] : undefined;
    if (segs.at(-1) === 'handlers.ts' || segs.includes('tests')) return [];
    return [...text.matchAll(/from '[^']*\/modules\/(\w+)\/(?:[\w-]+\/)*data\/[^']*'/g)]
      .filter((m) => m[1] !== own)
      .map((m) => `${path}: importa o data/ do módulo ${m[1]} (use ${m[1]}.service/${m[1]}.access)`);
  });
}

describe.each(projects())('api: forma do módulo (ADR 0021): %s', (project) => {
  const prefix = `apps/${project}/api/src/`;
  const sources = filesUnder(`apps/${project}/api/src`, (p) => p.endsWith('.ts')).map((p) =>
    p.slice(prefix.length),
  );
  it('pastas e arquivos nos lugares certos', () => {
    expect(shapeViolations(sources)).toEqual([]);
  });
  it('data/ de outro módulo só no handlers.ts e nos tests/', () => {
    const files = sources
      .filter((p) => !p.endsWith('.test.ts'))
      .map((path) => ({ path, text: read(prefix + path) }));
    expect(dataImportViolations(files)).toEqual([]);
  });
});

describe('api: a forma do módulo pega a violação plantada', () => {
  const ok = [
    'modules/groups/functions.ts',
    'modules/groups/handlers.ts',
    'modules/groups/groups.service.ts',
    'modules/groups/groups.access.ts',
    'modules/groups/rules/invites.ts',
    'modules/groups/data/groups.table.ts',
    'modules/groups/data/groups.repository.ts',
    'modules/groups/data/groups.memory.ts',
    'modules/groups/tests/fixtures.ts',
    'modules/groups/tests/invites.test.ts',
    'modules/groups/tests/repository.contract.test.ts',
    'modules/groups/matches/functions.ts',
    'modules/groups/matches/matches.service.ts',
    'modules/groups/matches/rules/series.ts',
    'modules/groups/matches/data/matches.table.ts',
    'modules/groups/matches/tests/series.test.ts',
    'modules/auth/authorizer.ts',
    'modules/items/item.schema.ts',
    'lib/db.ts',
    'lib/tests/http.test.ts',
  ];
  it('forma correta passa (inclusive submódulo)', () => {
    expect(shapeViolations(ok)).toEqual([]);
  });
  it.each([
    ['teste solto na raiz do módulo', 'modules/groups/group.members.test.ts'],
    ['teste em rules/', 'modules/groups/rules/invites.test.ts'],
    ['repository fora de data/', 'modules/groups/groups.repository.ts'],
    ['memory fora de data/', 'modules/groups/tests/groups.memory.ts'],
    ['table na raiz', 'modules/users/users.table.ts'],
    ['data/ sem o prefixo do módulo', 'modules/groups/data/group.table.ts'],
    ['data/ de submódulo com prefixo do pai', 'modules/groups/matches/data/groups.repository.ts'],
    ['arquivo solto na raiz', 'modules/groups/public-id.ts'],
    ['service com prefixo errado', 'modules/groups/group.service.ts'],
    ['pasta de nome livre que não é submódulo', 'modules/groups/invites/invites.service.ts'],
    ['subpasta dentro de rules/', 'modules/groups/rules/invites/invites.ts'],
    ['arquivo estranho em tests/', 'modules/groups/tests/helpers.ts'],
    ['teste de lib fora de lib/tests/', 'lib/http.test.ts'],
  ])('%s', (_what, path) => {
    expect(shapeViolations([...ok, path])).toHaveLength(1);
  });

  const importing = (path: string, from: string) => ({
    path,
    text: `import { x } from '@scorely/api/src/modules/${from}';`,
  });
  it('import do data/ de outro módulo de cima', () => {
    expect(
      dataImportViolations([importing('modules/groups/rules/members.ts', 'users/data/users.repository')]),
    ).toHaveLength(1);
    expect(
      dataImportViolations([importing('modules/groups/groups.service.ts', 'media/data/media.table')]),
    ).toHaveLength(1);
  });
  it('import permitido: handlers, tests, o próprio módulo (e submódulos) e a exceção do lib/db.ts', () => {
    expect(
      dataImportViolations([
        importing('modules/groups/handlers.ts', 'users/data/users.repository'),
        importing('modules/groups/tests/fixtures.ts', 'users/data/users.memory'),
        importing('modules/groups/matches/rules/teams.ts', 'groups/data/groups.repository'),
        importing('modules/groups/groups.service.ts', 'users/users.access'),
        importing('lib/db.ts', 'auth/data/auth.table'),
      ]),
    ).toEqual([]);
  });
});
