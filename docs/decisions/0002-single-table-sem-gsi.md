# 0002: DynamoDB single-table, sem GSI

- Data: 2026-11-05 (registro de uma decisão anterior)
- Estado: aceita

## Contexto

Cada projeto precisa buscar entidades por campos que não são o id (ex.: user por email, items por data).

## Decisão

Uma tabela por projeto (`<projeto>-<stage>`), só com `PK`/`SK`, sem GSI nem LSI. Buscas por outro campo usam lookups: itens ponteiro que guardam só o `id`, gravados na mesma transação da entidade.

## Por quê

**Motivo: a confirmar.**

## Consequências

- Toda escrita de entidade com lookup é uma `TransactWriteItems`; toda leitura por campo é em duas etapas.
- Unicidade sai de graça (`attribute_not_exists(PK)` no lookup).
- Regra: `.claude/rules/dynamodb.md`. Check: `checks/dynamodb.test.ts` (sem GSI/LSI).
