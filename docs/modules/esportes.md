# Módulo Esportes

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Conferido com o código em 2026-11-15.

Código: `apps/scorely/api/src/modules/sports/`, `apps/scorely/web/src/modules/sports/`. Contrato: `apps/scorely/contracts/src/sports.ts`.

## 1. Para que serve

O catálogo dos esportes que o scorely conhece, cadastrado pela equipe do scorely e não pelos grupos. Cada esporte tem o nome em cada idioma e as posições. O grupo escolhe o seu esporte desse catálogo ([grupos.md](grupos.md)), e os times usam as posições do esporte ([times.md](times.md)). Decisão: [ADR 0015](../decisions/0015-modelo-do-grupo-e-do-jogo.md).

| Termo    | Significado                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------- |
| Esporte  | um item do catálogo, como vôlei ou futevôlei. Identificado por um id legível (`volleyball`)     |
| Posição  | onde a pessoa joga naquele esporte (ex.: levantador no vôlei). Um esporte pode não ter posições |
| Ativo    | o esporte aparece para escolher. Desativado, continua valendo para quem já o usa                |
| Catálogo | a lista de todos os esportes, ativos e desativados                                              |

## 2. Regras de negócio

### Catálogo

- **ESP-01. Só a equipe do scorely cadastra esportes.** O catálogo é um arquivo versionado no repositório e é aplicado no banco por um comando do deploy (`npm run sports:sync`). Não há rota para criar, mudar ou apagar esporte.
  - _Por quê:_ esporte tem regra (as posições, e depois os limites e a pontuação). Quem decide é a equipe, com revisão no repositório, sem um painel de admin para construir agora.
- **ESP-02. O id do esporte é legível e nunca muda** (`volleyball`, `beach_volleyball`, `soccer`): de 2 a 40 caracteres, minúsculas, números e `_`. O mesmo vale para o id de cada posição, que é único dentro do esporte (`setter`).
  - _Por quê:_ o id aparece na URL do filtro, nos itens dos grupos e nos logs. Mudar o id quebraria tudo isso.
- **ESP-03. Todo esporte tem nome em todos os idiomas do web** (`pt-BR` e `en`), e cada posição também. O comando do deploy recusa o arquivo se faltar algum.
  - _Por quê:_ o catálogo vem do banco, então o web não tem tradução própria para um esporte novo.
- **ESP-04. Não existe o esporte "outro".** Todo esporte que um grupo joga está no catálogo.
- **ESP-05. Esporte não é apagado, é desativado.** O desativado:
  - some da escolha ao criar o grupo;
  - continua valendo, com o nome e as posições, para os grupos que já o têm.

  O comando do deploy nunca apaga: um esporte que sai do arquivo vira desativado. O mesmo vale para as posições.
  - _Por quê:_ apagar deixaria grupos, posições e regras de times apontando para nada.
- **ESP-06. A ordem do catálogo é a do arquivo,** e a ordem das posições também. É a ordem em que o web mostra.

### Leitura

- **ESP-07. Qualquer pessoa vê o catálogo** (`GET /sports`), sem login: todos os esportes, os desativados com `active: false`.
  - A resposta tem cache de 1 hora.
  - A api guarda o catálogo na memória por até 5 minutos e não lê o banco a cada pedido. Um `sports:sync` aparece em até 5 minutos.
  - _Por quê:_ o catálogo muda raramente e aparece em quase toda tela. Lê-lo do banco a cada vez seria custo sem ganho.
- **ESP-08. O web baixa o catálogo uma vez por sessão** e mostra o nome no idioma da pessoa, caindo no `pt-BR` se faltar.

## 3. Como funciona

### Dados (single-table, sem GSI, ver [`dynamodb.md`](../../.claude/rules/dynamodb.md))

| Item     | Chave                        | Para quê                                                                                                                                     |
| -------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Esporte  | `SPORT#<sportId>` / `META`   | `id`, `name` (por idioma), `positions` (`[{ id, name, active }]`, na ordem), `active`, `order`. Entidade: `version` e `updatedAt` (ADR 0013) |
| Catálogo | `LOOKUP#SPORT` / `<sportId>` | a lista de todos os esportes (Query → BatchGet)                                                                                              |

Os grupos de um esporte (`LOOKUP#SPORT#<sportId>#GROUP`) estão em [grupos.md](grupos.md).

### Rotas

| Rota          | Quem    | Regras         |
| ------------- | ------- | -------------- |
| `GET /sports` | público | ESP-05, 06, 07 |

Erros: nenhum próprio. O esporte desconhecido ou desativado num pedido de grupo é erro do grupo (`SPORT_NOT_FOUND`, ver [grupos.md](grupos.md)).

## 4. Limites conhecidos

- Esporte novo precisa de deploy (ESP-01).
- Os limites por esporte (ex.: vagas do vôlei) ainda não existem. Eles entram com o jogo como módulo, que é quem tem um esporte só ([ADR 0015](../decisions/0015-modelo-do-grupo-e-do-jogo.md)).

## 5. Em discussão (ainda não é regra)

- Painel de admin da plataforma para cadastrar sem deploy.
- Limites por esporte (vagas, tamanho dos times) e, depois, como cada esporte pontua.
