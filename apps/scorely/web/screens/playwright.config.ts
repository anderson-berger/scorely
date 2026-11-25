import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import { WEB_URL } from '@scorely/web/screens/env';
import { OUTPUT_DIR } from '@scorely/web/screens/paths';

/** Prints e medidas das telas (ADR 0023). Fora do `npm run check`: precisa da api e do web rodando. */
export default defineConfig({
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  // `.screens.ts` para o vitest não pegar.
  testMatch: '**/*.screens.ts',
  globalSetup: fileURLToPath(new URL('./setup.ts', import.meta.url)),
  outputDir: `${OUTPUT_DIR}playwright`,
  timeout: 180_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: WEB_URL },
});
