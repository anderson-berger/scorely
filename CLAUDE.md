# CLAUDE.md

## Infra separada da api (Serverless Compose)

**Nunca declare recursos (tabela, bucket, fila...) no `serverless.ts` de uma api.** Eles ficam no stack de infra do projeto. A api só tem lambdas, IAM e config.

- `infra/shared/`: definição da tabela (`single-table.ts`, fonte única), stack de infra (`infra-service.ts`) e `setup-local.ts` (LocalStack).
- `infra/<projeto>/serverless.ts`: stack `<projeto>-infra`. Cria o recurso e o expõe em `resources.Outputs`.
- `serverless-compose.ts` (raiz): repassa os outputs para a api em `params` (`'${service:<projeto>-infra.<Output>}'`).
- Na api, leia sempre com fallback para o dev local: `'${param:x, self:custom.localX}'`. O dev local roda fora do compose, e ali o `${param:...}` não existe.
- O IAM da api referencia o recurso pelo nome ou ARN montado (`Fn::Join` com `AWS::Region`/`AWS::AccountId`). Nunca use `Fn::GetAtt` de um recurso de outro stack.
- Recurso novo: crie em `infra-service.ts` (ou no `infra/<projeto>`), adicione um Output, passe o valor no compose e leia por param na api. Se ele também precisar existir no dev local, crie-o no `setup-local.ts`.
- Deploy só pela raiz (`npx serverless deploy ...`), nunca de dentro de `apps/<projeto>/api`.

## DynamoDB: single-table, SEM GSI

**Não crie GSI nem LSI.** Cada projeto tem a própria tabela, `<projeto>-<stage>`, só com `PK`/`SK` (definida em `infra/shared/single-table.ts`). Para buscar por qualquer campo que não seja o id, use **lookups**, que são itens ponteiro.

### Padrão

- **Entidade**: `PK=<ENTIDADE>#<id>`, `SK=META`, com todos os atributos.
- **Lookup**: item que guarda **só o `id`** da entidade, nunca uma cópia dos dados. Toda busca acontece em duas etapas: lê o lookup, pega o `id` e busca a entidade pela chave.

| Caso                                     | Chave do lookup                                     | Leitura                                                                                                       |
| ---------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Busca única (ex.: user por email)        | `PK=LOOKUP#USER#EMAIL#<email>`, `SK=META`, `{ id }` | `GetItem` no lookup → `GetItem` em `USER#<id>`                                                                |
| Listagem/ordenação (ex.: items por data) | `PK=LOOKUP#ITEM`, `SK=<createdAt>#<id>`, `{ id }`   | `Query` no lookup → `BatchGetItem` pelos ids (lotes de 100, tentar de novo `UnprocessedKeys`, manter a ordem) |

### Onde fica o modelo: `<mod>.table.ts`

**Como cada item é salvo e buscado fica num arquivo só, `api/src/modules/<mod>/<mod>.table.ts`, ao lado do repository.** É o lugar para entender o armazenamento de um módulo sem ler as queries.

- Ele tem: a constante do `entity` de cada item (`USER_ENTITY = 'User'`), uma função de chave por item (`userKey(id)`, `userEmailLookupKey(email)`) e, no JSDoc de cada uma, o formato `PK`/`SK`, o que o item guarda, como é escrito (transação, condição de unicidade) e como é lido (GetItem, Query → BatchGet). Tipos que só o servidor usa (ex.: `LoginCode`, `Session`) também ficam ali.
- O formato da entidade continua no contrato (`@scorely/contracts`; no base, `<mod>.schema.ts`). O `.table.ts` só importa o tipo. **Chave de DynamoDB nunca vai para o contracts**, porque a web o lê.
- O repository **não monta chave nem escreve o nome do `entity`**: importa do `.table.ts`. No scorely, o `entity` dos lookups é `LOOKUP_ENTITY` (`api/src/lib/db.ts`).
- Item novo ou lookup novo: primeiro no `.table.ts`, depois o repository.

Referência: `apps/scorely/api/src/modules/notifications/notification.table.ts` (entidade + lookup de listagem + contador).

### Regras

- Grave a entidade e **todos** os lookups dela na mesma `TransactWriteItems`. Nunca use escritas soltas.
- Valor único (email, slug, ...): coloque `ConditionExpression: 'attribute_not_exists(PK)'` no `Put` do lookup.
- Mudou um campo com lookup: na mesma transação, faça `Delete` do lookup antigo e `Put` do novo.
- Removeu a entidade: apague os lookups dela na mesma transação.
- Normalize o valor usado na chave (ex.: email em minúsculas e sem espaços).
- **Todo item tem `createdAt`** (ISO 8601 em UTC, `...Z`), sem exceção: entidade, lookup, contador. No scorely:
  - Entidade nasce com `newEntity<T>(data, now())` (`api/src/lib/entity.ts`), que gera `id` e `createdAt`. Não monte nenhum dos dois na mão.
  - Schema de entidade nos contracts estende `EntitySchema` (`id` + `createdAt`): `EntitySchema.extend({...})`.
  - Todo `Put` usa `dbItem(keys, entity, data, createdAt?)` (`api/src/lib/db.ts`). Nos lookups da mesma transação, passe o `createdAt` da entidade.
  - Item criado por `Update` (upsert, ex.: `INBOX`) inclui `setCreatedAtIfNew()` no `SET`.
- Marque cada item com `entity` (`'Item'`, `'User'`, `'Lookup'`, ...). Remova `PK`, `SK` e `entity` antes de devolver a entidade (veja `toItem` no base ou `stripKeys` em `apps/scorely/api/src/lib/db.ts`, que também remove `ttl`).
- Precisa de uma operação nova do DynamoDB? Adicione a permissão no IAM em `apps/<projeto>/api/serverless.ts`.

Implementação de referência: `apps/base/api/src/modules/items/item.repository.ts`.

## Código: nunca `let`

**Não use `let` (nem `var`).** Toda variável é `const`. Precisou reatribuir? Reestruture. O lint barra `let` com o plugin `biome-plugins/no-let.grit`.

- Valor criado sob demanda (cliente, env, service): `const x = lazy(() => ...)`, de `src/lib/fn.ts` da api.
- Loop: `for (const x of ...)`. Para lotes, `chunk(items, size)`; para repetir N vezes, `range(n)` (ambos em `src/lib/fn.ts`). Ou `map`/`reduce`. Sem `for (let i...)`.
- Valor que depende de try/catch ou de `if`: extraia uma função que devolve o valor (veja `parseJson` em `src/lib/http.ts`).
- Retry/paginação: função recursiva (veja `batchGetAll` em `apps/scorely/api/src/lib/db.ts`).
- Estado que muda de verdade (timer, promise em andamento, sessão em memória): campo de um objeto `const` (`const state = { current: read() }`) ou estado da store, nunca uma variável reatribuída.
- Testes: cada teste monta o próprio contexto (`const t = await loggedIn()`), sem `let` no `beforeEach`. Relógio fake é objeto: `const clock = { now: new Date(...) }`.

## Web: componentes Vue em Options API

**Não use `<script setup>`.** Todo `.vue` usa `<script lang="ts">` com `export default defineComponent({ ... })`, na ordem `name`, `components`, `setup`, `data`, `computed`, `watch`, hooks (`mounted`, `beforeUnmount`...) e `methods`.

- `setup()` serve só para expor as stores do Pinia: `return { auth: useAuthStore() }`. O resto fica nas opções.
- Use `this.$q`, `this.$route` e `this.$router`. Não chame `useQuasar`, `useRoute` nem `useRouter`.
- Declare o tipo de retorno de cada `computed` (`welcome(): boolean`). Sem ele, o TS perde a inferência do `this`.
- No `data()`, tipe com `as` os campos que não dá para inferir (`gender: undefined as Gender | undefined`).
- Helper importado que o template usa (ex.: `displayName`, `notificationIcon`) vira um método. O template só enxerga o que está no componente.
- Componente filho entra em `components: { ... }`.

Referência: `apps/scorely/web/src/modules/users/pages/ProfilePage.vue`.

## Contratos: só em `@scorely/contracts`

**Schema Zod de contrato da API (body, resposta, erro) fica só em `apps/scorely/contracts/src/<mod>.ts`**, exportado no `index.ts`. A api e a web importam de `@scorely/contracts`. Não crie `<mod>.schema.ts` nem schema local que repita um contrato.

- O pacote só tem schemas e os tipos inferidos (`z.infer`). Única dependência: `zod`. Sem build: `"exports": { ".": "./src/index.ts" }`.
- Fora do pacote: helpers de apresentação (`displayName`, `notificationIcon`) ficam no web; tipos internos do servidor (ex.: `NewNotification`) ficam na api.
- Subconjunto de um contrato (ex.: o par de tokens que o web guarda) sai do schema do pacote com `.pick`/`.extend`, nunca de uma cópia.
- O `base` ainda não usa contracts: lá os schemas continuam duplicados.

## API: handlers como métodos de um objeto

**Nos `handlers.ts`, escreva as rotas como métodos de um objeto passado a `handlers({...})` (rota pública) ou `authHandlers({...})` (rota com authorizer).** Nunca use um `export const x = handler(async () => ...)` por rota. A única linha `export const` do arquivo é a desestruturação que a Lambda precisa para achar cada função pelo nome usado no `functions.ts`:

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

- Um objeto por tipo de rota. Um módulo com rotas públicas e protegidas tem um `handlers({...})` e um `authHandlers({...})` (veja `apps/scorely/api/src/modules/auth/handlers.ts`).
- Os nomes desestruturados são exatamente as chaves do objeto e os nomes do `functions.ts` (`handler('me')` → `handlers.me`).
- Não anote os tipos de `event` e `auth`: eles vêm do `handlers`/`authHandlers`.
- **Não use `this` nos métodos.** Cada um vira uma função solta; um helper compartilhado fica como função do módulo, fora do objeto.
- Fora dos handlers, função exportada é **declaração** (`export function x() {}`), não arrow em const (`export const x = () =>`). Factories que devolvem objeto (`createUserService`) e valores (`const users = ...`) continuam como estão.

## API: handlers devolvem só os dados

`handlers`/`authHandlers` (`src/lib/http.ts` / `src/lib/auth.ts`) envolvem cada método com `handler()`/`authHandler()`, e é esse wrapper que monta a resposta HTTP. O handler escreve só o caminho feliz.

- Devolva os dados: valor → **200** com JSON; nada (`undefined`) → **204**. Não monte `{ statusCode, body }` nem chame `JSON.stringify`.
- Status diferente: `created(body)` (201) ou `new HttpResponse(status, body?)`.
- Para falhar, lance `appError(code)` (veja a seção abaixo). O wrapper converte em `{ error: { code, message, details? } }`; `ZodError` vira 422 `VALIDATION_ERROR` e qualquer outro erro vira 500 `INTERNAL_ERROR`, logado em JSON e sem vazar a mensagem (a resposta leva só o `requestId`).
- **Sem try/catch no handler** só para responder erro. Use try/catch apenas para traduzir um erro específico num `appError` (ex.: `ConditionalCheckFailedException` → `appError('X_ALREADY_EXISTS')`), de preferência no service ou no repository.

## API: erros controlados por código (scorely)

**Todo erro esperado tem um código do catálogo. Nunca `throw new Error(...)` para uma situação prevista, e nunca crie código ou status na hora.**

- Os códigos ficam em `ErrorCodeSchema` (`apps/scorely/contracts/src/errors.ts`), compartilhados com o web. Status e mensagem de cada um ficam no `CATALOG` de `apps/scorely/api/src/lib/errors.ts`. O TypeScript recusa código que falte no catálogo.
- Lance com `throw appError('USER_NOT_FOUND')`. Código com dados extras declara o schema em `ErrorDetailsSchemas`, e aí o `appError` exige o objeto: `appError('AUTH_CODE_COOLDOWN', { retryInSeconds: 42 })`. Dado que o web precisa (tempo de espera, campo, limite) vai em `details`, nunca dentro do texto.
- Código específico por situação, com prefixo do módulo (`USER_NOT_FOUND`, `NOTIFICATION_NOT_FOUND`, `SESSION_EXPIRED`), não um genérico como `NOT_FOUND`.
- Erro novo: (1) código no `ErrorCodeSchema`, (2) status e mensagem no `CATALOG`, (3) schema em `ErrorDetailsSchemas` se tiver `details`, (4) tradução em `errors.<CODE>` em **todos** os locales do web (`apps/scorely/web/src/i18n/locales/`). O TypeScript acusa o que faltar.
- Não coloque dado pessoal (email, nome, token) na mensagem de erro nem no log.
- `Error` comum fica só para bug ou falha de infra: vira 500 `INTERNAL_ERROR`.

## Idioma: back em inglês, front traduz via i18n

- **Back (api e contracts) só em inglês**: mensagens de erro, mensagens dos schemas Zod, logs e textos técnicos. Comentários podem continuar em português.
- O usuário nunca vê texto do back. O web traduz pelo `code` com `errorMessage(err)`, e os issues de validação com `issueMessage(issue, field?)` (`apps/scorely/web/src/i18n/errors.ts`). Nunca mostre `err.message` nem `issue.message`.
- i18n: `vue-i18n` (Composition mode, `legacy: false`), em `apps/scorely/web/src/i18n/`. `pt-BR` é o idioma base e define as chaves; os outros locales são tipados como `MessageSchema` e precisam ter as mesmas chaves. Nos componentes use `this.$t`; fora deles, `t` de `@/i18n`.
- Validação: `validation.<campo>.<código do Zod>`, com fallback em `validation.<código do Zod>`.
- Exceção pendente: o email com o código de login e o título e o corpo das notificações ainda são gerados em português no back.

## API: autenticação e notificações (scorely)

- Rota que exige login: quem valida o token é o **authorizer do API Gateway**, declarado na rota em `src/modules/<mod>/functions.ts` com `authorizer: { name: AUTHORIZER }` (de `src/lib/auth.ts`). No handler, coloque o método em `authHandlers({...})`: ele só lê o contexto que o authorizer deixou no evento e responde 401 se a rota estiver sem authorizer. Nunca leia o header na mão. O `userId` vem de `auth.userId`, nunca do body.
- O authorizer (`authAuthorizer`, em `provider.httpApi.authorizers` no `serverless.ts`) roda sem cache (TTL 0). Sem header ele responde 401; com token inválido ou expirado, 403 sem o corpo `{ error }`. O web (`src/lib/http.ts`) renova a sessão nos dois casos. Por isso, um 403 de regra de negócio precisa sair sempre com o corpo `{ error }` (via `appError`).
- Item que expira (códigos, sessões, convites): grave `ttl` (epoch em segundos, via `ttlFrom`) **e** um `expiresAt` que o código confere ao ler. O TTL do DynamoDB atrasa até ~48h.
- Para avisar um usuário, chame `notify(userId, { type, title, body?, link? })` do `NotificationService`. Tipo novo entra no `NotificationTypeSchema` de `@scorely/contracts`, com ícone em `notificationIcon` (`web/src/modules/notifications/notification.icons.ts`).
- Contadores (ex.: não lidas) ficam em item próprio (`PK=INBOX#<userId>`) e mudam com `ADD` na mesma transação da entidade.
