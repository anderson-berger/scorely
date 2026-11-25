// Documentação viva por módulo (.claude/rules/modulos.md, ADR 0010): todo módulo da api está no índice
// `docs/modules/README.md`; todo doc listado existe e não repete id de regra; todo id citado em teste existe.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { filesUnder, ROOT, read } from '@checks/lib';
import { describe, expect, it } from 'vitest';

const INDEX = 'docs/modules/README.md';

/** Linha do índice: `projeto/modulo`, o doc (ou `undefined` para "—") e o prefixo das regras. */
interface IndexEntry {
  module: string;
  doc?: string;
  prefix?: string;
}

/** Lê as linhas da tabela do índice que começam com `` `projeto/modulo` ``. */
function parseIndex(markdown: string): IndexEntry[] {
  return markdown.split('\n').flatMap((line) => {
    const cells = line.split('|').map((c) => c.trim());
    const module = cells[1]?.match(/^`([a-z0-9-]+(?:\/[a-z0-9-]+){1,2})`$/)?.[1];
    if (!module) return [];
    const doc = cells[2]?.match(/\(([^)]+\.md)\)/)?.[1];
    const prefix = cells[3]?.match(/^`([A-Z]+)`$/)?.[1];
    return [{ module, ...(doc && { doc }), ...(prefix && { prefix }) }];
  });
}

/** Ids definidos num doc: `**GRP-07.` no começo de um item (riscados também contam: o número não volta). */
function definedIds(markdown: string): string[] {
  return [...markdown.matchAll(/^\s*- (?:~~)?\*\*([A-Z]+-\d{2,})\./gm)].map((m) => m[1] as string);
}

function indexViolations(modules: string[], entries: IndexEntry[], docExists: (doc: string) => boolean) {
  const listed = new Set(entries.map((e) => e.module));
  return [
    ...modules.filter((m) => !listed.has(m)).map((m) => `${m}: módulo fora de ${INDEX}`),
    ...entries.filter((e) => e.doc && !docExists(e.doc)).map((e) => `${e.module}: ${e.doc} não existe`),
    ...entries.filter((e) => e.doc && !e.prefix).map((e) => `${e.module}: doc sem prefixo de regra`),
  ];
}

function duplicateIds(ids: string[]): string[] {
  return ids.filter((id, i) => ids.indexOf(id) !== i);
}

/** Ids com prefixo conhecido citados nos testes que nenhum doc define. */
function unknownReferences(
  tests: { path: string; content: string }[],
  prefixes: string[],
  defined: Set<string>,
): string[] {
  if (prefixes.length === 0) return [];
  const pattern = new RegExp(`\\b(?:${prefixes.join('|')})-\\d{2,}\\b`, 'g');
  return tests.flatMap(({ path, content }) =>
    [...new Set(content.match(pattern) ?? [])].filter((id) => !defined.has(id)).map((id) => `${path}: ${id}`),
  );
}

/**
 * Módulos sob `prefix`: cada pasta de `modules/` e, dentro dela, cada subpasta com `functions.ts`
 * (submódulo, ADR 0022), como `projeto/modulo/sub`.
 */
function modulesIn(
  prefix: string,
  dirsOf: (rel: string) => string[],
  hasFunctions: (rel: string) => boolean,
): string[] {
  return dirsOf('').flatMap((m) => [
    `${prefix}/${m}`,
    ...dirsOf(m)
      .filter((s) => hasFunctions(`${m}/${s}`))
      .map((s) => `${prefix}/${m}/${s}`),
  ]);
}

/** Pastas de módulo de cada projeto com doc de módulo (hoje só o scorely; o `base` é template). */
function apiModules(): string[] {
  const projects = [...new Set(parseIndex(read(INDEX)).map((e) => e.module.split('/')[0] as string))];
  return projects.flatMap((p) => {
    const dir = join(ROOT, 'apps', p, 'api', 'src', 'modules');
    if (!existsSync(dir)) return [];
    const dirsOf = (rel: string) =>
      readdirSync(join(dir, rel), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    return modulesIn(p, dirsOf, (rel) => existsSync(join(dir, rel, 'functions.ts')));
  });
}

const docPath = (doc: string) => `docs/modules/${doc}`;

describe('modules: doc vivo por módulo', () => {
  const entries = parseIndex(read(INDEX));
  const docs = entries.filter((e): e is IndexEntry & { doc: string } => Boolean(e.doc));

  it('todo módulo da api está no índice, e todo doc listado existe', () => {
    expect(entries.length).toBeGreaterThan(0);
    expect(indexViolations(apiModules(), entries, (d) => existsSync(join(ROOT, docPath(d))))).toEqual([]);
  });

  it.each(docs.map((e) => [e.doc, e.prefix]))('%s: ids únicos e com o prefixo %s', (doc, prefix) => {
    const ids = definedIds(read(docPath(doc as string)));
    expect(ids.length).toBeGreaterThan(0);
    expect(duplicateIds(ids)).toEqual([]);
    expect(ids.filter((id) => !id.startsWith(`${prefix}-`))).toEqual([]);
  });

  it('todo id de regra citado em teste existe num doc', () => {
    const defined = new Set(docs.flatMap((e) => definedIds(read(docPath(e.doc)))));
    const prefixes = docs.flatMap((e) => (e.prefix ? [e.prefix] : []));
    const tests = filesUnder('apps', (p) => p.endsWith('.test.ts')).map((path) => ({
      path,
      content: read(path),
    }));
    expect(unknownReferences(tests, prefixes, defined)).toEqual([]);
  });

  it('pega as violações plantadas', () => {
    const planted = parseIndex(
      '| `x/a` | [a.md](a.md) | `A` |\n| `x/b` | — | — |\n| `x/c` | [c.md](c.md) | — |',
    );
    expect(indexViolations(['x/a', 'x/b', 'x/c', 'x/d'], planted, (d) => d === 'a.md')).toEqual([
      'x/d: módulo fora de docs/modules/README.md',
      'x/c: c.md não existe',
      'x/c: doc sem prefixo de regra',
    ]);
    // Submódulo (pasta com functions.ts dentro de um módulo) entra; pasta sem functions.ts (components/) não
    const tree: Record<string, string[]> = { '': ['g'], g: ['sub', 'components'], 'g/sub': [] };
    const found = modulesIn(
      'x',
      (rel) => tree[rel] ?? [],
      (rel) => rel === 'g/sub',
    );
    expect(found).toEqual(['x/g', 'x/g/sub']);
    expect(indexViolations(found, parseIndex('| `x/g` | — | — |'), () => true)).toEqual([
      'x/g/sub: módulo fora de docs/modules/README.md',
    ]);
    expect(parseIndex('| `x/g/sub` | — | — |').map((e) => e.module)).toEqual(['x/g/sub']);
    const ids = definedIds('- **A-01. Um.**\n- ~~**A-02. Dois.**~~ removida\n  - **A-01. Repetida.**');
    expect(ids).toEqual(['A-01', 'A-02', 'A-01']);
    expect(duplicateIds(ids)).toEqual(['A-01']);
    expect(
      unknownReferences([{ path: 't.test.ts', content: "it('A-01 e A-09', ...)" }], ['A'], new Set(['A-01'])),
    ).toEqual(['t.test.ts: A-09']);
  });
});
