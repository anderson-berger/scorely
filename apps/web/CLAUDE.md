# Apps Web – AI Context

Frontend do Scorely. SPA com Vue 3 e Quasar Framework.

## Objetivo

- Interface para gerenciamento de times, campeonatos e jogos
- Consumir a API REST do backend
- Experiencia de usuario simples e responsiva

## Stack

- Vue 3 (Options API)
- Quasar Framework (componentes UI)
- Vite (build tool via @quasar/app-vite)
- Vue Router
- Axios (HTTP client)
- TypeScript

## Estrutura

- `src/pages/` – Paginas/views da aplicacao
- `src/components/` – Componentes reutilizaveis
- `src/layouts/` – Layouts base (header, sidebar, etc)
- `src/router/` – Definicao de rotas
- `src/services/` – Chamadas HTTP para a API
- `src/boot/` – Plugins e inicializacao do Quasar
- `src/plugins/` – Plugins customizados (loading, etc)
- `src/assets/` – Assets estaticos
- `src/css/` – Estilos globais

## Scripts

- `npm run dev` – Inicia dev server (Quasar/Vite)
- `npm run build` – Build de producao
- `npm run lint` – Linting com ESLint
- `npm run format` – Formatacao com Prettier

## Convencoes

- Usar Options API (setup script)
- Componentes Quasar para UI (q-btn, q-input, etc)
- Services encapsulam chamadas HTTP
- Types vem de `@scorely/shared` (devDependency)

## Plugin de Loading (`src/plugins/loading.ts`)

Plugin customizado para gerenciar estados de loading por chave.
Registrado globalmente via boot file (`src/boot/loading.ts`) como `$load`.

API:

- `$load.isLoading('key')` – Verifica se uma chave esta em loading
- `$load.execute('key', asyncFn)` – Executa uma funcao async com loading automatico
- `$load.setLoading('key', bool)` – Seta loading manualmente

Exemplo de uso (ver `src/pages/public/HomePage.vue`):

```vue
<!-- No template: -->
<q-btn :loading="$load.isLoading('sent-email')" />

<!-- No script: -->
await this.$load.execute('sent-email', async () => { await
AuthService.sendMagicLink(this.magicLink); });
```

## Proxy (dev server)

No `quasar.config.ts`, requests com `/api` sao redirecionados para o backend local:

- `/api/*` → `http://localhost:3000`
- Services devem usar paths relativos com prefixo `/api`

## Limites importantes

- Nao conter logica de negocio (apenas UI e chamadas HTTP)
- Nao importar codigo do backend
- Nao duplicar types que existem em @scorely/shared
- Nao acessar banco de dados diretamente

## Dependencias internas

- `@scorely/shared` – Schemas e types compartilhados (devDependency)
