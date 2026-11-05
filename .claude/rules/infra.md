---
paths:
  - "infra/**"
  - "serverless-compose.ts"
  - "apps/*/api/serverless.ts"
  - "apps/*/api/project.ts"
---

# Infra separada da api (Serverless Compose)

Motivo: [docs/decisions/0001-infra-separada-da-api.md](../../docs/decisions/0001-infra-separada-da-api.md).

- **Nunca declare recursos (tabela, bucket, fila...) no `serverless.ts` de uma api.** A api só tem lambdas, IAM e config. Check: `checks/infra.test.ts`.
- `infra/shared/`: definição da tabela (`single-table.ts`, fonte única), stack de infra (`infra-service.ts`) e `setup-local.ts` (LocalStack).
- `infra/<projeto>/serverless.ts`: stack `<projeto>-infra`. Cria o recurso e o expõe em `resources.Outputs`.
- `serverless-compose.ts` (raiz): repassa os outputs para a api em `params` (`'${service:<projeto>-infra.<Output>}'`).
- Na api, leia sempre com fallback para o dev local: `'${param:x, self:custom.localX}'`. O dev local roda fora do compose, e ali o `${param:...}` não existe. Check: `checks/infra.test.ts`.
- O IAM da api referencia o recurso pelo nome ou ARN montado (`Fn::Join` com `AWS::Region`/`AWS::AccountId`). Nunca `Fn::GetAtt` de um recurso de outro stack. Check: `checks/infra.test.ts`.
- Recurso novo: crie em `infra-service.ts` (ou no `infra/<projeto>`), adicione um Output, passe o valor no compose e leia por param na api. Se ele também precisar existir no dev local, crie-o no `setup-local.ts`.
- Deploy só pela raiz (`npx serverless deploy ...`), nunca de dentro de `apps/<projeto>/api`. O deploy pede confirmação (`ask` em `.claude/settings.json`).
- Variáveis do Serverless (`${sls:stage}`, `${env:...}`) são strings normais, nunca template literal.
