---
paths:
  - "apps/*/api/src/**"
---

# API: handlers (base e scorely)

## Handlers como funções

Nos `handlers.ts`, cada rota é uma `export async function <nome>(event: HttpEvent)` que responde por `route(event, async () => ...)` (rota pública) ou `authRoute(event, async (auth) => ...)` (rota com authorizer, só no scorely). **Nenhuma `export const` no `handlers.ts`**: nem `export const { a, b } = handlers({...})`, nem `export const x = handler(...)`. Check: `checks/api.test.ts` (rota ↔ `export function`; authorizer ⇔ `authRoute`; sem `export const`).

```ts
const users = createUserService(dynamoUserRepository);

export async function me(event: HttpEvent) {
  return authRoute(event, async (auth) => users.get(auth.userId));
}

export async function updateMe(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const patch = parseBody(event, UpdateMeInputSchema);
    return users.update(auth.userId, patch);
  });
}
```

- O nome da função é exatamente o do `functions.ts` (`handler('me')` → `export async function me`).
- Só o `event` é anotado (`HttpEvent`); o `auth` vem tipado pelo callback do `authRoute`.
- Helper compartilhado entre rotas é função do módulo, sem `export`.
- Fora dos handlers, função exportada também é **declaração** (`export function x() {}`), não arrow em const. Factories que devolvem objeto (`createUserService`) e valores (`const users = ...`) continuam como estão.

## Handlers devolvem só os dados

`route`/`authRoute` (`src/lib/http.ts` / `src/lib/auth.ts`) rodam o callback e montam a resposta HTTP. O handler escreve só o caminho feliz.

- Devolva os dados: valor → **200** com JSON; nada (`undefined`) → **204**. Não monte `{ statusCode, body }` nem chame `JSON.stringify`.
- Status diferente: `created(body)` (201) ou `new HttpResponse(status, body?)`.
- Para falhar, lance `appError(code)` (scorely: veja `scorely-api.md`). O wrapper converte em `{ error: { code, message, details? } }`; `ZodError` vira 422 `VALIDATION_ERROR` e qualquer outro erro vira 500 `INTERNAL_ERROR`, logado em JSON e sem vazar a mensagem (a resposta leva só o `requestId`).
- **Sem try/catch no handler** só para responder erro. try/catch só para traduzir um erro específico num `appError` (ex.: `ConditionalCheckFailedException` → `appError('X_ALREADY_EXISTS')`), de preferência no service ou no repository.

## Módulo novo

`api/src/modules/<mod>/` (functions.ts, handlers, service, repository, testes) → spread do `<mod>Functions` em `functions` no `serverless.ts`.
