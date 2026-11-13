---
paths:
  - "apps/scorely/api/src/**"
  - "apps/scorely/contracts/**"
---

# scorely: erros, idioma, autenticação e notificações

## Erros controlados por código

**Todo erro esperado tem um código do catálogo. Nunca `throw new Error(...)` para uma situação prevista, e nunca crie código ou status na hora.**

- Os códigos ficam em `ErrorCodeSchema` (`apps/scorely/contracts/src/errors.ts`), compartilhados com o web. Status e mensagem de cada um ficam no `CATALOG` de `apps/scorely/api/src/lib/errors.ts`. O TypeScript recusa código que falte no catálogo.
- Lance com `throw appError('USER_NOT_FOUND')`. Código com dados extras declara o schema em `ErrorDetailsSchemas`, e aí o `appError` exige o objeto: `appError('AUTH_CODE_COOLDOWN', { retryInSeconds: 42 })`. Dado que o web precisa (tempo de espera, campo, limite) vai em `details`, nunca dentro do texto.
- Código específico por situação, com prefixo do módulo (`USER_NOT_FOUND`, `SESSION_EXPIRED`), não um genérico como `NOT_FOUND`.
- Erro novo: (1) código no `ErrorCodeSchema`, (2) status e mensagem no `CATALOG`, (3) schema em `ErrorDetailsSchemas` se tiver `details`, (4) tradução em `errors.<CODE>` em **todos** os locales do web (`apps/scorely/web/src/i18n/locales/`). O TypeScript acusa o que faltar.
- Não coloque dado pessoal (email, nome, token) na mensagem de erro nem no log.
- `Error` comum fica só para bug ou falha de infra: vira 500 `INTERNAL_ERROR`.

## Idioma

- **Back (api e contracts) só em inglês**: mensagens de erro, mensagens dos schemas Zod, logs e textos técnicos. Comentários podem continuar em português.
- O usuário nunca vê texto do back: o web traduz pelo `code` (veja `web.md`).
- Email com o código de login: texto por idioma em `src/modules/auth/login-code.email.ts`, no `locale` da requisição (padrão `pt-BR`).
- Exceção pendente: o título e o corpo das notificações ainda são gerados em português no back.

## Autenticação

Motivo de não usar Cognito: [docs/decisions/0003-auth-propria-sem-cognito.md](../../docs/decisions/0003-auth-propria-sem-cognito.md).

- Rota que exige login: quem valida o token é o **authorizer do API Gateway**, declarado na rota em `src/modules/<mod>/functions.ts` com `authorizer: { name: AUTHORIZER }` (de `src/lib/auth.ts`). No handler, a função responde por `authRoute(event, async (auth) => ...)`, que só lê o contexto do authorizer e responde 401 se a rota estiver sem authorizer. Nunca leia o header na mão. O `userId` vem de `auth.userId`, nunca do body. Check: `checks/api.test.ts`.
- O authorizer (`authAuthorizer`, em `provider.httpApi.authorizers`) roda sem cache (TTL 0). Sem header ele responde 401; com token inválido ou expirado, 403 sem o corpo `{ error }`. O web renova a sessão nos dois casos. Por isso, um 403 de regra de negócio sai sempre com o corpo `{ error }` (via `appError`).

## Notificações

- Para avisar um usuário, chame `notify(userId, { type, title, body?, link? })` do `NotificationService`. Tipo novo entra no `NotificationTypeSchema` de `@scorely/contracts`, com ícone em `notificationIcon` (`web/src/modules/notifications/notification.icons.ts`; o typecheck cobra o ícone).
- Contadores (não lidas) ficam em `PK=INBOX#<userId>` e mudam com `ADD` na mesma transação da entidade.
