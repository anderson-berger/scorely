# Módulo Auth

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Conferido com o código em 2026-11-27.

Código: `apps/scorely/api/src/modules/auth/`, `apps/scorely/api/src/lib/auth.ts`, `apps/scorely/web/src/modules/auth/`, `apps/scorely/web/src/app/guard.ts`. Contrato: `apps/scorely/contracts/src/auth.ts`.

## 1. Para que serve

Entrar no scorely **sem senha**. A pessoa digita o email, recebe um código de 6 dígitos e entra. Login e cadastro são o mesmo fluxo: o primeiro login cria a conta. A decisão de ter auth própria, sem Cognito, está no [ADR 0003](../decisions/0003-auth-propria-sem-cognito.md).

| Termo         | Significado                                                               |
| ------------- | ------------------------------------------------------------------------- |
| Código        | 6 dígitos enviados por email, que valem por 10 minutos                    |
| Sessão        | o login de um aparelho. Dura 30 dias desde a última renovação             |
| Access token  | JWT de 1 h que vai em toda chamada (`Authorization: Bearer`)              |
| Refresh token | `<sessionId>.<segredo>`. Troca por um par novo, e cada um só vale uma vez |

## 2. Regras de negócio

### Código de login

- **AUTH-01. Pedir o código** gera 6 dígitos novos e manda por email, no idioma pedido (padrão `pt-BR`).
  - Um código novo substitui o anterior: só o último vale.
  - O email vale sem espaços nas pontas e em minúsculas: `Ana@X.com ` e `ana@x.com` são o mesmo código, o mesmo limite e a mesma conta.
  - _Por quê:_ sem isso, trocar uma maiúscula daria outro limite (AUTH-02) e outra conta.
- **AUTH-02. Limites para pedir o código:**
  - 60 s de espera entre dois pedidos. Antes disso a resposta é `AUTH_CODE_COOLDOWN` (429, `details.retryInSeconds`).
  - No máximo 5 pedidos por hora por email. Passou disso, a resposta é `AUTH_CODE_LIMIT` (429).
  - A hora conta a partir do 1º pedido da janela. Passada uma hora desse pedido, a contagem recomeça do zero.
  - A janela é conferida pela hora gravada no item, nunca pela remoção do item. O TTL do DynamoDB só limpa o banco e pode atrasar até ~48 h ([ADR 0004](../decisions/0004-ttl-com-expiresat.md)).
  - Os valores de todos os limites estão na tabela de "Limites" da seção 3.
  - _Por quê:_ impede usar o scorely para mandar spam para um email e encarecer o SES.
- **AUTH-03. Conferir o código:**
  - Cada código aceita 5 tentativas.
  - A tentativa é contada **antes** da comparação, então chamadas em paralelo não ganham tentativas extras.
  - Um código expirado, errado, esgotado ou já usado responde sempre o mesmo `AUTH_CODE_INVALID` (400).
  - _Por quê:_ 5 tentativas em 10⁶ combinações tornam o chute inviável, e o erro único não dá pistas.
- **AUTH-04. O código vale uma vez.** Quando confere, ele é consumido na hora.
- **AUTH-05. O primeiro login cria a conta** (`isNewUser: true`) e manda a notificação `welcome`, com link para o perfil.
  - Se dois logins do mesmo email novo chegam juntos, só um usuário é criado.

### Sessão

- **AUTH-06. O login abre uma sessão** e devolve um access token (1 h) e um refresh token (30 dias).
  - O banco guarda só o hash do segredo, nunca o segredo.
  - Junto vêm a pessoa (perfil e email) e as preferências dela (idioma e fuso, USR-14).
- **AUTH-07. Renovar troca o refresh token por um novo** (rotação) e estende a sessão por mais 30 dias.
  - O token antigo deixa de valer.
  - A resposta também traz as preferências atuais da pessoa (USR-14): é assim que uma mudança feita em outro aparelho chega a este.
- **AUTH-08. Reusar um refresh token antigo derruba a sessão.** Isso responde `SESSION_INVALID` (401).
  - _Por quê:_ se o token antigo aparece de novo, provavelmente vazou, e encerrar a sessão protege o dono da conta.
- **AUTH-09. Sessão vencida** responde `SESSION_EXPIRED` (401).
  - A validade vem do `expiresAt`, porque o TTL do DynamoDB pode atrasar ([ADR 0004](../decisions/0004-ttl-com-expiresat.md)).
- **AUTH-10. Sair apaga a sessão** do aparelho. As outras sessões continuam.
- **AUTH-11. As rotas protegidas** passam pelo authorizer, que só confere a assinatura e a validade do JWT, sem cache.
  - Token inválido ou vencido recebe 403 do API Gateway, sem chegar na rota.
  - Logout não corta o access token já emitido: ele vale até o fim da sua hora.
- **AUTH-16. Token de uma conta que não existe mais** responde `SESSION_INVALID` (401) nas rotas da própria pessoa (`/me`, `/me/avatar`), e não `USER_NOT_FOUND` (404).
  - Acontece quando o access token ainda está na sua hora, mas a conta sumiu do banco (no dev, quando a tabela é recriada).
  - Com o 401, o web tenta renovar; a sessão também não existe mais, a renovação falha e a pessoa vai para o login (AUTH-15).
  - _Por quê:_ com o 404, o web não entendia como sessão ruim e a pessoa ficava "logada" sem conta até o token vencer.

### Navegação (web)

- **AUTH-12. Sem sessão**, qualquer rota protegida leva para o login, lembrando o destino (`?redirect=`).
- **AUTH-13. Conta com o apelido ainda igual ao código de amigo** (USR-02 em [usuarios.md](usuarios.md)) vai para o perfil (`?welcome=1`) antes de qualquer outra tela, lembrando o destino.
  - Depois de salvar o perfil, a pessoa segue para o destino.
  - _Por quê:_ as listas dos grupos mostram o apelido, e uma linha com só um código confunde.
  - _Alterada em 2026-11-14:_ antes valia para a conta sem nome.
- **AUTH-14. O destino só pode ser um caminho do próprio app** (`/...`, nunca `//...` ou URL externa). Qualquer outra coisa leva para `/`.
  - _Por quê:_ evita redirecionamento aberto a partir de um link de login.
- **AUTH-15. Um 401 que não consegue renovar** encerra a sessão no navegador e leva para o login.

## 3. Como funciona

### Dados

| Item   | Chave                        | Campos                                                                                                       |
| ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Código | `AUTH#CODE#<email>` / `META` | `email`, `codeHash`, `attempts`, `codeExpiresAt`, `sentAt`, `windowStart`, `windowCount`, `createdAt`, `ttl` |
| Sessão | `SESSION#<id>` / `META`      | `id`, `userId`, `tokenHash`, `expiresAt`, `createdAt`, `ttl`                                                 |

- Os dois são internos da api e não estão no contrato.
- Os hashes usam HMAC com o `AUTH_SECRET`, que fica no SSM.
- O `<email>` da chave já vem normalizado (AUTH-01).
- **Não são entidades:** não têm `updatedAt` nem `version`, como os lookups e os contadores ([ADR 0013](../decisions/0013-version-e-updatedat.md)). O `createdAt` fica, como em todo item. No código, ele é o instante do último pedido, igual ao `sentAt`.
  - _Por quê:_ ninguém edita esses itens nem confere a versão deles. Uma `version` que sobe a cada tentativa e a cada renovação é só ruído.
- **Código:** cada campo de tempo tem um papel diferente.
  - `codeExpiresAt` diz até quando o código vale (10 min).
  - `windowStart` e `windowCount` guardam a janela do limite por hora (AUTH-02). Por isso o item fica no banco depois de o código vencer.
  - `ttl` serve só para limpeza: vai até o fim da janela de 1 h, ou até o código vencer, o que for mais tarde.
- **Sessão:** o `expiresAt` é a validade (AUTH-09). O `ttl` é o mesmo instante e serve só para limpeza.

### Limites

| Limite                              | Valor                            | Quando passa               |
| ----------------------------------- | -------------------------------- | -------------------------- |
| Validade do código                  | 10 min                           | `AUTH_CODE_INVALID` (400)  |
| Espera entre dois pedidos de código | 60 s                             | `AUTH_CODE_COOLDOWN` (429) |
| Pedidos de código por email         | 5 por hora, desde o 1º pedido    | `AUTH_CODE_LIMIT` (429)    |
| Tentativas por código               | 5                                | `AUTH_CODE_INVALID` (400)  |
| Validade do access token            | 1 h                              | 403 do API Gateway         |
| Validade da sessão                  | 30 dias desde a última renovação | `SESSION_EXPIRED` (401)    |
| Pedidos por IP                      | nenhum                           | (ver "Limites conhecidos") |

### Rotas

| Rota                 | Quem   | Regras     |
| -------------------- | ------ | ---------- |
| `POST /auth/code`    | aberta | AUTH-01–02 |
| `POST /auth/verify`  | aberta | AUTH-03–06 |
| `POST /auth/refresh` | aberta | AUTH-07–09 |
| `POST /auth/logout`  | logado | AUTH-10    |

O AUTH-16 vale nas rotas `/me` do módulo de usuários ([usuarios.md](usuarios.md)).

Erros: `AUTH_CODE_INVALID`, `AUTH_CODE_COOLDOWN`, `AUTH_CODE_LIMIT`, `SESSION_INVALID`, `SESSION_EXPIRED` e `UNAUTHORIZED`.

Os limites estão em `AUTH_LIMITS` (`auth.service.ts`). As regras da navegação são funções puras em `web/src/app/guard.ts`.

## 4. Limites conhecidos

- O motivo da auth própria no lugar do Cognito ainda está "a confirmar" no ADR 0003.
- No dev local, o código aparece no terminal em vez de ir por email. Também fica num arquivo por destinatário na pasta temporária do sistema, para o `/screens` entrar sozinho ([ADR 0023](../decisions/0023-revisao-visual-por-prints.md)). Fora do serverless offline nada é gravado.
- **Não há limite por IP.** Os limites do AUTH-02 são por email, então quem tem uma lista de emails pode pedir um código para cada um sem trava. O caminho natural é o WAF ou o throttling do API Gateway, e nenhum dos dois muda os dados.
- **Dívida técnica: a sessão não sabe de qual aparelho é.** Ela não guarda aparelho, navegador nem último uso, então não existe tela de "meus aparelhos".
- **Dívida técnica: não há como encerrar todas as sessões de uma pessoa.** Não existe uma lista das sessões por usuário, e "sair de todos os aparelhos" e "apagar conta" não têm como achá-las. Quando um dos dois entrar, a ideia é um lookup `LOOKUP#USER#<userId>#SESSION`, `SK=<sessionId>`, gravado na transação da sessão e com o mesmo `ttl`. Ele também resolve a dívida de cima.
- O AUTH-16 só cobre conta e sessão sumindo juntas. Uma sessão viva com a conta apagada renovaria normalmente; hoje não há como apagar conta, então isso fica para quando houver.
- Nas rotas dos outros módulos, o token de uma conta que não existe mais segue a regra de cada módulo (ex.: grupo não encontrado). Na prática o web carrega o `/me` ao abrir e cai no login por ele.
