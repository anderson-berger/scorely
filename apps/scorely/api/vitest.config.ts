import { defineConfig } from 'vitest/config';

// Resolve os aliases dos pacotes (`@scorely/api/src/...`) pelos `paths` do tsconfig.base.json.
// O globalSetup cria a tabela das suítes de contrato no DynamoDB Local (ADR 0019).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { globalSetup: ['./vitest.global-setup.ts'] },
});
