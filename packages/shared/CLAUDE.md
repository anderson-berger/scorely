# Packages Shared – AI Context

Pacote compartilhado entre frontend e backend.
Contém schemas Zod e types que servem como contratos entre as apps.

## Objetivo

- Centralizar schemas de validacao (Zod)
- Servir como fonte da verdade para tipos compartilhados
- Evitar duplicacao de tipos entre apps

## Estrutura

- `schemas/` – Schemas Zod organizados por dominio (auth, team, championship, user)
- `types/` – Types derivados dos schemas (quando necessario)

## Convencoes

- Cada dominio tem sua pasta com um `index.ts` que exporta tudo
- `schemas/index.ts` re-exporta todos os dominios
- Schemas usam Zod para validacao e inferencia de tipos
- Nao conter logica de negocio, apenas definicoes de dados

## Path alias

- `@/*` resolve para a raiz do pacote (`./`)
- Usar `@/schemas/...` para imports internos

## Exports (package.json)

- `.` → `./schemas/index.ts`
- `./schemas` → `./schemas/index.ts`
- `./schemas/*` → `./schemas/*/index.ts`

## Limites importantes

- Nao importar codigo de apps/api ou apps/web
- Nao conter logica de negocio ou efeitos colaterais
- Nao depender de runtime especifico (Node, browser)
- Unica dependencia permitida: Zod

## Como consumir

- Apps importam via `@scorely/shared` (workspace dependency)
