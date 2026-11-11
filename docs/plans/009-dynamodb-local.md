# 009 — DynamoDB Local no lugar do LocalStack

Substitui o rascunho `009-localstack-licenciada` (nunca commitado, só staged), que vai ser desfeito.

## Objetivo

Tirar o LocalStack do ambiente local. Desde 03/2026 a LocalStack só sobe com conta e token, e o plano gratuito (Hobby) não cobre uso comercial. O projeto só usa o DynamoDB, então a troca é pelo **DynamoDB Local oficial da AWS** (`amazon/dynamodb-local`), que é gratuito e não pede conta nem token. Para ver as tabelas no navegador, no lugar do Resource Browser, entra o **dynamodb-admin** (`aaronshaf/dynamodb-admin`).

## Fora de escopo

- Migrar os dados do volume `localstack-data`. O `db:setup` recria as tabelas vazias.
- Testes contra o DynamoDB de verdade: os testes continuam com repositórios em memória.
- Outros serviços AWS emulados (hoje só existe o DynamoDB).
- CI (não existe).

## Decisões

- **D1. Desfazer o rascunho 009 antes:** sai do stage e volta ao estado do HEAD (compose, `.env.example`, `setup-local.ts`, README, PROJECT_CONTEXT). Os arquivos novos (`checks/localstack.test.ts`, `009-localstack-licenciada*.md`) são apagados. Os arquivos do plano 008 que estão staged ficam como estão.
- **D2. Serviço `dynamodb`:** `amazon/dynamodb-local:3.3.2`, com versão fixa e sem `latest`. Roda com `-sharedDb` para que uma base só sirva qualquer região ou credencial, e com `-dbPath` em volume `dynamodb-data` para persistir. Porta `${DYNAMODB_PORT:-8000}:8000`.
- **D3. Serviço `dynamodb-admin`:** `aaronshaf/dynamodb-admin:5.3.4`, também com versão fixa. Usa `DYNAMO_ENDPOINT=http://dynamodb:8000` e porta `${DYNAMODB_ADMIN_PORT:-8001}:8001`. Motivo: ver e editar itens no navegador, que era o que o Resource Browser dava.
- **D4. Endpoint:** `DYNAMODB_ENDPOINT` passa a ser `http://dynamodb:8000` no container `app`, e o fallback do `setup-local.ts` e do `.env.example` passa a ser `http://localhost:8000`. O nome da variável não muda, então o código das apis e o `turbo.json` também não mudam.
- **D5. Portas no `devcontainer.json`:** sai a 4566 (LocalStack) e entram a 8000 (DynamoDB Local, `silent`) e a 8001 (dynamodb-admin, `notify`). Elas também são publicadas pelo compose, para funcionar mesmo sem o encaminhamento do VS Code.
- **D6. TTL:** o `setup-local.ts` continua ligando o TTL. O DynamoDB Local não apaga itens vencidos, o que é aceitável pela ADR 0004: a validade vem do `expiresAt`. Se o DynamoDB Local recusar `UpdateTimeToLive`, o setup avisa e segue sem falhar.
- **D7. ADR `0007`:** registra a troca (contexto: licença da LocalStack em 2026; ambiente local sem conta externa).
- **D8. Comentários e regras:** o texto "LocalStack" sai dos comentários (`apps/*/api/src/lib/dynamo.ts`), de `.claude/rules/infra.md`, do README e do PROJECT_CONTEXT.

## Contrato

Nenhuma rota, schema ou erro. As interfaces que mudam são as do ambiente: o serviço `dynamodb` na porta 8000, o `dynamodb-admin` na porta 8001 e as variáveis opcionais `DYNAMODB_PORT` e `DYNAMODB_ADMIN_PORT` (que substituem a `LOCALSTACK_PORT`).

## Casos de comportamento

1. **Dado** o container recriado, **quando** o dono roda `npm run dev`, **então** o `db:setup` cria (ou encontra) `base-dev` e `scorely-dev` no DynamoDB Local e as duas apis sobem.
2. **Dado** o caso 1, **quando** o dono pede o código de login em `localhost:5174`, **então** recebe 200 e o código aparece no terminal.
3. **Dado** o caso 1, **quando** o dono abre `http://localhost:8001`, **então** vê `base-dev` e `scorely-dev` e consegue abrir os itens.
4. **Dado** que o dono reinicia os containers, **quando** abre o dynamodb-admin, **então** os dados continuam lá (volume `dynamodb-data`).
5. **Dado** que o DynamoDB Local está fora do ar, **quando** roda o `db:setup`, **então** a mensagem fala do DynamoDB Local e do endpoint, sem citar LocalStack nem token.
6. **Dado** o repo, **quando** roda `npm run check`, **então** um check garante: imagens `amazon/dynamodb-local` e `aaronshaf/dynamodb-admin` com versão fixa; nenhum serviço `localstack` no compose; `DYNAMODB_ENDPOINT` do `app` apontando para `http://dynamodb:8000`; portas 8000 e 8001 no `devcontainer.json`, sem a 4566.

Os casos 1 a 5 são de ambiente e entram no roteiro manual. O caso 6 é o check em `checks/`.

## Tarefas

1. **Desfazer o rascunho 009 (D1).** Pronto quando: `git diff HEAD` desses arquivos sai vazio e os arquivos novos do rascunho somem. Risco: tirar do stage algo do 008 por engano (conferir lista).
2. **Compose (D2, D3, D4).** Pronto quando: o check do caso 6 passa. Risco: permissão do volume no `-dbPath`, porque a imagem roda com o usuário `dynamodblocal`. Se o volume nomeado vier com dono `root`, usar `user: root` no serviço.
3. **`devcontainer.json` (D5).** Pronto quando: o check do caso 6 passa.
4. **`setup-local.ts` e `.env.example` (D4, D6).** Pronto quando: o fallback é `localhost:8000`, a mensagem de erro (caso 5) não cita LocalStack e uma falha no TTL não derruba o setup. Risco: baixo.
5. **ADR 0007 + índice; README; PROJECT_CONTEXT; `infra.md`; comentários (D7, D8).** Pronto quando: `grep -ri localstack` fora de `docs/plans/` e `docs/decisions/0007` não acha nada.
6. **Check (caso 6)** em `checks/`, escrito pelo test-writer.

## Perguntas que bloqueiam

Nenhuma. Duas para depois, que não bloqueiam:

- O volume antigo `localstack-data` fica órfão. Dá para apagar com `docker volume ls | grep localstack-data` e `docker volume rm <nome>`.
- Se você ainda tem uma conta na LocalStack, ela pode ser encerrada.

## Status

- [x] 1. Plano — aprovado
- [x] 2. Contrato — nada a fazer (sem rotas, schemas ou erros)
- [x] 3. Testes — `checks/local-env.test.ts` (caso 6); casos 1–5 no roteiro manual
- [x] 4. Implementação — `npm run check` verde; sem Docker no container, o compose não foi subido aqui
- [x] 5. Revisão — aprovado com ressalvas (`009-dynamodb-local.review.md`)
- [x] 6. Entrega — staged

Nota (2026-11-09): as portas dos serviços fora do `app` (8000, 8001, 9090) saíram do `forwardPorts`: o Docker já as publica pelo compose, e o VS Code, que só encaminha o `app`, criava entradas mortas em portas aleatórias. Os checks agora exigem o contrário.
