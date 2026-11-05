# Decisões (ADRs)

Uma linha por decisão. Abra só a que importa. Nova decisão: copie [`_template.md`](_template.md) para `NNNN-slug.md` (próximo número) e acrescente a linha aqui. Motivo desconhecido fica como **motivo: a confirmar**, nunca inventado.

| #    | Decisão                                                                                                                 | Estado                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 0001 | [Infra separada da api (Serverless Compose)](0001-infra-separada-da-api.md)                                             | aceita; motivo a confirmar |
| 0002 | [DynamoDB single-table, sem GSI](0002-single-table-sem-gsi.md)                                                          | aceita; motivo a confirmar |
| 0003 | [Auth própria por código, sem Cognito](0003-auth-propria-sem-cognito.md)                                                | aceita; motivo a confirmar |
| 0004 | [Item que expira tem `ttl` e `expiresAt`](0004-ttl-com-expiresat.md)                                                    | aceita                     |
| 0005 | [Contratos em pacote (`@scorely/contracts`)](0005-contratos-em-pacote.md)                                               | aceita                     |
| 0006 | [Datas em UTC; exibição no fuso do perfil; recorrência em hora local + fuso do grupo](0006-datas-utc-fuso-do-perfil.md) | aceita                     |
