# 0009: Entidade de relação usa chave natural

- Data: 2026-11-09
- Estado: aceita

## Contexto

A participação de uma pessoa num grupo precisa de dados próprios: o papel e a data de entrada agora, e nível, função e rating na E3/E6. Pela regra geral, toda entidade é `PK=<ENTIDADE>#<uuid>`, criada por `newEntity`. Numa relação N:N, isso exigiria um lookup a mais só para garantir que cada par é único e para achar a entidade pelo par.

## Decisão

Uma entidade de **relação** (N:N, sem identidade própria além do par) usa a chave natural `PK=<ENTIDADE>#<idA>#<idB>`, `SK=META`. Ela não tem `id` nem passa por `newEntity`, mas continua com `createdAt` e `dbItem`. A primeira é a `Membership`: `MEMBERSHIP#<groupId>#<userId>` (plano 013).

## Por quê

A chave já garante um item por par (`attribute_not_exists(PK)`), e "este par existe? com quais dados?" vira um GetItem só. Com uuid, toda escrita teria um item a mais e toda consulta teria uma leitura a mais (lookup → entidade), e isso desfaria o ganho.

## Consequências

- As duas direções de busca continuam por lookups que guardam só o `id` (ADR 0002). Por exemplo, `LOOKUP#USER#<u>#GROUP` e `LOOKUP#GROUP#<g>#MEMBERSHIP`. Os dois ids estão nos lookups, então a chave da entidade se monta sem leitura extra.
- Os ids do par nunca mudam. Se um dia mudarem, a relação é apagada e recriada.
- Entidade com identidade própria, mesmo que nasça de uma relação (ex.: `Attendance`, que tem um uuid), continua com uuid.
- Regra: `.claude/rules/dynamodb.md`.
