# 0013: Toda entidade tem `updatedAt` e `version`

- Data: 2026-11-14
- Estado: aceita

## Contexto

Só algumas entidades guardam `updatedAt` (temporada, times, preferências), e nenhuma guarda um número de versão. Trava otimista (dois editores no mesmo grupo), sincronização com o navegador e um log de eventos ou auditoria estão no horizonte, sem nada decidido. Ainda não há dados em produção: o formato muda hoje sem migração.

## Decisão

Toda entidade (inclusive a de relação e o item extra na partição de outra, como `USER#<id> / PRIVATE`) nasce com `updatedAt = createdAt` e `version = 1`. Toda alteração grava `updatedAt` com o instante dela e soma 1 na `version` (`ADD version :one`), no mesmo `Update` ou `Put`. Lookups e contadores ficam de fora: não são entidades. A `version` e o `updatedAt` saem nas respostas que espalham o item do banco, mas ainda não estão nos contratos, e nenhuma condição usa a `version`.

## Por quê

A `version` é o número da alteração da entidade. Quando vier a trava otimista, a condição é `version = :lida`. Se vier um log de eventos, ela é a ordem dos eventos da entidade e o cursor da sincronização. Gravada desde o começo, qualquer um desses caminhos começa sem reescrever o banco.

## Consequências

- Todo `Put` passa pelo `dbItem`, que já põe `createdAt` e passa a pôr `updatedAt` e `version: 1`. Todo `Update` de entidade usa o helper de alteração do `db.ts`. Regra em `.claude/rules/dynamodb.md`.
- Escrita que substitui o item inteiro (`Put` de times, configuração de times) precisa ler a `version` atual ou virar `Update`, para não voltar a 1.
- Upsert (`Update` que pode criar o item) usa `if_not_exists` para o `createdAt` e soma a `version` a partir de 0.
- O `updatedAt` e a `version` saem nas respostas que espalham o item do banco, mesmo fora do contrato (decisão do dono em 2026-11-14). O `stripKeys` não os remove. No `/me`, que junta perfil, parte privada e preferências, os dois são os do perfil (`META`): mudar só o nome ou as preferências não muda essa `version`. Antes de uma trava otimista usar o número, isso precisa ser revisto.
- CQRS, DynamoDB Streams e tabela de eventos continuam em aberto (revisão de desempenho e custo).
