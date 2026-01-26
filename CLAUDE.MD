# Scorely – Base AI Context

Projeto monorepo para gerenciamento de times, campeonatos e jogos.

## Objetivo do produto

Permitir criar e gerenciar:

- Times
- Campeonatos
- Jogos
- Convites e membros
  com foco em simplicidade, evolução incremental e baixo acoplamento.

## Arquitetura geral

- Monorepo
- Frontend e Backend separados
- Contratos compartilhados como fonte da verdade

## Stack principal

- TypeScript em todo o projeto
- Backend: Node.js + Serverless (AWS Lambda + API Gateway)
- Banco: DynamoDB (single-table design)
- Validação: Zod
- Frontend: Vue 3 + Quasar

## Princípios obrigatórios

- Não duplicar tipos entre front e back
- Schemas Zod são a fonte da verdade
- Código simples > abstração prematura
- Evoluir o sistema sem quebrar contratos existentes

## Limites importantes

- Frontend não importa código do backend
- Backend não contém lógica de UI

## Estilo de código

- Preferir funções pequenas e explícitas
- Usar arrow functions
- Clareza > otimização precoce

## Antipadrões a evitar

- Criar types duplicados
- Acoplamento direto entre apps
- Abstrações genéricas sem uso real
- Lógica de negócio espalhada

## Ambientes

- local (localstack / devcontainer)
- dev
- prod
