---
paths:
  - "apps/*/api/src/**"
---

# API: handlers (base e scorely)

## Handlers como métodos de um objeto

Nos `handlers.ts`, as rotas são métodos de um objeto passado a `handlers({...})` (rota pública) ou `authHandlers({...})` (rota com authorizer, só no scorely). Nunca um `export const x = handler(async () => ...)` por rota. A única linha `export const` do arquivo é a desestruturação que a Lambda usa para achar cada função pelo nome do `functions.ts`. Check: `checks/api.test.ts` (rota ↔ export; authorizer ⇔ `authHandlers`).

```ts
const users = createUserService(dynamoUserRepository);

export const { me, updateMe } = authHandlers({
  async me(_event, auth) {
    return users.get(auth.userId);
  },

  async updateMe(event, auth) {
    const patch = parseBody(event, UpdateMeInputSchema);
    return users.update(auth.userId, patch);
  },
});
```

- Um objeto por tipo de rota. Módulo com rotas públicas e protegidas tem um `handlers({...})` e um `authHandlers({...})` (veja `apps/scorely/api/src/modules/auth/handlers.ts`).
- Os nomes desestruturados são exatamente as chaves do objeto e os nomes do `functions.ts` (`handler('me')` → `handlers.me`).
- Não anote os tipos de `event` e `auth`: eles vêm do `handlers`/`authHandlers`.
- **Não use `this` nos métodos.** Cada um vira uma função solta; helper compartilhado é função do módulo, fora do objeto.
- Fora dos handlers, função exportada é **declaração** (`export function x() {}`), não arrow em const. Factories que devolvem objeto (`createUserService`) e valores (`const users = ...`) continuam como estão.

## Handlers devolvem só os dados

`handlers`/`authHandlers` (`src/lib/http.ts` / `src/lib/auth.ts`) envolvem cada método com `handler()`/`authHandler()`, que monta a resposta HTTP. O handler escreve só o caminho feliz.

- Devolva os dados: valor → **200** com JSON; nada (`undefined`) → **204**. Não monte `{ statusCode, body }` nem chame `JSON.stringify`.
- Status diferente: `created(body)` (201) ou `new HttpResponse(status, body?)`.
- Para falhar, lance `appError(code)` (scorely: veja `scorely-api.md`). O wrapper converte em `{ error: { code, message, details? } }`; `ZodError` vira 422 `VALIDATION_ERROR` e qualquer outro erro vira 500 `INTERNAL_ERROR`, logado em JSON e sem vazar a mensagem (a resposta leva só o `requestId`).
- **Sem try/catch no handler** só para responder erro. try/catch só para traduzir um erro específico num `appError` (ex.: `ConditionalCheckFailedException` → `appError('X_ALREADY_EXISTS')`), de preferência no service ou no repository.

## Módulo novo

`api/src/modules/<mod>/` (functions.ts, handlers, service, repository, testes) → spread do `<mod>Functions` em `functions` no `serverless.ts`.
