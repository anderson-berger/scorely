// Regras visuais da web (`.claude/rules/web-visual.md`).
//
// Ícones: o web carrega só a fonte Material Icons (`src/main.ts`). Todo nome de ícone escrito no
// código precisa existir nela; um nome só do Material Symbols (como `shield_person`) vira texto cru.
// A lista vem do `icons.json` do `@quasar/extras` (`matCrop169` = `crop_16_9`), comparada sem `_`.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { filesUnder, ROOT, read } from '@checks/lib';
import { describe, expect, it } from 'vitest';

const WEB = 'apps/scorely/web';

const key = (name: string): string => name.replaceAll('_', '').toLowerCase();

function materialIcons(): Set<string> {
  const require = createRequire(join(ROOT, WEB, 'package.json'));
  const names: string[] = require('@quasar/extras/material-icons/icons.json');
  return new Set(names.map((n) => key(n.replace(/^mat/, ''))));
}

const QUOTED = /['"]([\w-]+)['"]/g;

/** Nome de ligadura: só minúscula, número e `_` (`Add` vira texto cru). */
const LIGATURE = /^[a-z0-9_]+$/;

/** Nomes de ícone escritos no arquivo, com a linha. */
function iconNames(path: string, text: string): { name: string; line: number }[] {
  const at = (index: number): number => text.slice(0, index).split('\n').length;
  const found: { name: string; line: number }[] = [];
  const push = (name: string, index: number): void => {
    found.push({ name, line: at(index) });
  };
  // `icon="x"`, `left-icon="x"`, `icon-right="x"`, `<q-icon name="x">`
  for (const m of text.matchAll(/(?<![:@\w-])(?:[\w-]+-)?icon(?:-[\w-]+)?="([^"]*)"/g))
    push(m[1] as string, m.index);
  for (const m of text.matchAll(/<q-icon\b[^>]*?(?<![:\w-])name="([^"]*)"/g)) push(m[1] as string, m.index);
  // `:icon="a ? 'x' : 'y'"`, `<q-icon :name="...">`: os nomes entre aspas da expressão
  for (const m of text.matchAll(/:(?:[\w-]+-)?icon(?:-[\w-]+)?="([^"]*)"|<q-icon\b[^>]*?:name="([^"]*)"/g)) {
    // sem os literais de comparação (`s === 'format' ? 'groups' : ...`)
    const expr = (m[1] ?? m[2] ?? '').replace(/(['"])[^'"]*\1\s*[!=]==|[!=]==\s*(['"])[^'"]*\2/g, '');
    for (const q of expr.matchAll(QUOTED)) push(q[1] as string, m.index);
  }
  // script: `icon: 'x'`; e todo valor de um mapa `*.icons.ts`
  for (const m of text.matchAll(/\bicon:\s*['"]([\w-]+)['"]/g)) push(m[1] as string, m.index);
  if (path.endsWith('.icons.ts')) {
    for (const m of text.matchAll(/:\s*['"]([\w-]+)['"]/g)) push(m[1] as string, m.index);
  }
  return found.filter((f) => f.name !== '');
}

function iconViolations(files: { path: string; text: string }[], known: Set<string>): string[] {
  return files.flatMap((f) =>
    iconNames(f.path, f.text)
      .filter((i) => !LIGATURE.test(i.name) || !known.has(key(i.name)))
      .map((i) => `${f.path}:${i.line}: ícone \`${i.name}\` não existe no Material Icons`),
  );
}

describe('web-visual: ícones', () => {
  const known = materialIcons();

  it('a lista do Material Icons carrega', () => {
    expect(known.size).toBeGreaterThan(1000);
    for (const name of ['add', 'arrow_upward', 'crop_16_9', '10k', 'admin_panel_settings']) {
      expect(known.has(key(name))).toBe(true);
    }
  });

  it('todo ícone do web existe no Material Icons', () => {
    const files = filesUnder(
      `${WEB}/src`,
      (p) => (p.endsWith('.vue') || p.endsWith('.ts')) && !p.endsWith('.test.ts'),
    ).map((path) => ({ path, text: read(path) }));
    expect(iconViolations(files, known)).toEqual([]);
  });

  it('o check pega os ícones plantados', () => {
    const page = `${WEB}/src/modules/x/XPage.vue`;
    const text = [
      '<SettingsRow icon="shield_person" />',
      '<q-btn left-icon="sym_o_home" />',
      '<q-icon size="sm" name="not_an_icon" />',
      `<q-btn :icon="open ? 'add' : 'nope_icon'" />`,
      `const items = [{ icon: 'bad_icon', to: '/' }];`,
      '<q-btn icon-right="no_such_icon" /><q-chip :icon-remove="\'Add\'" />',
    ].join('\n');
    const found = iconViolations([{ path: page, text }], known);
    expect(found.map((f) => f.split('`')[1])).toEqual(
      expect.arrayContaining([
        'shield_person',
        'sym_o_home',
        'not_an_icon',
        'nope_icon',
        'bad_icon',
        'no_such_icon',
        'Add',
      ]),
    );
    expect(found).toHaveLength(7);
    expect(found[0]).toContain(`${page}:1:`);
  });

  it('mapa *.icons.ts: todo valor é ícone', () => {
    const text = "export const m = { a: 'mail', b: 'shield_person' };";
    expect(iconViolations([{ path: `${WEB}/src/x/x.icons.ts`, text }], known)).toHaveLength(1);
  });

  it('nome válido, prop ligada a variável e `name` fora do q-icon não contam', () => {
    const text = [
      '<q-btn icon="add" /><q-icon name="chevron_right" />',
      '<q-icon :name="item.icon" /><SettingsRow :icon="row.icon" />',
      `<q-btn :icon="s === 'format' ? 'groups' : 'schedule'" />`,
      '<q-input name="email" /><q-tab name="past" />',
    ].join('\n');
    expect(iconViolations([{ path: `${WEB}/src/x/X.vue`, text }], known)).toEqual([]);
  });
});
