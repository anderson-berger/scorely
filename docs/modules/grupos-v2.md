# Módulo Grupos (v2)

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Conferido com o código em 2026-11-20.

Código: `apps/scorely/api/src/modules/groups-v2/`, `apps/scorely/web/src/modules/groups-v2/`. Contrato: `apps/scorely/contracts/src/groups-v2.ts`.

O grupo novo, escrito do zero ao lado do antigo ([grupos.md](grupos.md)), que continua no ar até a troca ([ADR 0017](../decisions/0017-grupo-v2-lado-a-lado.md)).

## 1. Para que serve

Juntar as pessoas que jogam juntas, de qualquer atividade, do mesmo jeito. O grupo é só quem participa e o nome: a agenda dos jogos, os times e os campeonatos entram depois, cada um no seu módulo.

Caso de referência: a Ana cria a "Pelada de sexta" e é a dona dela.

| Termo      | Significado                                                                         |
| ---------- | ----------------------------------------------------------------------------------- |
| Grupo      | um nome e as pessoas que participam dele                                            |
| Dono       | quem criou o grupo. Há um só, e ele participa do grupo                              |
| Papel      | o que a pessoa é no grupo (`myRole`). Por enquanto, só dono                         |
| Id público | o código curto do grupo (ex.: `K3X9PQ2A`), o único que vai na URL e na api (GRV-08) |

## 2. Regras de negócio

### Criar

- **GRV-01. Criar o grupo pede só o nome** (`POST /v2/groups` `{ name }`): de 1 a 80 caracteres, sem os espaços das pontas. Vazio ou maior que 80 responde `VALIDATION_ERROR` (422). O grupo não tem esporte, horário, lugar, fuso, logo nem capa.
  - _Por quê:_ o grupo serve para qualquer atividade do mesmo jeito. O esporte vai ser só um filtro, quando houver um marketplace, e o que é do jogo (dia, hora, lugar, vagas) fica na agenda.
- **GRV-02. Quem cria é o dono e participa do grupo.** O grupo nasce com uma participação só, a de quem criou, com o papel `owner`.
  - _Por quê:_ alguém responde pelo grupo desde o primeiro instante, e é a partir da participação que vêm os membros e o gerenciamento deles.
- **GRV-03. O nome pode repetir,** inclusive entre os grupos da mesma pessoa. Quem identifica o grupo é o `id`.
  - _Por quê:_ "Pelada de sexta" é comum, e barrar o nome repetido não protege nada.

### Identificação

- **GRV-08. O grupo tem um id público curto, e é o único que sai do sistema.** São 8 caracteres em Crockford base32 (ex.: `K3X9PQ2A`), gerados ao criar, únicos. A URL (`/v2/groups/K3X9PQ2A`), as rotas e as respostas usam só ele (o `id` do grupo na resposta é o público). O id do sistema (uuid) fica no banco: é a chave do grupo e de tudo o que é dele.
  - O id público não é convite: saber o código não dá acesso ao grupo (GRV-04). O convite, quando vier, tem um token próprio, que dá para trocar.
  - _Por quê:_ a URL fica curta e fácil de compartilhar. Como as chaves do banco não dependem do código, ele pode mudar depois (por exemplo, um endereço escolhido no marketplace) trocando só o lookup, como o id público do usuário ([ADR 0011](../decisions/0011-id-publico-do-usuario.md)). Separar o convite evita que um print da URL deixe alguém entrar, e que trocar o convite quebre os links salvos.

### Ver

- **GRV-04. Só quem participa vê o grupo** (`GET /v2/groups/{publicId}`). Para quem não participa, ou para um código que não existe, a resposta é `GROUP_NOT_FOUND` (404). O grupo vem com o papel de quem pede (`myRole`).
  - _Por quê:_ quem não participa não fica sabendo que o grupo existe.
- **GRV-05. Meus grupos** (`GET /v2/me/groups`): os grupos de que a pessoa participa, em ordem de nome (sem diferenciar maiúsculas e acentos), cada um com o `myRole`. Sem nenhum grupo, a lista vem vazia.
  - _Por quê:_ sem a agenda, não há "próximo jogo" para ordenar. Pelo nome, o grupo é fácil de achar.

### Telas (web)

- **GRV-06. A tela `/v2/groups` lista os meus grupos** (GRV-05), um card por grupo com o nome. Sem grupo, mostra só o botão "Criar grupo".
- **GRV-07. Criar grupo é um painel de baixo, por cima da lista,** só com o campo do nome. Ao criar, o painel fecha e a pessoa vai para a página do grupo (`/v2/groups/{publicId}`), que mostra o nome.

## 3. Como funciona

### Dados (single-table, sem GSI)

| Item               | Chave                                       | Para quê                                                                                                       |
| ------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Grupo              | `GROUP2#<id>` / `META`                      | `id` (uuid, o do sistema), `publicId` (GRV-08), `name`, `createdAt`, `updatedAt`, `version` (ADR 0013)         |
| Id público → grupo | `LOOKUP#GROUP2#PUBLIC#<publicId>` / `META`  | `{ id }`, com `attribute_not_exists` ao criar (GRV-08). Toda rota com o grupo na URL lê este lookup primeiro   |
| Participação       | `GROUP2#<id>` / `MEMBER#<userId>`           | `role` (`owner`), `createdAt` (a data de entrada). Os participantes são uma Query `begins_with(SK, "MEMBER#")` |
| Grupos da pessoa   | `LOOKUP#USER#<userId>#GROUP2` / `<groupId>` | "meus grupos": Query → BatchGet do `META` e da `MEMBER#<userId>` de cada grupo                                 |

Criar grava os quatro itens na mesma transação. Um código público que já existe (chance desprezível) faz o service gerar outro e tentar de novo. A api traduz o público para o uuid na entrada do service; as chaves só conhecem o uuid. O prefixo `GROUP2` é provisório: na troca, o módulo antigo sai e o novo passa a usar `GROUP` (sem dados em produção, a tabela é recriada, ADR 0017).

### Rotas

| Rota                        | Quem           | Regras             |
| --------------------------- | -------------- | ------------------ |
| `POST /v2/groups`           | logado         | GRV-01, 02, 03, 08 |
| `GET /v2/groups/{publicId}` | quem participa | GRV-04, 08         |
| `GET /v2/me/groups`         | logado         | GRV-05             |

Erros: `VALIDATION_ERROR`, `GROUP_NOT_FOUND`.

## 4. Limites conhecidos

- Não há limite de grupos por pessoa.
- Por enquanto, ninguém além do dono entra no grupo: os membros e o gerenciamento deles são a próxima etapa.
- O grupo não muda de nome, não é arquivado nem apagado.

## 5. Em discussão (ainda não é regra)

- **Próximas etapas, nesta ordem:** membros (entrar e gerenciar) → agenda (jogos recorrentes e avulsos, `GROUP2#<id>/AGENDA#...`) → separação de times → campeonatos.
- **Esporte:** só como filtro do marketplace, fora do grupo.
