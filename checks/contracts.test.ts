// Regras de contrato (.claude/rules/contracts.md): no projeto sem pacote de contracts (hoje, o `base`),
// cada `<mod>.schema.ts` da api tem uma cópia idêntica no web, e vice-versa.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { filesUnder, ROOT, read } from '@checks/lib';
import { describe, expect, it } from 'vitest';

interface Copy {
  module: string;
  api?: string;
  web?: string;
}

function copyViolations(copies: Copy[]): string[] {
  return copies.flatMap((c) => {
    if (c.api === undefined) return [`${c.module}: existe só no web`];
    if (c.web === undefined) return [`${c.module}: existe só na api`];
    return c.api === c.web ? [] : [`${c.module}: a cópia da api e a do web diferem`];
  });
}

/** Projetos com `apps/<p>/contracts` usam o pacote e não têm cópias. */
function duplicatedProjects(): string[] {
  return filesUnder('apps', (p) => p.endsWith('.schema.ts'))
    .map((p) => p.split('/')[1] as string)
    .filter((p, i, all) => all.indexOf(p) === i && !existsSync(join(ROOT, 'apps', p, 'contracts')));
}

function copiesOf(project: string): Copy[] {
  const rel = (side: 'api' | 'web') =>
    filesUnder(`apps/${project}/${side}/src/modules`, (p) => p.endsWith('.schema.ts')).map((p) =>
      p.slice(`apps/${project}/${side}/src/`.length),
    );
  const modules = [...new Set([...rel('api'), ...rel('web')])];
  const content = (side: 'api' | 'web', m: string) => {
    const path = `apps/${project}/${side}/src/${m}`;
    return existsSync(join(ROOT, path)) ? read(path) : undefined;
  };
  return modules.map((m) => {
    const api = content('api', m);
    const web = content('web', m);
    return {
      module: `${project}/${m}`,
      ...(api !== undefined && { api }),
      ...(web !== undefined && { web }),
    };
  });
}

describe('contracts: cópias de schema iguais', () => {
  it.each(duplicatedProjects())('%s: api e web iguais', (project) => {
    const copies = copiesOf(project);
    expect(copies.length).toBeGreaterThan(0);
    expect(copyViolations(copies)).toEqual([]);
  });

  it('projeto com contracts não tem *.schema.ts', () => {
    const withPackage = filesUnder('apps', (p) => p.endsWith('.schema.ts')).filter((p) =>
      existsSync(join(ROOT, 'apps', p.split('/')[1] as string, 'contracts')),
    );
    expect(withPackage).toEqual([]);
  });
});

describe('contracts: o check pega a violação plantada', () => {
  it('cópias diferentes ou faltando', () => {
    expect(copyViolations([{ module: 'm', api: 'a', web: 'b' }])).toHaveLength(1);
    expect(copyViolations([{ module: 'm', api: 'a' }])).toHaveLength(1);
    expect(copyViolations([{ module: 'm', api: 'a', web: 'a' }])).toEqual([]);
  });
});
