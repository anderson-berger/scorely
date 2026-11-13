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
| 0007 | [Dev local com DynamoDB Local, sem LocalStack](0007-dynamodb-local-sem-localstack.md)                                   | aceita                     |
| 0008 | [S3 no dev local com Adobe S3Mock](0008-s3-local-s3mock.md)                                                             | aceita                     |
| 0009 | [Entidade de relação usa chave natural](0009-entidade-de-relacao-chave-natural.md)                                      | aceita                     |
| 0010 | [Documentação viva por módulo no lugar de planos](0010-documentacao-viva-por-modulo.md)                                 | aceita                     |
| 0011 | [Id público do usuário, separado do id do sistema](0011-id-publico-do-usuario.md)                                       | aceita                     |
