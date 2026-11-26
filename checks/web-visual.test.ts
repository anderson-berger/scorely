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

// Regras de layout (`web-visual.md`): cortes, botões, painéis e toques. Cada função devolve as
// violações de um arquivo, como `caminho:linha: motivo`.

type Source = { path: string; text: string };

const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** Tags de abertura de um componente, sem quebrar em `>` dentro de atributo (`:disable="a > b"`). */
function tags(text: string, name: string): { tag: string; index: number }[] {
  const re = new RegExp(`<${name}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'g');
  return [...text.matchAll(re)].map((m) => ({ tag: m[0], index: m.index }));
}

const hasAttr = (tag: string, attr: string): boolean =>
  new RegExp(`\\s(?::|v-bind:)?${attr}(?=[\\s=/>])`).test(tag);

/** Os blocos `<style>` de um `.vue`, com a posição de cada um no arquivo. */
function styles(text: string): { css: string; index: number }[] {
  return [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => ({
    css: m[1] as string,
    index: m.index + m[0].indexOf('>') + 1,
  }));
}

/** Seletores proibidos no `<style>` de um `.vue`. */
function styleViolations(f: Source, selector: RegExp, why: string): string[] {
  return styles(f.text).flatMap((s) =>
    [...s.css.matchAll(new RegExp(selector.source, 'g'))].map(
      (m) => `${f.path}:${lineAt(f.text, s.index + m.index)}: ${why}`,
    ),
  );
}

const SCREEN_OK = new Set(['xs', 'sm', 'gt.xs', 'gt.sm', 'lt.sm', 'lt.md', 'width']);
const MEDIA_OK = /^@media\s*\(min-width:\s*(600|1024)px\)\s*$/;

/** Cortes: `@media` só em `min-width` 600/1024; `$q.screen` só nas faixas xs/sm/gt.sm. */
function breakpointViolations(f: Source): string[] {
  const media = [...f.text.matchAll(/@media[^{]*/g)]
    .filter((m) => !MEDIA_OK.test(m[0].trim()))
    .map((m) => `${f.path}:${lineAt(f.text, m.index)}: corte fora de 600/1024px (\`${m[0].trim()}\`)`);
  const screen = [...f.text.matchAll(/(?:\$q\.screen|\bScreen)\.((?:gt|lt)\.\w+|\w+)/g)]
    .filter((m) => !SCREEN_OK.has(m[1] as string))
    .map((m) => `${f.path}:${lineAt(f.text, m.index)}: \`$q.screen.${m[1]}\` cria outra faixa`);
  return [...media, ...screen];
}

/** Botões: sem estilo local nem `size`; `round` ou só ícone com `aria-label`. */
function buttonViolations(f: Source): string[] {
  const local = styleViolations(
    f,
    /\.q-btn(?!-group|-dropdown|-toggle)|\.sc-btn-/,
    'estilo de botão no .vue (a base fica em css/app.scss)',
  );
  const props = tags(f.text, 'q-btn').flatMap(({ tag, index }) => {
    const line = lineAt(f.text, index);
    // sem `label` e sem texto no slot (um `<q-tooltip>` não conta como nome)
    const slot = tag.endsWith('/>')
      ? ''
      : f.text.slice(index + tag.length, f.text.indexOf('</q-btn>', index));
    const named = slot.replace(/<q-tooltip\b[\s\S]*?<\/q-tooltip>|<!--[\s\S]*?-->/g, '').trim() !== '';
    const iconOnly = hasAttr(tag, 'icon') && !hasAttr(tag, 'label') && !named;
    return [
      ...(hasAttr(tag, 'size') ? [`${f.path}:${line}: \`size\` no q-btn (use o normal ou \`dense\`)`] : []),
      ...((hasAttr(tag, 'round') || iconOnly) && !hasAttr(tag, 'aria-label')
        ? [`${f.path}:${line}: botão só de ícone sem \`aria-label\``]
        : []),
    ];
  });
  return [...local, ...props];
}

const BOTTOM_SHEET = `${WEB}/src/components/BottomSheet.vue`;

const CONFIRM = `${WEB}/src/lib/confirm.ts`;

/**
 * Painéis: `<q-dialog>` e `QDialog` só dentro do `BottomSheet`. Confirmação: o plugin Dialog
 * (`$q.dialog`, `useQuasar().dialog`, `Dialog.create`) só dentro do `confirmAction`.
 */
function dialogViolations(f: Source): string[] {
  const panels =
    f.path === BOTTOM_SHEET
      ? []
      : [...f.text.matchAll(/<q-dialog\b|\bQDialog\b/g)].map(
          (m) => `${f.path}:${lineAt(f.text, m.index)}: painel fora do BottomSheet`,
        );
  const confirms =
    f.path === CONFIRM
      ? []
      : [...f.text.matchAll(/\.dialog\(|\bDialog\.create\(/g)].map(
          (m) =>
            `${f.path}:${lineAt(f.text, m.index)}: confirmação fora do confirmAction (src/lib/confirm.ts)`,
        );
  return [...panels, ...confirms];
}

/** Toques: abas sem `dense`; sem altura local de campo ou chave. */
function touchViolations(f: Source): string[] {
  const tabs = tags(f.text, 'q-tabs')
    .filter(({ tag }) => hasAttr(tag, 'dense'))
    .map(({ index }) => `${f.path}:${lineAt(f.text, index)}: \`q-tabs\` com \`dense\` (alvo menor que 44px)`);
  const local = styleViolations(
    f,
    /\.q-(?:field|toggle|input)(?![a-z])/,
    'estilo de campo ou chave no .vue (a altura fica em css/app.scss)',
  );
  return [...tabs, ...local];
}

const isVue = (f: Source): boolean => f.path.endsWith('.vue');

function layoutViolations(files: Source[]): string[] {
  return files.flatMap((f) => [
    ...breakpointViolations(f),
    ...(f.path.endsWith('.scss') ? [] : dialogViolations(f)),
    ...(isVue(f) ? [...buttonViolations(f), ...touchViolations(f)] : []),
  ]);
}

describe('web-visual: layout', () => {
  it('o web segue os cortes, botões, painéis e toques', () => {
    const files = filesUnder(
      `${WEB}/src`,
      (p) => /\.(vue|ts|scss|sass)$/.test(p) && !p.endsWith('.test.ts'),
    ).map((path) => ({ path, text: read(path) }));
    expect(layoutViolations(files)).toEqual([]);
  });

  const page = `${WEB}/src/modules/x/XPage.vue`;
  const one = (text: string): string[] => layoutViolations([{ path: page, text }]);

  it('cortes: outro @media ou outra faixa do $q.screen falham', () => {
    for (const text of [
      '<style>@media (max-width: 599px) { .a { color: red } }</style>',
      '<style>@media (min-width: 768px) { .a { color: red } }</style>',
      '<template><div v-if="$q.screen.md" /></template>',
      '<script>const x = this.$q.screen.gt.md;</script>',
      '<script>const x = this.$q.screen.lt.lg;</script>',
      '<script>const x = Screen.gt.md;</script>',
    ]) {
      expect(one(text), text).toHaveLength(1);
    }
    expect(
      layoutViolations([{ path: `${WEB}/src/css/app.scss`, text: '@media (max-width: 1023px) {}' }]),
    ).toHaveLength(1);
  });

  it('cortes: 600/1024 e as faixas permitidas passam', () => {
    const text = [
      '<style>@media (min-width: 600px) { .a {} } @media (min-width:1024px) { .b {} }</style>',
      '<template><div v-if="$q.screen.xs || $q.screen.gt.sm" :w="$q.screen.width" /></template>',
      '<script>const a = this.$q.screen.sm || this.$q.screen.lt.md || this.$q.screen.gt.xs;</script>',
    ].join('\n');
    expect(one(text)).toEqual([]);
  });

  it('botões: estilo local, size e só ícone sem aria-label falham', () => {
    for (const text of [
      '<style scoped>.actions .q-btn { height: 56px }</style>',
      '<style scoped>:deep(.q-btn__content) { font-size: 20px }</style>',
      '<style scoped>.sc-btn-main { border-radius: 0 }</style>',
      '<q-btn size="lg" label="Salvar" />',
      '<q-btn flat round icon="close" />',
      '<q-btn flat icon="more_vert" @click="a > b" />',
      '<style scoped>.q-btn--round { width: 40px }</style>',
      '<q-btn flat icon="info"><q-tooltip>Ajuda</q-tooltip></q-btn>',
    ]) {
      expect(one(text), text).toHaveLength(1);
    }
  });

  it('botões: q-btn-group, label, slot e aria-label passam', () => {
    const text = [
      '<style scoped>.fields :deep(.q-btn-group) { width: 100% }</style>',
      '<q-btn flat round icon="close" :aria-label="$t(\'common.close\')" />',
      '<q-btn flat icon="add" :label="$t(\'x\')" />',
      '<q-btn flat icon="add">{{ $t("x") }}</q-btn>',
      '<q-btn class="sc-btn-main" unelevated color="primary" label="Ok" />',
    ].join('\n');
    expect(one(text)).toEqual([]);
  });

  it('painéis: q-dialog ou QDialog fora do BottomSheet falham', () => {
    expect(one('<q-dialog v-model="open"><div /></q-dialog>')).toHaveLength(1);
    expect(one('<script>import { QDialog } from "quasar";</script>')).toHaveLength(1);
    expect(layoutViolations([{ path: BOTTOM_SHEET, text: '<q-dialog v-model="m" />' }])).toEqual([]);
  });

  it('confirmação: o plugin Dialog fora do confirm.ts falha', () => {
    for (const text of [
      '<script>this.$q\n  .dialog({ title: "x", cancel: true })</script>',
      '<script>useQuasar().dialog({ title: "x" })</script>',
      '<script>Dialog.create({ title: "x" })</script>',
    ]) {
      expect(one(text), text).toHaveLength(1);
    }
    expect(layoutViolations([{ path: CONFIRM, text: 'Dialog.create({ title: "x" })' }])).toEqual([]);
    expect(one('<script>await confirmAction({ title: "x", ok: "a", cancel: "b" })</script>')).toEqual([]);
  });

  it('toques: abas dense e estilo de campo ou chave falham', () => {
    for (const text of [
      '<q-tabs v-model="tab" dense align="left" />',
      '<style scoped>:deep(.q-field__control) { height: 36px }</style>',
      '<style scoped>.row .q-toggle { min-height: 32px }</style>',
    ]) {
      expect(one(text), text).toHaveLength(1);
    }
    expect(one('<q-tabs v-model="tab" align="left" /><q-input dense v-model="x" />')).toEqual([]);
  });

  it('a violação aponta a linha', () => {
    const found = one(['<template>', '  <q-tabs dense />', '</template>'].join('\n'));
    expect(found[0]).toContain(`${page}:2:`);
  });
});
