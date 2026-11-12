# Módulo Usuários

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Conferido com o código em 2026-11-12.

Código: `apps/scorely/api/src/modules/users/`, `apps/scorely/web/src/modules/users/`, `apps/scorely/web/src/lib/preferences.ts`. Contrato: `apps/scorely/contracts/src/users.ts`.

## 1. Para que serve

O perfil de quem usa o scorely: como a pessoa aparece nas listas dos grupos (nome, apelido, foto), em que idioma o app fala com ela e em que fuso ela lê os horários. O gênero é guardado para a divisão de times mista (E3).

Os dados da pessoa ficam em três partes, cada uma com quem pode ler:

| Parte        | O que tem                   | Quem lê                                                |
| ------------ | --------------------------- | ------------------------------------------------------ |
| Perfil       | nome, apelido, gênero, foto | a própria pessoa e os outros módulos (listas, times)   |
| Email        | o email da conta            | só o login (auth) e a própria pessoa (`GET /me`)       |
| Preferências | idioma e fuso               | a própria pessoa (e o navegador dela guarda uma cópia) |

## 2. Regras de negócio

### Conta

- **USR-01. A conta é o email.** Ela é criada no primeiro login (AUTH-05 em [auth.md](auth.md)).
  - O email é guardado em minúsculas e sem espaços, e cada email tem uma conta só.
  - O email não muda pelo perfil.
- **USR-13. O email fica fora do perfil.** Ele é guardado à parte, e só o login e a própria pessoa (`GET /me`) o leem. Quando outro módulo busca pessoas (membros, lista do jogo, times), o email nem vem junto.
  - _Por quê:_ o email é o dado mais sensível da conta. Guardado longe do perfil, um erro numa resposta de lista não tem como vazá-lo.
- **USR-02. A conta nasce sem nome.** Enquanto não houver nome, o web leva a pessoa para o perfil (AUTH-13).

### Perfil

- **USR-03. Campos que a pessoa muda** (`PATCH /me`, pelo menos um):
  - nome: de 1 a 80 caracteres;
  - apelido: de 1 a 40 caracteres, e `null` remove;
  - gênero: `M` ou `F`;
  - idioma: `pt-BR` ou `en`;
  - fuso: nome IANA.
- **USR-04. Nome mostrado:** o apelido, se houver; senão, o nome.
  - Para a própria pessoa (cabeçalho, perfil), sem nome aparece o email dela.
  - Nas listas dos grupos, sem nome aparece "Sem nome": o email de uma pessoa nunca aparece para as outras (USR-13).
  - _Por quê:_ na pelada todo mundo se conhece pelo apelido.
  - _Alterada em 2026-11-12:_ antes dizia que as listas caíam para o email, o que o código nunca fez.
- **USR-05. O fuso é validado e gravado no nome canônico.** Por exemplo, `Brazil/East` vira `America/Sao_Paulo`.
  - Um fuso inválido é recusado ao gravar.
- **USR-06. Idioma efetivo,** nesta ordem:
  1. o das preferências da pessoa;
  2. o último usado neste navegador;
  3. o primeiro idioma do navegador: `pt*` vira `pt-BR`, e qualquer outro, `en`.
- **USR-07. Fuso efetivo:** o das preferências da pessoa. Sem ele, o do navegador.
  - Todos os horários aparecem nesse fuso ([ADR 0006](../decisions/0006-datas-utc-fuso-do-perfil.md)).
  - Esse fuso também vira o padrão dos grupos que a pessoa cria (GRP-13 em [grupos.md](grupos.md)).
- **USR-14. O navegador guarda as preferências e só troca quando chegam outras.**
  - O app já abre no idioma e no fuso guardados, sem esperar o servidor.
  - As preferências vêm do servidor em três momentos: no login, ao salvar o perfil e a cada renovação da sessão (no máximo a cada 1 h, AUTH-07). Se vierem iguais às guardadas, nada muda na tela.
  - Mudou num aparelho: os outros passam a usar na próxima renovação da sessão.
  - Ao sair da conta, o navegador volta para o idioma da tela de login (USR-06, passos 2 e 3) e para o fuso dele.
  - _Por quê:_ idioma e fuso quase nunca mudam. Perguntar ao servidor a cada abertura só atrasaria a tela, e a renovação da sessão já acontece de qualquer jeito.

### Foto de perfil

- **USR-08. A foto de perfil é a mídia de finalidade `avatar`** (512×512, até 2 MB, pública: MID-02 em [midia.md](midia.md)). **Só a própria pessoa** pede o envio, confirma ou remove a foto, pelas rotas `/me/avatar`. O envio, a conferência, a troca e a remoção seguem as regras da mídia.
  - _Por quê:_ a foto aparece pequena nas listas, e as regras do arquivo são as mesmas do logo e da capa do grupo. Por isso ficam num lugar só.
- ~~**USR-09. O envio vai direto para o S3**, por um POST assinado com 5 minutos de validade.~~ Movida em 2026-11-10 para MID-04.
- ~~**USR-10. Ao confirmar, a api confere o arquivo.**~~ Movida em 2026-11-10 para MID-05; os erros `AVATAR_*` viram `MEDIA_*`.
- ~~**USR-11. Trocar ou remover a foto apaga o arquivo anterior.**~~ Movida em 2026-11-10 para MID-09 a MID-11.
- ~~**USR-12. A foto é pública.**~~ Movida em 2026-11-10 para MID-12.

## 3. Como funciona

### Dados

| Item            | Chave                                | Observação                                                                                       |
| --------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Perfil          | `USER#<id>` / `META`                 | `id`, `createdAt`, `name`, `nickname`, `gender`, `avatarUrl` e `avatarMediaId` (a mídia da foto) |
| Email           | `USER#<id>` / `EMAIL`                | `email` (USR-13). Lido só pelo auth e pelo `GET /me`                                             |
| Preferências    | `USER#<id>` / `PREFERENCES`          | `locale`, `timeZone`, `updatedAt` (USR-06, 07, 14)                                               |
| Email → usuário | `LOOKUP#USER#EMAIL#<email>` / `META` | email único (USR-01)                                                                             |

O primeiro login grava o perfil, o email, as preferências e o lookup numa transação só. O `PATCH /me` grava no perfil e nas preferências, cada campo na sua parte, também numa transação.

Os outros módulos leem pessoas pelo `UserDirectory`, que só busca o perfil (`META`).

### Rotas

| Rota                     | Quem   | Regras              |
| ------------------------ | ------ | ------------------- |
| `GET /me`                | logado | USR-13, 14          |
| `PATCH /me`              | logado | USR-03, 05, 14      |
| `POST /me/avatar/upload` | logado | USR-08 (MID-03, 04) |
| `PUT /me/avatar`         | logado | USR-08 (MID-05–09)  |
| `DELETE /me/avatar`      | logado | USR-08 (MID-10)     |

O `GET /me` e o `PATCH /me` devolvem o perfil, o email e as preferências (`preferences: { locale?, timeZone? }`).

Erros: `USER_NOT_FOUND` e `USER_CREATE_CONFLICT`. Os da foto vêm da mídia (`MEDIA_NOT_FOUND`, `MEDIA_NOT_UPLOADED` e `MEDIA_INVALID`).

## 4. Limites conhecidos

- Não é possível trocar o email nem apagar a conta.
- Preferência mudada em outro aparelho demora até 1 h para chegar (USR-14).
- O email ainda aparece em texto nas chaves do login (`LOOKUP#USER#EMAIL#<email>`, `AUTH#CODE#<email>`). Decisão de 2026-11-12: fica assim por enquanto.

## 5. Em discussão (ainda não é regra)

- **Id público (código de amigo):** cada pessoa ganha um código curto para ser convidada sem passar o email. O id do sistema deixa de aparecer para os outros: as respostas mostram só o código, e as ações sobre outra pessoa recebem o código e traduzem na entrada. Ação sobre a própria pessoa usa só o id do login. Vem na próxima etapa, com ADR.
