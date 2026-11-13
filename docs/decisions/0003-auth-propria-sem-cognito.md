# 0003: auth própria por código, sem Cognito

- Data: 2026-11-05 (registro de uma decisão anterior)
- Estado: aceita

## Contexto

O scorely precisa de login sem senha.

## Decisão

Login por código de 6 dígitos enviado por email, JWT HS256 (1 h) + refresh token rotacionado (30 dias), validação por um Lambda authorizer do HTTP API sem cache. Segredo no SSM.

## Por quê

**Motivo: a confirmar.**

## Consequências

- Os limites (reenvio, tentativas, validade) e a rotação do refresh são código nosso, com testes.
- Rota protegida declara o authorizer no `functions.ts` e responde por `authRoute`.
- Regra: `.claude/rules/scorely-api.md`. Check: `checks/api.test.ts`.
