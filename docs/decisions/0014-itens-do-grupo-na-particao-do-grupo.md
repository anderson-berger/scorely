# 0014: O que é de uma entidade mora na partição dela

- Data: 2026-11-15
- Estado: aceita

## Contexto

O grupo estava espalhado por partições próprias: a participação em `MEMBERSHIP#<g>#<u>`, a competição em `COMPETITION#<g>` e a configuração de times em `TEAM_SETTINGS#<g>`. Os 3 tokens dos links ficavam no `META`, que todo módulo lê. Listar os membros custava uma Query num lookup e depois um BatchGet nas participações, e cada entrada gravava um lookup a mais.

## Decisão

Um item que pertence a uma entidade, e só existe por causa dela, fica na partição dela: `PK=<ENTIDADE>#<id>`, com um `SK` que diz o que ele é. Isso já valia para o usuário (`PRIVATE`, `PREFERENCES`). No grupo, ficam assim:

- `GROUP#<g>/META`;
- `GROUP#<g>/INVITES`, com os tokens;
- `GROUP#<g>/COUNTERS`;
- `GROUP#<g>/MEMBER#<u>`, a participação;
- `GROUP#<g>/COMPETITION`;
- `GROUP#<g>/TEAM_SETTINGS`.

A entidade de relação continua com chave natural ([0009](0009-entidade-de-relacao-chave-natural.md)): agora o par aparece em `PK` e `SK`, e não mais só no `PK`.

## Por quê

- **Menos leitura.** "Os membros do grupo" vira uma Query só, e não uma Query mais um BatchGet. A tela do grupo pode trazer a partição inteira numa chamada.
- **Menos item.** Cada entrada grava um item a menos, porque o lookup de membros some, e há menos coisa para manter em sincronia.
- **Menos dado lido sem precisar.** Um segredo, como os tokens, sai do item que todo mundo lê. Ler o `META` continua sendo um GetItem, então a partição maior não deixa a leitura comum mais cara.

## Consequências

- Quando a direção da busca é "os X da entidade", a busca é uma Query na partição dela, sem lookup. As outras direções continuam com lookup, que guarda só o `id` ([0002](0002-single-table-sem-gsi.md)). Exemplo: "meus grupos" continua num lookup, hoje `LOOKUP#USER#GROUPS#<u>` (o padrão das chaves de lookup mudou em 2026-11-26; antes, `LOOKUP#USER#<u>#GROUP`).
- O limite de 10 GB por partição não preocupa: um grupo tem no máximo 100 participantes (GRV-54; nota de 2026-11-26: antes, o argumento era o das 61 participações da GRP-38, que saiu com o grupo antigo).
- Nunca leia a partição inteira só para pegar o `META`: o `META` é sempre um GetItem.
- Item com vida própria, que é buscado sem a entidade dona, continua na sua partição (ex.: `GAME#<id>`).
- Regra: `.claude/rules/dynamodb.md`.
