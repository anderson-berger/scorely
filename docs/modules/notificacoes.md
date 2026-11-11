# Módulo Notificações

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Conferido com o código em 2026-11-10.

Código: `apps/scorely/api/src/modules/notifications/`, `apps/scorely/web/src/modules/notifications/`. Contrato: `apps/scorely/contracts/src/notifications.ts`.

## 1. Para que serve

Avisar a pessoa, dentro do app, do que aconteceu sem ela estar olhando: entrou na lista, o jogo foi cancelado. Hoje os avisos aparecem só no sino do cabeçalho. Não há email nem push.

## 2. Regras de negócio

- **NTF-01. Os outros módulos avisam por `notify(userId, { type, title, body?, link? })`.** Nenhum outro módulo grava notificação direto no banco.
- **NTF-02. Tipos que existem hoje:**

  | Tipo                | Quem dispara                                            | Link          |
  | ------------------- | ------------------------------------------------------- | ------------- |
  | `welcome`           | primeiro login (AUTH-05)                                | `/profile`    |
  | `waitlist_promoted` | saiu alguém de dentro e a pessoa subiu da fila (GRP-22) | grupo ou jogo |
  | `game_cancelled`    | o dono cancelou o jogo (GRP-24)                         | grupo         |
  | `game_reopened`     | o dono reabriu o jogo cancelado (GRP-44)                | grupo         |
  | `member_invite`     | o dono convidou a reserva para virar membro (GRP-40)    | grupo         |
  - Um tipo novo entra no contrato e ganha um ícone no web (`notification.icons.ts`).

- **NTF-03. O título e o corpo são gravados em pt-BR** já no momento do aviso. O web mostra o texto como está.
  - _Por quê:_ é a exceção já registrada às mensagens do back em inglês, e o público hoje é brasileiro. Notificações em vários idiomas ficam para depois.
- **NTF-04. Cada pessoa só vê, marca e apaga as próprias notificações.** A de outra pessoa responde `NOTIFICATION_NOT_FOUND` (404), como se não existisse.
- **NTF-05. A lista vem da mais nova para a mais antiga,** em páginas de 20 (`nextCursor`), sempre com o total de não lidas.
- **NTF-06. Marcar como lida não falha se já estava lida.**
  - "Marcar todas" olha só as 100 mais recentes. As mais antigas continuam contando até serem abertas.
  - _Por quê:_ mantém a operação barata, e ninguém tem 100 avisos não lidos na prática.
- **NTF-07. Clicar numa notificação** marca como lida e abre o `link`, se houver.
- **NTF-08. Apagar uma notificação** também desconta das não lidas, se ela não estava lida.
- **NTF-09. O sino consulta as notificações ao entrar logado e depois a cada 5 min,** só com a aba visível.
  - "Entrar logado" é o login e também abrir o app com a sessão ainda válida.
  - Aba escondida: a contagem para. Nenhuma consulta é feita enquanto ela está escondida.
  - Ao voltar para a aba, consulta na hora se a última consulta tem 5 min ou mais. Se for mais recente, só retoma a contagem pelo tempo que faltava. Assim, trocar de aba várias vezes não gera consultas a mais.
  - Os 5 min contam a partir da última consulta, venha ela de onde vier.
  - Nunca há duas consultas ao mesmo tempo. Se chega um pedido de consulta (contagem ou volta à aba) com uma em andamento, ele é ignorado, e nada fica na fila.
  - _Por quê:_ ainda não há push. 5 min basta para avisos de lista e cancelamento, e o sino não gasta chamadas com a aba escondida nem com troca de abas.

## 3. Como funciona

### Dados

| Item                   | Chave                                                     | Observação                                      |
| ---------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| Notificação            | `NOTIFICATION#<id>` / `META`                              | `userId`, `type`, textos, `link` e `readAt`     |
| Notificações da pessoa | `LOOKUP#USER#NOTIFICATIONS#<userId>` / `<createdAt>#<id>` | ordem da lista (NTF-05)                         |
| Contador de não lidas  | `INBOX#<userId>` / `META`                                 | `unread`, que muda com `ADD` na mesma transação |

### Rotas

| Rota                            | Quem   | Regras     |
| ------------------------------- | ------ | ---------- |
| `GET /notifications`            | logado | NTF-04, 05 |
| `POST /notifications/{id}/read` | logado | NTF-04, 06 |
| `POST /notifications/read-all`  | logado | NTF-06     |
| `DELETE /notifications/{id}`    | logado | NTF-04, 08 |

Erro: `NOTIFICATION_NOT_FOUND`.

## 4. Limites conhecidos

- Não há página de notificações (só o sino), nem email ou push ([PRODUCT.md](../product/PRODUCT.md), "Depois").
- Os textos são só em pt-BR (NTF-03).
- Um aviso novo pode levar até 5 min para aparecer no sino com a aba aberta (NTF-09).
