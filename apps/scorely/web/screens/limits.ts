/** Limites do layout (ADR 0023). Ficam aqui até virarem o guia visual (`.claude/rules/web-visual.md`). */
export const WIDTHS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

export const LIMITS = {
  /** Abaixo desta largura é celular. */
  mobileBelow: 600,
  /** A partir de 600px, a altura máxima de um botão. */
  desktopButtonMaxHeight: 44,
  /** No celular, o lado mínimo da área de toque. */
  touchTargetMin: 44,
  /** A partir de 600px, quanto da largura livre (sem o menu lateral) o conteúdo usa, no mínimo. */
  contentMinRatio: 0.7,
  /** Folga de arredondamento das medidas, em px. */
  tolerance: 1,
};

export type Limits = typeof LIMITS;
