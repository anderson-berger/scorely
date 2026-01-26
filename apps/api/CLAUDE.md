# Apps API – AI Context

Backend serverless do Scorely. Roda em AWS Lambda com API Gateway.

## Objetivo

- Expor endpoints REST para o frontend
- Gerenciar logica de negocio (times, campeonatos, jogos, auth)
- Persistir dados no DynamoDB (single-table design)

## Stack

- Node.js + TypeScript
- Serverless Framework (offline para dev local)
- AWS Lambda + API Gateway
- DynamoDB (via @aws-sdk)
- Zod para validacao de input
- Jose para JWT/tokens

## Estrutura

- `src/modules/` – Dominios de negocio (auth, team, championship, user, health-check)
  - Cada modulo contem: handlers, services, repositories
- `src/http/` – Handlers HTTP organizados por dominio
- `src/utils/` – Utilitarios compartilhados (db, config, error, middleware, token, response, pagination)

## Convencoes

- Handlers recebem o evento, validam input e delegam para services
- Services contem logica de negocio
- Repositories fazem acesso ao DynamoDB
- Schemas de validacao vem de `@scorely/shared`
- Erros sao tratados via utilitarios padronizados

## Scripts

- `npm run dev` – Inicia serverless-offline (local)
- `npm run setup:local` – Cria tabelas no DynamoDB local

## Limites importantes

- Nao conter logica de UI ou frontend
- Nao duplicar schemas que existem em @scorely/shared
- Handlers devem ser finos (delegar para services)
- Repositories nao devem conter logica de negocio

## Dependencias internas

- `@scorely/shared` – Schemas e types compartilhados
