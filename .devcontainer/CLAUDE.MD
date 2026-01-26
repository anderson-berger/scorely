# DevContainer – AI Context

Este diretório define o ambiente de desenvolvimento local do Scorely.
Nada aqui deve ser considerado configuração de produção.

## Objetivo

- Fornecer ambiente consistente de desenvolvimento
- Facilitar DX para frontend e backend
- Simular serviços AWS localmente

## Stack e ferramentas

- Docker + Docker Compose
- Node.js (Alpine)
- AWS CLI
- LocalStack
- DynamoDB local
- DynamoDB Admin

## Serviços locais

- `dev`: container principal de desenvolvimento
- `localstack`: simula serviços AWS (DynamoDB, SES)
- `dynamodb-admin`: UI para inspeção do DynamoDB local

## Princípios

- Ambiente local deve ser simples e previsível
- Configurações aqui não devem impactar prod
- Preferir simplicidade a otimizações avançadas
- Containers são descartáveis

## Limites importantes

- Não incluir lógica de aplicação aqui
- Não replicar infraestrutura real de produção
- Não adicionar serviços sem necessidade clara de DX

## Networking

- Comunicação interna via `scorely-network`
- Acesso externo apenas via portas expostas

## Ambientes

- Usado apenas para `local`
- Produção usa AWS real
