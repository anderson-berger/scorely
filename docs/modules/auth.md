# Módulo Auth

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Conferido com o código em 2026-11-12.

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
- **AUTH-02. Limites para pedir o código:**
  - 60 s de espera entre dois pedidos. Antes disso a resposta é `AUTH_CODE_COOLDOWN` (429, `details.retryInSeconds`).
  - No máximo 5 pedidos por hora por email. Passou disso, a resposta é `AUTH_CODE_LIMIT` (429).
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

### Navegação (web)

- **AUTH-12. Sem sessão**, qualquer rota protegida leva para o login, lembrando o destino (`?redirect=`).
- **AUTH-13. Conta sem nome** vai para o perfil (`?welcome=1`) antes de qualquer outra tela, lembrando o destino.
  - Depois de salvar o perfil, a pessoa segue para o destino.
  - _Por quê:_ as listas dos grupos mostram nomes, e uma linha com só o email confunde.
- **AUTH-14. O destino só pode ser um caminho do próprio app** (`/...`, nunca `//...` ou URL externa). Qualquer outra coisa leva para `/`.
  - _Por quê:_ evita redirecionamento aberto a partir de um link de login.
- **AUTH-15. Um 401 que não consegue renovar** encerra a sessão no navegador e leva para o login.

## 3. Como funciona

### Dados

| Item   | Chave                        | Observação                                                                     |
| ------ | ---------------------------- | ------------------------------------------------------------------------------ |
| Código | `AUTH#CODE#<email>` / `META` | hash do código, tentativas, janela do limite. `ttl` até o fim da janela de 1 h |
| Sessão | `SESSION#<id>` / `META`      | `userId`, hash do segredo, `expiresAt` e `ttl`                                 |

Os dois são internos da api e não estão no contrato. Os hashes usam HMAC com o `AUTH_SECRET`, que fica no SSM.

### Rotas

| Rota                 | Quem   | Regras     |
| -------------------- | ------ | ---------- |
| `POST /auth/code`    | aberta | AUTH-01–02 |
| `POST /auth/verify`  | aberta | AUTH-03–06 |
| `POST /auth/refresh` | aberta | AUTH-07–09 |
| `POST /auth/logout`  | logado | AUTH-10    |

Erros: `AUTH_CODE_INVALID`, `AUTH_CODE_COOLDOWN`, `AUTH_CODE_LIMIT`, `SESSION_INVALID`, `SESSION_EXPIRED` e `UNAUTHORIZED`.

Os limites estão em `AUTH_LIMITS` (`auth.service.ts`). As regras da navegação são funções puras em `web/src/app/guard.ts`.

## 4. Limites conhecidos

- O motivo da auth própria no lugar do Cognito ainda está "a confirmar" no ADR 0003.
- No dev local, o código aparece no terminal em vez de ir por email.
