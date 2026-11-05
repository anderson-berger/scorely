# 0001: infra separada da api (Serverless Compose)

- Data: 2026-11-05 (registro de uma decisão anterior)
- Estado: aceita

## Contexto

Cada projeto tem recursos com estado (hoje, a tabela DynamoDB) e uma api de lambdas, ambos com deploy pelo Serverless Framework.

## Decisão

Recursos ficam no stack `<projeto>-infra` (`infra/<projeto>`), expostos como Outputs. O `serverless-compose.ts` repassa os Outputs para a api como `params`. A api só tem lambdas, IAM e config, e lê os valores com fallback para o dev local.

## Por quê

**Motivo: a confirmar.** Inferido do código: `serverless remove` da api não apaga dados (a tabela ainda tem `DeletionPolicy: Retain`), e o deploy da api não mexe em recurso com estado.

## Consequências

- Deploy só pela raiz (o compose resolve os params); o dev local roda fora do compose e usa o fallback.
- IAM monta o ARN com `Fn::Join`; `Fn::GetAtt` de outro stack não funciona.
- Regra: `.claude/rules/infra.md`. Checks: `checks/infra.test.ts`.
