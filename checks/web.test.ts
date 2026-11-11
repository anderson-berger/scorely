// Regra de cores na web (plano 008, D3): nenhum hex nem rgb()/rgba() em `.vue`; cores só por
// token `var(--sc-*)` ou cor do Quasar. `src/css/*` (tokens e variáveis do Quasar) pode ter hex.
//
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

const COLOR = /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\brgba?\(/;

function colorViolations(files: { path: string; text: string }[]): string[] {
  return files
    .filter((f) => f.path.endsWith('.vue') && COLOR.test(f.text))
    .map((f) => `${f.path}: cor literal em .vue (use var(--sc-*) ou a cor do Quasar)`);
}

describe.each(webProjects())('web: %s (cores)', (project) => {
  it('caso 13: nenhum hex/rgb() nos .vue', () => {
    const files = filesUnder(`apps/${project}/web/src`, (p) => p.endsWith('.vue')).map((path) => ({
      path,
      text: read(path),
    }));
    expect(colorViolations(files)).toEqual([]);
  });

  it('caso 13: os tokens --sc-* existem em src/css/app.scss', () => {
    const css = `apps/${project}/web/src/css/app.scss`;
    expect(existsSync(join(ROOT, css))).toBe(true);
    for (const token of ['--sc-bg', '--sc-surface', '--sc-text', '--sc-accent', '--sc-danger']) {
      expect(read(css)).toContain(token);
    }
  });
});

describe('web: o check de cores pega a violação plantada', () => {
  const page = 'apps/scorely/web/src/modules/x/pages/XPage.vue';

  it('caso 13: #C6F432 no template → falha apontando o arquivo', () => {
    const found = colorViolations([{ path: page, text: '<div style="color: #C6F432">x</div>' }]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(page);
  });

  it('caso 13: hex ou rgb( no <style> → falha', () => {
    for (const text of [
      '<style scoped>.a { color: #c6f432; }</style>',
      '<style scoped>.a { border: 1px solid #fff; }</style>',
      '<style scoped>.a { background: rgb(13, 16, 21); }</style>',
      '<style scoped>.a { background: rgba(0, 0, 0, 0.5); }</style>',
    ]) {
      expect(colorViolations([{ path: page, text }])).toHaveLength(1);
    }
  });

  it('caso 13: src/css/* pode ter hex', () => {
    expect(
      colorViolations([
        { path: 'apps/scorely/web/src/css/app.scss', text: ':root { --sc-accent: #C6F432; }' },
      ]),
    ).toEqual([]);
    expect(
      colorViolations([
        { path: 'apps/scorely/web/src/css/quasar.variables.sass', text: '$primary: #C6F432' },
      ]),
    ).toEqual([]);
  });

  it('caso 13: token, cor do Quasar e slot do template não contam como cor', () => {
    for (const text of [
      '<style scoped>.a { color: var(--sc-accent); }</style>',
      '<template #default><q-btn color="primary" /></template>',
      '<template #append><q-icon name="close" /></template>',
    ]) {
      expect(colorViolations([{ path: page, text }])).toEqual([]);
    }
  });
});
