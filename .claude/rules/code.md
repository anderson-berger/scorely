---
paths:
  - "apps/**/*.ts"
  - "apps/**/*.vue"
  - "infra/**/*.ts"
  - "checks/**/*.ts"
  - "serverless-compose.ts"
---

# Código: nunca `let`

**Não use `let` (nem `var`).** Toda variável é `const`. Precisou reatribuir? Reestruture. O lint barra `let` com `biome-plugins/no-let.grit`.

- Valor criado sob demanda (cliente, env, service): `const x = lazy(() => ...)`, de `src/lib/fn.ts` da api.
- Loop: `for (const x of ...)`. Para lotes, `chunk(items, size)`; para repetir N vezes, `range(n)` (ambos em `src/lib/fn.ts`). Ou `map`/`reduce`. Sem `for (let i...)`.
- Valor que depende de try/catch ou de `if`: extraia uma função que devolve o valor (veja `parseJson` em `src/lib/http.ts`).
- Retry/paginação: função recursiva (veja `batchGetAll` em `apps/scorely/api/src/lib/db.ts`).
- Estado que muda de verdade (timer, promise em andamento, sessão em memória): campo de um objeto `const` (`const state = { current: read() }`) ou estado da store, nunca uma variável reatribuída.
- Testes: cada teste monta o próprio contexto (`const t = await loggedIn()`), sem `let` no `beforeEach`. Relógio fake é objeto: `const clock = { now: new Date(...) }`.

# Imports: sempre pelo alias do pacote

**Nenhum import relativo (`./` ou `../`).** Todo caminho começa pelo nome do pacote e vai até o arquivo: `@scorely/api/src/lib/auth`, `@scorely/web/src/lib/http`, `@scorely/api/project`, `@infra/shared/single-table`, `@checks/lib`. Vale para `import`, `export ... from`, `import()` dinâmico e `vi.mock`. Check: `checks/imports.test.ts`.

- Os aliases ficam só nos `paths` do `tsconfig.base.json` (um por pacote: `@<projeto>/<pacote>/*` → a pasta do pacote). Pacote novo: acrescente a linha ali.
- Quem resolve: `tsc` e o esbuild do Serverless leem os `paths` direto; Vite e Vitest, por `resolve: { tsconfigPaths: true }` (no `vite.config.ts` do web, no `vitest.config.ts` das apis e no `vitest.config.mts` da raiz, para os `checks`); o `tsx` do `db:setup`, pelo tsconfig de `infra/<projeto>`. Pasta com código fora de um pacote precisa de um `tsconfig.json` que estenda o base (ex.: `infra/shared`).
- O pacote inteiro continua pelo nome sem caminho: `@scorely/contracts`.
