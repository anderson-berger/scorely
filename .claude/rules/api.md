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
  return authRoute(event, async (auth) => {
    const user: Me = await users.get(auth.userId);
    return user;
  });
}

export async function createInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: CreateGroupInviteInput = parseBody(event, CreateGroupInviteInputSchema);
    const publicId = asPublicGroupId(pathParam(event, 'publicId'));
    const invite: GroupInvite = await groups.createInvite(auth.userId, publicId, input);
    return created(invite);
  });
}
```

- O nome da função é exatamente o do `functions.ts` (`handler('me')` → `export async function me`).
- **Em passos: ler → chamar → responder**, um por linha:
  - `await` só como comando (`await x.y(...);`) ou como valor de uma `const`. Nada de `return await` nem `created(await ...)`.
  - Argumento do que é aguardado e do `created(...)` não contém outra chamada: guarde numa `const` antes.
  - O `return` devolve nome, propriedade, objeto/literal sem chamada ou `created(nome)`. Para outro status: `const response = new HttpResponse(...); return response;`.
  - A `const` que recebe `await ...`, `parseBody(...)` ou `<Schema>.parse(...)` tem o tipo escrito (também na desestruturação). Valor simples, como o `publicId`, dispensa. Tipo sem nome exportado: crie o `export type` no contrato.
  - A ordem das leituras define qual erro sai primeiro: não troque ao mexer num handler.
  - Check: `checks/api.test.ts` (só os `handlers.ts`, dentro das `export async function`).
- Nos parâmetros, só o `event` é anotado (`HttpEvent`); o `auth` vem tipado pelo callback do `authRoute`.
- Helper compartilhado entre rotas é função do módulo, sem `export`.
- Fora dos handlers, função exportada também é **declaração** (`export function x() {}`), não arrow em const.

## Regras como funções

Motivo: [docs/decisions/0025-regras-como-funcoes.md](../../docs/decisions/0025-regras-como-funcoes.md).

```ts
// rules/groups.ts
export async function createGroup(deps: GroupsDeps, userId: UserId, input: CreateGroupInput): Promise<Group> {
  const group = await insertGroup(deps, userId, input.name);
  return toGroup(deps, group, OWNER, NO_ROLES);
}

// handlers.ts
import * as groupRules from '@scorely/api/src/modules/groups/rules/groups';
const deps: GroupsDeps = { groups: dynamoGroupRepository, now: systemNow, ... };
const group: Group = await groupRules.createGroup(deps, auth.userId, input);
```

- Toda regra é `export async function <nome>(deps, ...)`: as dependências no 1º argumento, depois quem pede (`userId`), os ids e por último o `input`. Nomes curtos: `deps`, `input`.
- **Sem fábrica que devolve objeto** (`createXService(...)`, `xRules(ctx)`, `return { a, b }`) e sem service que só repassa. O handler chama a regra direto, com `import * as <assunto>Rules`.
- O `<Mod>Deps` fica no `<mod>.service.ts`. Módulo sem `rules/` tem as regras ali mesmo.
- Função que só o assunto usa fica sem `export`. A que outros assuntos usam (`requireMembership`, `toGroup`) é exportada pelo assunto dono.
- Quem monta a resposta se chama `to<Coisa>` (`toGroup`, `toUser`, `toMe`).
- **A hora é `deps.now()`**, obrigatório no `<Mod>Deps`. Em produção o `handlers.ts` passa `systemNow` (`src/lib/clock.ts`); o teste passa o relógio dele. `new Date()` sem argumento e `Date.now()` só no `clock.ts`.
- Os repositórios continuam objetos (`dynamo<Mod>Repository`): são a porta que o teste troca pela memória.
- O módulo que serve outro (notificações, mídia) é passado nas deps como um objeto pequeno, montado no `handlers.ts`: `notifications: { notify: (userId, input) => notify(notificationDeps, userId, input) }`.
- Check: `checks/api.test.ts`.

## Handlers devolvem só os dados

`route`/`authRoute` (`src/lib/http.ts` / `src/lib/auth.ts`) rodam o callback e montam a resposta HTTP. O handler escreve só o caminho feliz.

- Devolva os dados: valor → **200** com JSON; nada (`undefined`) → **204**. Não monte `{ statusCode, body }` nem chame `JSON.stringify`.
- Status diferente: `created(body)` (201) ou `new HttpResponse(status, body?)`.
- Para falhar, lance `appError(code)` (scorely: veja `scorely-api.md`). O wrapper converte em `{ error: { code, message, details? } }`; `ZodError` vira 422 `VALIDATION_ERROR` e qualquer outro erro vira 500 `INTERNAL_ERROR`, logado em JSON e sem vazar a mensagem (a resposta leva só o `requestId`).
- **Sem try/catch no handler** só para responder erro. try/catch só para traduzir um erro específico num `appError` (ex.: `ConditionalCheckFailedException` → `appError('X_ALREADY_EXISTS')`), de preferência no service ou no repository.

## Edição manda a versão (scorely)

Motivo: [docs/decisions/0016-version-confere-nas-edicoes.md](../../docs/decisions/0016-version-confere-nas-edicoes.md).

- Toda rota que edita algo que a tela mostrou (PUT/PATCH, e o DELETE ou a ação que muda o item) recebe `version` no corpo: o input do contrato tem `version: VersionSchema`, ou é o `VersionInputSchema` quando só manda a versão. A resposta traz a `version` do item.
- Item que ainda não existe: a tela manda `0`. Criar não manda versão.
- Versão velha → `VERSION_CONFLICT` (409, `details.currentVersion`). No web, o `onPermissionError` trata o conflito como a permissão perdida: o casco relê, o painel fecha e o aviso é o `errors.VERSION_CONFLICT`.

## Forma do módulo

Motivo: [docs/decisions/0021-modulo-por-assunto.md](../../docs/decisions/0021-modulo-por-assunto.md).

```
<mod>/
  functions.ts            as rotas
  handlers.ts             os handlers; monta as dependências (repositórios do DynamoDB)
  <mod>.service.ts        o <Mod>Deps; sem rules/, também as regras (ADR 0025)
  <mod>.access.ts         a porta para os outros módulos (só quando há)
  rules/<assunto>.ts      um arquivo por assunto do doc do módulo (só com mais de um assunto)
  data/                   <mod>.table.ts, <mod>.repository.ts, <mod>.memory.ts
                          repositório grande: um <mod>.<assunto>.repository.ts por assunto, que o
                          <mod>.repository.ts junta; tipos em <mod>.types.ts, helpers comuns em <mod>.dynamo.ts
  tests/                  fixtures.ts (o setup único), <assunto>.test.ts, repository.contract.test.ts
  <sub>/                  submódulo (tem functions.ts), com a mesma forma por dentro
```

- As únicas pastas de nome livre são os submódulos. Assunto é arquivo (`rules/invites.ts`), não pasta.
- O prefixo dos arquivos é o nome da pasta do módulo (`groups.repository.ts`, `matches.table.ts`).
- Outro módulo de cima importa só a raiz (`<mod>.service.ts`, `<mod>.access.ts`). O `data/` de outro módulo aparece só no `handlers.ts` e nos `tests/`. Dentro do mesmo módulo de cima (o grupo e os submódulos) o `data/` é livre. Exceção: `src/lib/db.ts` lê os `*_ENTITY` de `auth/data` e `users/data`.
- Teste da api só em pasta `tests/` (inclusive os de `src/lib/`, em `src/lib/tests/`).
- O `handlers.ts` de cada módulo fica na raiz dele; o `auth/authorizer.ts` (handler do authorizer) também.

Check: `checks/api.test.ts`.

Módulo novo: crie na forma acima e faça o spread do `<mod>Functions` em `functions` no `serverless.ts`.

Submódulo ([ADR 0022](../../docs/decisions/0022-submodulos-do-grupo.md)): assunto que só existe dentro de outro módulo vai em `api/src/modules/<mod>/<sub>/`, com o próprio `functions.ts` (handler `src/modules/<mod>/<sub>/handlers.<nome>`) e doc próprio, listado no índice como `projeto/<mod>/<sub>`. Ex.: `groups/matches`, `groups/competitions`.
