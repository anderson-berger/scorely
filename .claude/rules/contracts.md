---
paths:
  - "apps/*/contracts/**"
  - "apps/*/api/src/modules/**"
  - "apps/*/web/src/modules/**"
---

# Contratos

Motivo: [docs/decisions/0005-contratos-em-pacote.md](../../docs/decisions/0005-contratos-em-pacote.md).

## scorely: só em `@scorely/contracts`

**Schema Zod de contrato da API (body, resposta, erro) fica só em `apps/scorely/contracts/src/<mod>.ts`**, exportado no `index.ts`. A api e a web importam de `@scorely/contracts`. Não crie `<mod>.schema.ts` nem schema local que repita um contrato. Check: `checks/contracts.test.ts` (projeto com contracts não tem `*.schema.ts`).

- O pacote só tem schemas e os tipos inferidos (`z.infer`). Única dependência: `zod`. Sem build: `"exports": { ".": "./src/index.ts" }`.
- Fora do pacote: helpers de apresentação (`displayName`, `notificationIcon`) ficam no web; tipos internos do servidor (ex.: `NewNotification`) ficam na api.
- Subconjunto de um contrato (ex.: o par de tokens que o web guarda) sai do schema do pacote com `.pick`/`.extend`, nunca de uma cópia.

## base: cópias iguais

O `base` ainda não usa contracts: cada `<mod>.schema.ts` existe na api e no web, **idêntico**. Mudou um, copie para o outro. Check: `checks/contracts.test.ts`. Mover para `@base/contracts` fica para um plano futuro.
