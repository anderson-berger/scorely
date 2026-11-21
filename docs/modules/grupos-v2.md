# Módulo Grupos (v2)

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Conferido com o código em 2026-11-21.

Código: `apps/scorely/api/src/modules/groups-v2/`, `apps/scorely/web/src/modules/groups-v2/`. Contrato: `apps/scorely/contracts/src/groups-v2.ts`.

O grupo novo, escrito do zero ao lado do antigo ([grupos.md](grupos.md)), que continua no ar até a troca ([ADR 0017](../decisions/0017-grupo-v2-lado-a-lado.md)).

## 1. Para que serve

Juntar as pessoas que jogam juntas, de qualquer atividade, do mesmo jeito. O grupo é só quem participa, o nome, o logo e a capa: a agenda das partidas e os campeonatos entram depois, cada um no seu módulo. **O grupo não tem times:** ele tem membros, e quem tem times é a partida.

Caso de referência: a Ana cria a "Pelada de sexta" e é a dona dela.

| Termo      | Significado                                                                         |
| ---------- | ----------------------------------------------------------------------------------- |
| Grupo      | um nome e as pessoas que participam dele                                            |
| Dono       | quem criou o grupo. Há um só, e ele participa do grupo                              |
| Papel      | o que a pessoa é no grupo (`myRole`). Por enquanto, só dono                         |
| Id público | o código curto do grupo (ex.: `K3X9PQ2A`), o único que vai na URL e na api (GRV-08) |
| Logo       | a imagem quadrada que identifica o grupo (512×512, GRV-09)                          |
| Capa       | a imagem larga do topo do grupo (1600×600, GRV-09)                                  |

## 2. Regras de negócio

### Criar

- **GRV-01. Criar o grupo pede só o nome** (`POST /v2/groups` `{ name }`): de 1 a 80 caracteres, sem os espaços das pontas. Vazio ou maior que 80 responde `VALIDATION_ERROR` (422). O grupo não tem esporte, horário, lugar nem fuso. Ele nasce sem logo e sem capa, que entram depois, pelas Configurações do grupo (GRV-09, 12). _(Alterada em 2026-11-20: antes, o grupo não tinha logo nem capa.)_
  - _Por quê:_ o grupo serve para qualquer atividade do mesmo jeito. O esporte vai ser só um filtro, quando houver um marketplace, e o que é do jogo (dia, hora, lugar, vagas) fica na agenda. A imagem fica fora da criação para criar continuar sendo um campo só: o envio tem dois passos (MID-04, 05) e pode falhar sem impedir o grupo de existir.
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

### Logo e capa

- **GRV-09. Só o dono troca e remove o logo e a capa do grupo.** São as mídias de finalidade `group.logo` (512×512) e `group.cover` (1600×600), as duas até 2 MB e públicas (MID-02 em [midia.md](midia.md)). O envio, a conferência, a troca e a remoção seguem as regras da mídia (MID-03 a MID-11), pelas rotas `/v2/groups/{publicId}/images/{slot}`, com `slot` = `logo` ou `cover`.
  - Quem não participa, ou um código que não existe, recebe `GROUP_NOT_FOUND` (404), como em GRV-04. Quem participa e não é o dono recebe `GROUP_NOT_OWNER` (403). Por enquanto, só o dono participa (seção 4), então esse caso ainda não acontece.
  - O dono é conferido nos dois passos, ao pedir o envio e ao confirmar (MID-01).
  - Trocar e remover não mandam a `version`: somam 1 nela e gravam o `updatedAt` ([ADR 0013](../decisions/0013-version-e-updatedat.md)), sem conferir. Confirmar de novo a mesma imagem não muda nada (MID-07).
  - _Por quê:_ o logo e a capa identificam o grupo para todos, então quem decide é quem responde por ele (GRV-02). Quando vierem os cargos, a regra muda para o cargo que puder. Sem versão, duas trocas ao mesmo tempo não dão erro: a mídia já garante que só uma vale (MID-08), e não há nada digitado na tela para perder.
- **GRV-10. Todos que veem o grupo veem o logo e a capa:** o grupo vem com `logoUrl` e `coverUrl` (cada um só quando existe) em todas as respostas (GRV-04, 05 e as rotas de imagem). A URL é montada na resposta a partir do id da mídia (MID-12) e não leva o id do sistema do grupo.

### Telas (web)

- **GRV-06. A tela `/v2/groups` lista os meus grupos** (GRV-05) em cards de capa: a capa em cima, o logo sobreposto na borda de baixo dela e o nome embaixo. Um card por linha no celular e em grade no desktop. Sem grupo, mostra só o botão "Criar grupo". _(Alterada em 2026-11-20: antes, o card tinha só o nome.)_
- **GRV-07. Criar grupo é um painel de baixo, por cima da lista,** só com o campo do nome. Ao criar, o painel fecha e a pessoa vai para a página do grupo (`/v2/groups/{publicId}`), que mostra a capa, o logo e o nome no topo. _(Alterada em 2026-11-20: antes, a página mostrava só o nome.)_
- **GRV-11. Sem logo ou sem capa, o lugar da imagem usa uma cor fixa calculada do id público do grupo,** e o logo mostra as iniciais do nome (a primeira letra da primeira e da última palavra).
  - _Por quê:_ o grupo recém-criado não tem imagem, e a tela não pode parecer quebrada. A cor do id é a mesma em todo lugar e diferencia grupos de nome parecido.
- **GRV-12. O dono troca as imagens em Configurações** (GRV-14). A linha "Logo e capa" abre um painel de baixo com a miniatura de cada uma e os botões Trocar e Remover (Remover só quando há imagem). Escolhido o arquivo, o navegador prepara a imagem (MID-03) e envia; ao confirmar, a miniatura e o topo do grupo já mostram a imagem nova. Uma imagem reprovada mostra a mensagem do `MEDIA_INVALID`. _(Alterada em 2026-11-20: antes, o botão "Logo e capa" ficava no topo da página do grupo.)_
  - _Por quê:_ trocar a imagem é configurar o grupo, coisa rara e só do dono. No topo, o botão disputava espaço com o nome e aparecia para quem só quer ver o grupo.
- **GRV-13. Dentro do grupo, as áreas ficam numa barra de navegação:** embaixo da tela no celular e numa coluna à esquerda do conteúdo no PC (a partir de 1024 px, o mesmo ponto em que o menu do app fica fixo). Cada área tem ícone e nome e a sua rota:
  - **Início** (`/v2/groups/{publicId}`): a capa, o logo e o nome em destaque (GRV-07). É a área que abre ao entrar no grupo.
  - **Configurações** (`/v2/groups/{publicId}/settings`): só para o dono (GRV-14). Para quem não é dono, a área não aparece, e a rota leva ao Início.
  - **Membros** e **Partidas** entram na barra junto com as suas etapas (seção 5), não antes.
  - Trocar de área troca a tela sem empilhar no histórico: o voltar do navegador sai do grupo, e não volta para a área anterior. Fora do Início, o topo é compacto: o logo pequeno e o nome.
  - Com uma área só para mostrar, a barra não aparece.
  - _Por quê:_ abas no topo, como no grupo antigo, ficam apertadas no celular e somem ao rolar. A barra de baixo fica no alcance do polegar e sempre à vista, o padrão dos apps no celular (até 5 áreas); no PC, a coluna usa a largura que sobra. A área sem conteúdo fica fora para a tela não prometer o que ainda não existe. Sem empilhar, o voltar faz o que se espera de uma barra de app.
- **GRV-14. Configurações é uma lista agrupada:** cada linha tem ícone, nome, o valor atual quando há (ex.: o nome do grupo) e a seta, e tocar abre o painel de baixo da configuração. Por enquanto há um grupo, **Identidade**, com a linha "Logo e capa" (GRV-12). As próximas (nome, arquivar) entram na lista quando existirem.
  - _Por quê:_ a lista cresce sem mudar a tela, e cada edição segue o padrão de painel de baixo do app.

## 3. Como funciona

### Dados (single-table, sem GSI)

| Item               | Chave                                       | Para quê                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grupo              | `GROUP2#<id>` / `META`                      | `id` (uuid, o do sistema), `publicId` (GRV-08), `name`, `logoMediaId` e `coverMediaId` (GRV-09, só quando há imagem; as URLs são montadas na resposta, MID-12), `createdAt`, `updatedAt`, `version` (ADR 0013) |
| Id público → grupo | `LOOKUP#GROUP2#PUBLIC#<publicId>` / `META`  | `{ id }`, com `attribute_not_exists` ao criar (GRV-08). Toda rota com o grupo na URL lê este lookup primeiro                                                                                                   |
| Participação       | `GROUP2#<id>` / `MEMBER#<userId>`           | `role` (`owner`), `createdAt` (a data de entrada). Os participantes são uma Query `begins_with(SK, "MEMBER#")`                                                                                                 |
| Grupos da pessoa   | `LOOKUP#USER#<userId>#GROUP2` / `<groupId>` | "meus grupos": Query → BatchGet do `META` e da `MEMBER#<userId>` de cada grupo                                                                                                                                 |

Criar grava os quatro itens na mesma transação. Um código público que já existe (chance desprezível) faz o service gerar outro e tentar de novo. A api traduz o público para o uuid na entrada do service; as chaves só conhecem o uuid. A mídia do logo e da capa é do grupo pelo uuid (`ownerType = group`, `ownerId = <id>`), que fica só no banco: o endereço público é só a finalidade e o id da mídia (MID-12). O prefixo `GROUP2` é provisório: na troca, o módulo antigo sai e o novo passa a usar `GROUP` (sem dados em produção, a tabela é recriada, ADR 0017).

### Rotas

| Rota                                              | Quem           | Regras                  |
| ------------------------------------------------- | -------------- | ----------------------- |
| `POST /v2/groups`                                 | logado         | GRV-01, 02, 03, 08      |
| `GET /v2/groups/{publicId}`                       | quem participa | GRV-04, 08              |
| `GET /v2/me/groups`                               | logado         | GRV-05                  |
| `POST /v2/groups/{publicId}/images/{slot}/upload` | dono           | GRV-09 (MID-03, 04)     |
| `PUT /v2/groups/{publicId}/images/{slot}`         | dono           | GRV-09, 10 (MID-05–09)  |
| `DELETE /v2/groups/{publicId}/images/{slot}`      | dono           | GRV-09, 10 (MID-10, 11) |

Erros: `VALIDATION_ERROR`, `GROUP_NOT_FOUND`, `GROUP_NOT_OWNER` (403). Os do logo e da capa vêm da mídia (`MEDIA_NOT_FOUND`, `MEDIA_NOT_UPLOADED`, `MEDIA_INVALID`).

## 4. Limites conhecidos

- Não há limite de grupos por pessoa.
- Por enquanto, ninguém além do dono entra no grupo: os membros e o gerenciamento deles são a próxima etapa.
- O grupo não muda de nome, não é arquivado nem apagado. Por isso, as mídias de um grupo nunca ficam sem dono.
- A cor sem imagem (GRV-11) vem do id público: se um dia o código mudar (GRV-08), a cor muda junto.

## 5. Em discussão (ainda não é regra)

- **Próximas etapas, nesta ordem:** membros (entrar e gerenciar) → agenda (partidas recorrentes e avulsas, `GROUP2#<id>/AGENDA#...`, com os times de cada partida) → campeonatos.
- **Esporte:** só como filtro do marketplace, fora do grupo.
