// Regra de imports (.claude/rules/code.md): nenhum import relativo (`./` ou `../`). Todo caminho começa pelo
// alias do pacote (`@scorely/api/src/...`, `@scorely/web/src/...`, `@infra/shared/...`, `@checks/...`),
// declarado uma vez nos `paths` do tsconfig.base.json.

import { filesUnder, read } from '@checks/lib';
import { describe, expect, it } from 'vitest';

const DIRS = ['apps', 'infra', 'checks'];
const ROOT_FILES = ['serverless-compose.ts', 'vitest.config.mts'];
const SOURCE = /\.(ts|mts|tsx|js|mjs|vue|scss|sass)$/;
// Este arquivo tem exemplos de violação nas strings do teste plantado.
const SELF = 'checks/imports.test.ts';

/**
 * Caminho relativo (`./` ou `../`) depois de: `from`, `import`, `import(`, `require(`, `vi.mock(`/`doMock(`/
 * `importActual(`/`importMock(`, `import.meta.glob(`, `@use`/`@import`/`@forward` do Sass e `src=` de bloco do .vue.
 */
const RELATIVE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\b(?:mock|doMock|importActual|importMock|glob|require)\s*\(\s*|@(?:use|import|forward)\s+|<(?:script|style|template)\b[^>]*\bsrc=)(['"`])\.\.?\/[^'"`]*\1/g;

function relativeImports(path: string, text: string): string[] {
  return [...text.matchAll(RELATIVE)].map(
    (m) => `${path}:${text.slice(0, m.index).split('\n').length}: ${m[0]} (use o alias do pacote)`,
  );
}

describe('imports', () => {
  it('nenhum import relativo', () => {
    const files = [
      ...DIRS.flatMap((dir) => filesUnder(dir, (p) => SOURCE.test(p) && p !== SELF)),
      ...ROOT_FILES,
    ];
    const found = files.flatMap((path) => {
      try {
        return relativeImports(path, read(path));
      } catch {
        return []; // arquivo da raiz que não existe
      }
    });
    expect(found).toEqual([]);
  });
});

describe('imports: o check pega a violação plantada', () => {
  it.each([
    "import { a } from './a';",
    "import { a } from '../../lib/a';",
    "export * from './auth';",
    "export { b } from '../b';",
    "import './side-effect';",
    "const Page = () => import('./pages/Page.vue');",
    "vi.mock('../repo');",
    'import type { T } from "./types";',
    'const Page = () => import(`./pages/Page.vue`);',
    "await vi.importActual('./repo');",
    "vi.doMock('../repo');",
    "import.meta.glob('./locales/*.ts');",
    "import { a } from'./a';",
    "@use '../css/vars';",
    '<style lang="scss" src="./page.scss"></style>',
  ])('%s', (line) => {
    expect(relativeImports('x.ts', line)).toHaveLength(1);
  });

  it('alias e pacote passam', () => {
    const text = [
      "import { a } from '@scorely/api/src/lib/a';",
      "import { z } from 'zod';",
      "import { join } from 'node:path';",
      "const url = new URL('./src', import.meta.url);",
    ].join('\n');
    expect(relativeImports('x.ts', text)).toEqual([]);
  });
});
