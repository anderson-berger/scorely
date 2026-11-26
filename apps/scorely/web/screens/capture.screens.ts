import { readFile, writeFile } from 'node:fs/promises';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { LIMITS, WIDTHS } from '@scorely/web/screens/limits';
import { measure } from '@scorely/web/screens/measure';
import { FILES, OUTPUT_DIR } from '@scorely/web/screens/paths';
import { type Capture, renderReport } from '@scorely/web/screens/report';
import { ROUTES, type ScreenIds, type ScreenRoute } from '@scorely/web/screens/routes';

/** `SCREENS_ROUTES=partidas,perfil` e `SCREENS_WIDTHS=390` recortam a rodada. */
function selected<T>(variable: string, all: readonly T[], key: (item: T) => string): T[] {
  const wanted = (process.env[variable] ?? '').split(/[\s,]+/).filter(Boolean);
  if (wanted.length === 0) return [...all];
  const unknown = wanted.filter((value) => !all.some((item) => key(item) === value));
  if (unknown.length > 0) {
    throw new Error(`${variable}: unknown ${unknown.join(', ')}. Options: ${all.map(key).join(', ')}`);
  }
  return all.filter((item) => wanted.includes(key(item)));
}

/** Espera a tela parar: sem pedidos, sem carregando, com as fontes e a animação do painel. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.q-spinner')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function capture(
  browser: Browser,
  route: ScreenRoute,
  size: { width: number; height: number },
  ids: ScreenIds,
): Promise<Capture> {
  const screenshot = `${OUTPUT_DIR}${route.id}-${size.width}.png`;
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    baseURL: test.info().project.use.baseURL as string,
    ...(!route.anonymous && { storageState: FILES.storageState }),
  });
  const page = await context.newPage();
  try {
    const path = route.path(ids);
    await page.goto(path);
    await settle(page);
    // O guard desvia sem sessão ou sem apelido: o print seria de outra tela.
    expect(new URL(page.url()).pathname).toBe(path);
    if (route.panel?.openWith) {
      await page.getByRole('button', { name: route.panel.openWith }).click();
    }
    if (route.panel) {
      await expect(page.locator('.q-dialog')).toBeVisible();
      await settle(page);
    }
    const violations = await page.evaluate(measure, { limits: LIMITS, overlay: Boolean(route.panel) });
    // A página inteira vem de uma janela mais alta: no `fullPage`, a barra fixa de baixo sai no meio do print.
    // Com painel, o print é do que se vê.
    if (!route.panel) {
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: size.width, height: Math.max(size.height, height) });
    }
    await page.screenshot({ path: screenshot });
    return { route: route.id, width: size.width, screenshot, violations };
  } catch (err) {
    const error = err instanceof Error ? (err.message.split('\n')[0] ?? err.message) : String(err);
    return { route: route.id, width: size.width, screenshot, violations: [], error };
  } finally {
    await context.close();
  }
}

test('prints e medidas das telas', async ({ browser }) => {
  const routes = selected('SCREENS_ROUTES', ROUTES, (route) => route.id);
  const sizes = selected('SCREENS_WIDTHS', WIDTHS, (size) => String(size.width));
  const ids = JSON.parse(await readFile(FILES.ids, 'utf8')) as ScreenIds;

  const captures: Capture[] = [];
  // Em série: as rotas usam a mesma sessão, e o api de dev é um processo só.
  for (const route of routes) {
    for (const size of sizes) captures.push(await capture(browser, route, size, ids));
  }

  const widths = sizes.map((size) => size.width);
  await writeFile(FILES.report, renderReport(captures, widths, new Date()));
  console.log(`Report: ${FILES.report}`);
  // Violação não falha a rodada (o relatório é o resultado); tela que não abre, sim.
  expect(captures.filter((c) => c.error).map((c) => `${c.route} ${c.width}: ${c.error}`)).toEqual([]);
});
