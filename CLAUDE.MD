# SCORELY - Sistema de Gestão de Campeonatos

## CONTEXTO DO PROJETO

Sistema para criação e acompanhamento de campeonatos esportivos seguindo princípios YAGNI (You Aren't Gonna Need It).

**Nome do Projeto:** Scorely
**Arquitetura:** Monorepo Monolítico
**Ambiente de Desenvolvimento:** DevContainer com LocalStack

---

## STACK TECNOLÓGICA

### Frontend

- Vue 3 + Vite
- Quasar Framework
- TypeScript

### Backend

- Node.js + TypeScript
- AWS Lambda (Serverless Framework)
- DynamoDB

### Infraestrutura

- LocalStack (ambiente local)
- AWS (dev e prod)
- Serverless Framework
- Docker + Docker Compose

---

## ESTRUTURA DO MONOREPO

```
/workspace
├── apps/
│   ├── api/          # Backend serverless (Lambda + Node + TS)
│   └── web/          # Frontend (Vue + Vite + Quasar + TS)
├── infra/            # Configurações serverless e IaC
├── docs/             # Documentação
└── .devcontainer/    # DevContainer setup
```

---

## AMBIENTES (STAGES)

1. **local** - LocalStack + DevContainer
2. **dev** - AWS (desenvolvimento)
3. **prod** - AWS (produção)

---

## FUNCIONALIDADES DO MVP

### 1. Usuários

- [ ] Cadastro de usuário (nome, email, senha)
- [ ] Login com JWT customizado
- [ ] Perfil básico

### 2. Times

- [x] Usuário pode criar um time
- [x] Usuário pode entrar em um time existente
- [ ] Time pode convidar jogadores (usuários)
- [x] Listar times

### 3. Campeonatos

- [ ] Usuário pode criar campeonato
- [ ] Campeonato pode convidar times
- [ ] Time pode aceitar convite para campeonato
- [ ] Listar campeonatos

### 4. Partidas (Sistema básico)

- [ ] Registrar partidas do campeonato
- [ ] Registrar resultados (placar)
- [ ] Visualizar tabela de classificação

---

## REGRAS DE DESENVOLVIMENTO

### Princípio YAGNI

- Implementar APENAS o que está especificado no MVP
- Sem features extras ou "melhorias futuras"
- Código simples e direto ao ponto
- Sem abstrações prematuras

### Fluxo de Trabalho

1. **Feature Branch** - Criar branch para cada funcionalidade
2. **Implementação** - Desenvolver seguindo MVP
3. **Commit** - Commits claros e descritivos
4. **Deploy** - Deploy automático ao finalizar feature

### Padrão de Commits

```
feat: adiciona cadastro de usuário
fix: corrige validação de email no login
refactor: simplifica estrutura de times
docs: atualiza README com endpoints
```

---

## PAPEL DO CLAUDE CODE

### Como Orientador de Fases

- Guiar a implementação por etapas pequenas e incrementais
- Validar se a feature está dentro do escopo do MVP
- Questionar qualquer código que extrapole o necessário
- Sugerir simplificações quando possível

### Como Analisador de Código

- Revisar código antes do commit
- Identificar over-engineering
- Apontar código que pode ser removido ou simplificado
- Validar se está seguindo YAGNI

### Perguntas Críticas a Fazer

- "Isso é realmente necessário para o MVP?"
- "Podemos implementar de forma mais simples?"
- "Estamos resolvendo um problema que ainda não existe?"
- "Isso pode ser feito com menos código?"

---

## MODELO DE DADOS (DynamoDB)

### Estratégia: Single Table Design + Lookup Pattern

**Tabela única:** `scorely-table`

- PK (Partition Key)
- SK (Sort Key)
- Atributos dinâmicos

## COMANDOS ÚTEIS

### Local (DevContainer)

```bash
# Frontend
cd apps/web
npm run dev

# Backend (LocalStack)
cd apps/api
npm run dev:local

# Deploy local
npm run deploy:local
```

### AWS

```bash
# Deploy dev
npm run deploy:dev

# Deploy prod
npm run deploy:prod
```

---

## CHECKLIST DE VALIDAÇÃO

Antes de cada commit, verificar:

- [ ] Código implementa APENAS o necessário?
- [ ] Não há abstrações prematuras?
- [ ] Não há código "preparando para o futuro"?
- [ ] Testes cobrem casos essenciais (não edge cases improváveis)?
- [ ] Documentação é mínima mas suficiente?

---

## ANTI-PATTERNS A EVITAR

❌ Criar configs complexas para "flexibilidade futura"
❌ Abstrair lógica que só é usada em um lugar
❌ Adicionar validações para casos que não vão acontecer no MVP
❌ Criar estruturas genéricas "reutilizáveis"
❌ Adicionar logs/metrics/monitoring excessivos no início
❌ Pensar em escalabilidade antes de ter usuários

✅ Código direto e simples
✅ Uma solução para um problema real
✅ Resolver o caso de uso atual
✅ Validar apenas inputs externos (API)
✅ Deploy rápido e iterativo

---

## PRÓXIMOS PASSOS

1. Configurar estrutura básica do projeto
2. Implementar autenticação JWT
3. CRUD de usuários
4. CRUD de times
5. CRUD de campeonatos
6. Sistema básico de partidas

---

**Última atualização:** 2026-01-19
