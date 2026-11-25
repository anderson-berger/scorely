import type { Violation } from '@scorely/web/screens/measure';

export interface Capture {
  route: string;
  width: number;
  screenshot: string;
  violations: Violation[];
  /** A tela não abriu: sem print nem medidas. */
  error?: string;
}

/** O relatório em Markdown: a tabela rota × largura e as violações de cada print. */
export function renderReport(captures: Capture[], widths: number[], generatedAt: Date): string {
  const routes = [...new Set(captures.map((c) => c.route))];
  const cell = (route: string, width: number) => {
    const capture = captures.find((c) => c.route === route && c.width === width);
    if (!capture) return '—';
    if (capture.error) return 'erro';
    return capture.violations.length === 0 ? 'ok' : String(capture.violations.length);
  };
  const table = [
    `| Rota | ${widths.map((w) => `${w}px`).join(' | ')} |`,
    `| --- |${' --- |'.repeat(widths.length)}`,
    ...routes.map((route) => `| ${route} | ${widths.map((w) => cell(route, w)).join(' | ')} |`),
  ];
  const details = captures
    .filter((c) => c.error || c.violations.length > 0)
    .flatMap((c) => [
      '',
      `## ${c.route} · ${c.width}px`,
      '',
      ...(c.error
        ? [`Erro: ${c.error}`]
        : [
            `Print: ${c.screenshot}`,
            '',
            ...c.violations.map((v) => `- ${v.rule}: ${v.element} — ${v.detail}`),
          ]),
    ]);
  return ['# Telas', '', `Gerado em ${generatedAt.toISOString()}.`, '', ...table, ...details, ''].join('\n');
}
