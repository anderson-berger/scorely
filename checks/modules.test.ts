// Documentação viva por módulo (.claude/rules/modulos.md, ADR 0010): todo módulo da api está no índice
// `docs/modules/README.md`; todo doc listado existe e não repete id de regra; todo id citado em teste existe.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder, ROOT, read } from './lib';

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
    const module = cells[1]?.match(/^`([a-z0-9-]+\/[a-z0-9-]+)`$/)?.[1];
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

/** Pastas de módulo de cada projeto com doc de módulo (hoje só o scorely; o `base` é template). */
function apiModules(): string[] {
  const projects = [...new Set(parseIndex(read(INDEX)).map((e) => e.module.split('/')[0] as string))];
  return projects.flatMap((p) => {
    const dir = join(ROOT, 'apps', p, 'api', 'src', 'modules');
    return existsSync(dir) ? readdirSync(dir).map((m) => `${p}/${m}`) : [];
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
    const ids = definedIds('- **A-01. Um.**\n- ~~**A-02. Dois.**~~ removida\n  - **A-01. Repetida.**');
    expect(ids).toEqual(['A-01', 'A-02', 'A-01']);
    expect(duplicateIds(ids)).toEqual(['A-01']);
    expect(
      unknownReferences([{ path: 't.test.ts', content: "it('A-01 e A-09', ...)" }], ['A'], new Set(['A-01'])),
    ).toEqual(['t.test.ts: A-09']);
  });
});
