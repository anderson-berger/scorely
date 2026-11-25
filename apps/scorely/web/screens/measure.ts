import type { Limits } from '@scorely/web/screens/limits';

export type Rule =
  | 'rolagem horizontal'
  | 'fora da tela'
  | 'botão alto'
  | 'toque pequeno'
  | 'conteúdo estreito';

export interface Violation {
  rule: Rule;
  element: string;
  detail: string;
}

/**
 * Mede o layout da página aberta. Roda dentro do navegador (`page.evaluate`), então não pode usar nada de fora.
 * `overlay`: há um painel aberto, e só ele é medido (sem a largura do conteúdo).
 */
export function measure({ limits, overlay }: { limits: Limits; overlay: boolean }): Violation[] {
  const viewport = document.documentElement.clientWidth;
  const mobile = viewport < limits.mobileBelow;
  const slack = limits.tolerance;
  const root = (overlay && document.querySelector('.q-dialog')) || document.body;

  const label = (el: Element) => {
    const classes = [...el.classList]
      .filter((c) => !/^(q-|row$|col|items-|justify-|no-)/.test(c))
      .slice(0, 2);
    const text = (el.getAttribute('aria-label') || el.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);
    return `${el.tagName.toLowerCase()}${classes.map((c) => `.${c}`).join('')}${text ? ` "${text}"` : ''}`;
  };

  /** Visível e pelo menos em parte dentro da largura (o menu lateral fechado fica todo fora). */
  const visible = (el: Element) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || rect.right <= 0 || rect.left >= viewport) return false;
    return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  };

  /** Dentro de uma caixa que rola ou corta na horizontal: o excesso não sai da tela. */
  const clipped = (el: Element): boolean => {
    const parent = el.parentElement;
    if (!parent || parent === document.body) return false;
    return getComputedStyle(parent).overflowX !== 'visible' || clipped(parent);
  };

  const all = (selector: string) => [...root.querySelectorAll(selector)].filter(visible);
  const found: Violation[] = [];
  const add = (rule: Rule, el: Element, detail: string) => found.push({ rule, element: label(el), detail });

  const scrollWidth = document.documentElement.scrollWidth;
  if (scrollWidth > viewport + slack) {
    add('rolagem horizontal', document.documentElement, `${scrollWidth}px numa tela de ${viewport}px`);
  }

  const outside = all('*').filter((el) => {
    const rect = el.getBoundingClientRect();
    return (rect.left < -slack || rect.right > viewport + slack) && !clipped(el);
  });
  // Só o elemento de fora: os filhos dele saem junto.
  for (const el of outside.filter((el) => !outside.some((other) => other !== el && other.contains(el)))) {
    const rect = el.getBoundingClientRect();
    add('fora da tela', el, `de ${Math.round(rect.left)}px a ${Math.round(rect.right)}px`);
  }

  if (mobile) {
    const selector =
      'a[href], button, input:not([type=hidden]), textarea, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], .q-item--clickable';
    const targets = all(selector);
    for (const el of targets.filter((el) => !targets.some((other) => other !== el && other.contains(el)))) {
      // No campo do Quasar, a área de toque é o campo inteiro, não o <input>.
      const { width, height } = (el.closest('.q-field__control') ?? el).getBoundingClientRect();
      if (Math.min(width, height) < limits.touchTargetMin - slack) {
        add('toque pequeno', el, `${Math.round(width)}×${Math.round(height)}px`);
      }
    }
    return found;
  }

  for (const el of all('.q-btn, button.sc-icon-btn')) {
    const { height } = el.getBoundingClientRect();
    if (height > limits.desktopButtonMaxHeight + slack) add('botão alto', el, `${Math.round(height)}px`);
  }

  const content = overlay ? undefined : all('.sc-page, .login')[0];
  if (content) {
    const container = content.closest('.q-page-container');
    const free = viewport - (container ? Number.parseFloat(getComputedStyle(container).paddingLeft) : 0);
    const style = getComputedStyle(content);
    const width =
      content.getBoundingClientRect().width -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight);
    const ratio = width / free;
    if (ratio < limits.contentMinRatio) {
      add(
        'conteúdo estreito',
        content,
        `${Math.round(width)}px de ${Math.round(free)}px (${Math.round(ratio * 100)}%)`,
      );
    }
  }
  return found;
}
