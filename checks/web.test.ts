// Regra de datas na web (ADR 0006, `.claude/rules/web.md`): toda data mostrada passa por
// `src/lib/datetime.ts`. Nenhum `toLocale*String` nem `Intl.DateTimeFormat` fora dele.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder, ROOT, read } from './lib';

const HELPER = 'src/lib/datetime.ts';
const FORBIDDEN = /\.toLocale(Date|Time)?String\s*\(|Intl\.DateTimeFormat\b/;

/** Projetos com web que têm o helper de datas (hoje: scorely). */
function webProjects(): string[] {
  return ['scorely'].filter((p) => existsSync(join(ROOT, 'apps', p, 'web', 'src')));
}

function webSources(project: string): string[] {
  return filesUnder(
    `apps/${project}/web/src`,
    (p) => (p.endsWith('.ts') || p.endsWith('.vue')) && !p.endsWith('.test.ts'),
  );
}

function dateFormatViolations(files: { path: string; text: string }[]): string[] {
  return files
    .filter((f) => !f.path.endsWith(`/web/${HELPER}`) && FORBIDDEN.test(f.text))
    .map((f) => `${f.path}: formata data fora de ${HELPER} (use formatDateTime)`);
}

describe.each(webProjects())('web: %s', (project) => {
  it('caso 14: o helper de datas existe', () => {
    expect(existsSync(join(ROOT, 'apps', project, 'web', HELPER))).toBe(true);
  });

  it('caso 14: nenhum toLocale*String/Intl.DateTimeFormat fora de src/lib/datetime.ts', () => {
    const files = webSources(project).map((path) => ({ path, text: read(path) }));
    expect(dateFormatViolations(files)).toEqual([]);
  });
});

describe('web: o check pega a violação plantada', () => {
  const page = 'apps/scorely/web/src/modules/x/pages/XPage.vue';

  it('caso 14: toLocaleString num .vue → falha apontando o arquivo', () => {
    const text = '{{ new Date(item.createdAt).toLocaleString() }}';
    const found = dateFormatViolations([{ path: page, text }]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(page);
  });

  it('caso 14: toLocaleDateString / toLocaleTimeString / Intl.DateTimeFormat num .ts também falham', () => {
    const path = 'apps/scorely/web/src/lib/other.ts';
    for (const text of [
      'd.toLocaleDateString("pt-BR")',
      'd.toLocaleTimeString()',
      'new Intl.DateTimeFormat("en").format(d)',
    ]) {
      expect(dateFormatViolations([{ path, text }])).toHaveLength(1);
    }
  });

  it('caso 14: o próprio helper pode usar Intl.DateTimeFormat', () => {
    const text = 'new Intl.DateTimeFormat(locale, { timeZone }).format(d)';
    expect(dateFormatViolations([{ path: `apps/scorely/web/${HELPER}`, text }])).toEqual([]);
  });
});
