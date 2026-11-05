# 0004: item que expira tem `ttl` e `expiresAt`

- Data: 2026-11-05 (registro de uma decisão anterior)
- Estado: aceita

## Contexto

Códigos de login, sessões e convites expiram. A tabela tem TTL no atributo `ttl`.

## Decisão

Todo item que expira grava `ttl` (epoch em segundos, via `ttlFrom`) **e** `expiresAt`, e o código confere o `expiresAt` ao ler.

## Por quê

O DynamoDB apaga o item expirado com até ~48 h de atraso. Sem conferir o `expiresAt`, um código vencido continuaria valendo.

## Consequências

- O `ttl` só limpa a tabela; a validade é sempre do `expiresAt`.
- Regra: `.claude/rules/dynamodb.md`.
