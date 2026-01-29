# TODO - Roadmap para Nível Senior

Este documento lista as melhorias necessárias para elevar o projeto do estágio MVP para um sistema production-ready de nível senior.

---

## 1. Qualidade de Código

### 1.1 Testes
- [ ] Configurar Vitest no monorepo
- [ ] Testes unitários para Services (API)
- [ ] Testes unitários para Repositories (API)
- [ ] Testes de integração para handlers (API)
- [ ] Testes de componentes Vue (Web)
- [ ] Testes E2E com Playwright ou Cypress
- [ ] Coverage mínimo de 80% em código crítico

### 1.2 Linting e Formatação
- [ ] Configurar ESLint com regras strict
- [ ] Configurar Prettier com regras consistentes
- [ ] Husky + lint-staged para pre-commit hooks
- [ ] Commitlint para mensagens de commit padronizadas

### 1.3 Documentação
- [x] README.md na raiz
- [ ] CONTRIBUTING.md com guidelines
- [ ] ADRs (Architecture Decision Records) para decisões importantes
- [ ] OpenAPI/Swagger para documentação da API
- [ ] JSDoc em funções públicas

---

## 2. Segurança

### 2.1 Código
- [ ] Remover todos os console.log de debug
- [ ] Implementar rate limiting nos endpoints
- [ ] Validar e sanitizar todos os inputs
- [ ] Implementar CORS restrito (não usar `*` em produção)
- [ ] Headers de segurança (Helmet.js ou equivalente)
- [ ] Audit de dependências (npm audit)

### 2.2 Autenticação
- [ ] Implementar refresh tokens
- [ ] Token rotation
- [ ] Logout com invalidação de token
- [ ] Proteção contra replay attacks
- [ ] MFA opcional

### 2.3 Dados
- [ ] Encryption at rest (DynamoDB)
- [ ] Encryption in transit (HTTPS everywhere)
- [ ] Não logar dados sensíveis
- [ ] LGPD compliance (termos, consentimento, exclusão)

---

## 3. Infraestrutura

### 3.1 CI/CD
- [ ] GitHub Actions workflow para PR checks
- [ ] Lint + Type check + Tests em cada PR
- [ ] Deploy automático para staging (branch develop)
- [ ] Deploy manual para produção (branch main)
- [ ] Rollback automatizado em caso de falha

### 3.2 Infraestrutura como Código
- [ ] Terraform ou SST para recursos AWS
- [ ] Separação de ambientes (dev, staging, prod)
- [ ] Secrets management (AWS Secrets Manager ou SSM)
- [ ] VPC configuration (se necessário)

### 3.3 Monitoramento
- [ ] CloudWatch Logs estruturados
- [ ] CloudWatch Alarms para erros e latência
- [ ] X-Ray para tracing distribuído
- [ ] Dashboard de métricas
- [ ] Alertas no Slack/Discord

### 3.4 Error Tracking
- [ ] Integrar Sentry ou similar
- [ ] Source maps para erros de frontend
- [ ] Contexto de usuário em erros
- [ ] Alertas para erros críticos

---

## 4. Performance

### 4.1 Backend
- [ ] Cache layer (ElastiCache ou DynamoDB DAX)
- [ ] Connection pooling
- [ ] Cold start optimization (provisioned concurrency)
- [ ] Payload compression (gzip)

### 4.2 Frontend
- [ ] Code splitting por rota
- [ ] Lazy loading de componentes
- [ ] Image optimization (WebP, lazy load)
- [ ] Service Worker para offline
- [ ] Bundle analysis e tree shaking

### 4.3 Database
- [ ] Revisar índices GSI (uso e custo)
- [ ] Implementar TTL para dados temporários
- [ ] Batch operations onde aplicável
- [ ] Query optimization (ProjectionExpression)

---

## 5. Arquitetura

### 5.1 Backend
- [ ] Extrair `getUserIdFromEvent()` para utility compartilhada
- [ ] Criar BaseService com métodos comuns
- [ ] Padronizar versão inicial de entidades (0 ou 1)
- [ ] Implementar soft delete onde necessário
- [ ] Event-driven architecture para operações assíncronas

### 5.2 Frontend
- [ ] Migrar de Options API para Composition API
- [ ] Implementar state management global (Pinia)
- [ ] Criar composables reutilizáveis
- [ ] Extrair funções duplicadas (`getRoleLabel`, etc.)
- [ ] Remover arquivos "copy" e código morto

### 5.3 Shared
- [ ] Criar `createUpdateSchema()` helper
- [ ] Adicionar schemas faltantes (`$updateMember`, `$updateParticipant`)
- [ ] Documentar diferença entre roles (Team vs Championship)
- [ ] Criar tipos base para entidades auditáveis

---

## 6. DevX (Developer Experience)

### 6.1 Ambiente Local
- [ ] Script de seed de dados para desenvolvimento
- [ ] Makefile ou scripts npm para comandos comuns
- [ ] Hot reload funcionando em todos os ambientes
- [ ] Documentação de troubleshooting

### 6.2 Debugging
- [ ] Source maps em desenvolvimento
- [ ] Debug configuration para VS Code
- [ ] Request logging em desenvolvimento

---

## 7. Funcionalidades Pendentes

### 7.1 Core
- [ ] Upload de avatar funcionando end-to-end
- [ ] CRUD completo de Championships
- [ ] Sistema de convites para times
- [ ] Notificações (email e in-app)

### 7.2 Nice to Have
- [ ] PWA support
- [ ] Dark mode
- [ ] Internacionalização (i18n)
- [ ] Export de dados (CSV, PDF)

---

## Priorização Sugerida

### Fase 1 - Estabilização (antes de ir para produção)
1. Remover logs de debug (segurança)
2. Configurar CI básico (lint + type check)
3. CORS restrito
4. Error tracking (Sentry)
5. Testes nos fluxos críticos (auth, teams)

### Fase 2 - Produção
1. IaC com Terraform/SST
2. CI/CD completo
3. Monitoramento (CloudWatch + Alarms)
4. Backup strategy

### Fase 3 - Escala
1. Cache layer
2. Performance optimization
3. Testes E2E
4. Coverage > 80%

---

## Métricas de Sucesso

| Métrica | Atual | Target Senior |
|---------|-------|---------------|
| Test Coverage | 0% | > 80% |
| Type Safety | Parcial | 100% strict |
| Deploy Time | Manual | < 10min automático |
| Error Rate | Desconhecido | < 0.1% |
| P95 Latency | Desconhecido | < 500ms |
| Uptime | N/A | 99.9% |

---

*Última atualização: Janeiro 2026*
