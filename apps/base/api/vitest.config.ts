import { defineConfig } from 'vitest/config';

// Resolve os aliases dos pacotes (`@scorely/api/src/...`) pelos `paths` do tsconfig.base.json.
export default defineConfig({ resolve: { tsconfigPaths: true } });
