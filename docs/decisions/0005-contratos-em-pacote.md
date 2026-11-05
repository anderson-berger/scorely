# 0005: contratos em pacote (`@scorely/contracts`)

- Data: 2026-11-05 (plano 001)
- Estado: aceita (scorely); o `base` continua com cópias

## Contexto

Os schemas Zod de body, resposta e erro eram duplicados entre a api e o web, e as cópias podiam divergir.

## Decisão

No scorely, todo contrato fica em `apps/scorely/contracts` (`@scorely/contracts`, sem build, só `zod`), importado pela api e pelo web. O `base` mantém `<mod>.schema.ts` duplicado, com um check de cópias idênticas.

## Por quê

Uma fonte só: api e web não divergem, e o typecheck acusa no web uma mudança feita para a api.

## Consequências

- Helpers de apresentação ficam no web; tipos internos do servidor, na api.
- Mover o `base` para `@base/contracts` fica para um plano futuro.
- Regra: `.claude/rules/contracts.md`. Check: `checks/contracts.test.ts`.
