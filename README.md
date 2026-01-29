# Scorely

Plataforma de gerenciamento de campeonatos e times esportivos.

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | Vue 3, Quasar, TypeScript |
| Backend | Node.js, Serverless Framework, AWS Lambda |
| Database | DynamoDB (Single Table Design) |
| Storage | S3 (presigned URLs) |
| Auth | Magic Link (JWT) |
| Infra Local | Docker, LocalStack |

## Estrutura do Projeto

```
scorely/
├── apps/
│   ├── api/          # Backend serverless
│   └── web/          # Frontend Vue 3
├── packages/
│   └── shared/       # Schemas e tipos compartilhados (Zod)
└── .devcontainer/    # Ambiente de desenvolvimento
```

## Requisitos

- Docker
- VS Code com extensão Dev Containers

## Setup Local

1. Abra o projeto no VS Code
2. Clique em "Reopen in Container" (ou F1 → Dev Containers: Reopen in Container)
3. Aguarde o container inicializar

```bash
# Instalar dependências
npm install

# Iniciar API (porta 3000)
cd apps/api && npm run dev

# Iniciar Web (porta 5173)
cd apps/web && npm run dev
```

## Serviços Locais

| Serviço | URL | Descrição |
|---------|-----|-----------|
| API | http://localhost:3000 | Backend serverless |
| Web | http://localhost:5173 | Frontend |
| LocalStack | http://localhost:4566 | AWS local (DynamoDB, S3, SES) |
| DynamoDB Admin | http://localhost:8001 | UI para DynamoDB |

## Variáveis de Ambiente

### API (`apps/api/env/.env.local`)

```env
STAGE=local
TABLE=scorely-local
REGION=sa-east-1
S3_BUCKET=scorely-local
JWT_MAGIC_LINK_SECRET=your-secret
JWT_MAGIC_LINK_TOKEN_EXPIRY=15m
JWT_ACCESS_SECRET=your-secret
JWT_ACCESS_TOKEN_EXPIRY=7d
FRONTEND_URL=http://localhost:5173
```

## Arquitetura

### Single Table Design (DynamoDB)

| Entidade | PK | SK |
|----------|----|----|
| User | `USER#<id>` | `METADATA` |
| Team | `TEAM#<id>` | `METADATA` |
| Member | `TEAM#<teamId>` | `MEMBER#<userId>` |
| Championship | `CHAMP#<id>` | `METADATA` |
| Organizer | `CHAMP#<champId>` | `ORG#<userId>` |
| Participant | `CHAMP#<champId>` | `PART#<teamId>` |

### Fluxo de Autenticação

1. Usuário informa email
2. Backend gera magic link e envia por email (SES)
3. Usuário clica no link
4. Backend valida token e retorna JWT de acesso
5. Frontend armazena JWT e usa em requisições

## Scripts

```bash
# Root
npm install          # Instala todas as dependências

# API
npm run dev          # Inicia serverless offline
npm run setup:local  # Cria tabela e bucket no LocalStack

# Web
npm run dev          # Inicia Vite dev server
npm run build        # Build de produção
```

## Licença

Privado - Todos os direitos reservados.
