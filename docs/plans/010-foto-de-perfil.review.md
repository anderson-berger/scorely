# Revisão: docs/plans/010-foto-de-perfil.md

**Veredito:** aprovado com ressalvas

## ✅ Respeitou

- D1/D2: rotas com authorizer (`users/functions.ts`), métodos em `authHandlers` com `auth.userId`; POST assinado com `content-length-range`, `eq Content-Type` e 5 min (`lib/storage.ts`).
- D4/D5: prefixo (e `..`) → `head` → tamanho/tipo (apaga e `AVATAR_INVALID {maxBytes}`); foto antiga apagada por melhor esforço com `console.warn` sem dado pessoal (`user.service.ts`).
- DynamoDB: `update` com `null` → REMOVE, `attribute_exists(PK)`, `stripKeys`; `avatarUrl` sem lookup, sem transação.
- Erros nos 4 lugares (contracts, CATALOG, details, i18n pt-BR/en).
- Infra (ADR 0001): bucket + policy `PublicReadAvatars` só em `avatars/*`, outputs, param no compose, fallback `self:custom`, IAM com `Fn::Join` sem GetAtt.
- Web: Options API, erros por `errorMessage(err)`.

## ❌ Violou

- Nenhuma violação com evidência.

## ⚠️ Precisa de você

- ~~Caso 6 em prod: sem `s3:ListBucket`, `HeadObject` de key inexistente dá 403 → 500.~~ **Corrigido depois da revisão**: `s3:ListBucket` no ARN do bucket (`apps/scorely/api/serverless.ts`).
- ~~`S3_ENDPOINT` fora do `turbo.json` (`noUndeclaredEnvVars`).~~ **Corrigido**: `S3_ENDPOINT` e `S3_PUBLIC_ENDPOINT` em `globalPassThroughEnv` (sem isso o `serverless offline` não as receberia).
- Decisão fora do plano (web): recusa do S3 4xx → `AVATAR_INVALID`, 5xx → `AVATAR_NOT_UPLOADED` (`users.api.ts`).
- Erro sentinela no web: `ProfilePage.vue` compara `err.message === 'unreadable'` para escolher o texto.
- Contrato: `maxBytes` com `.positive()` (a mais que o plano).
- D7: output `UploadsPublicUrl` existe mas não é repassado; a api monta a URL (`publicBaseUrl`).
- Tarefa 1 (teste do S3Mock) pendente; ADR 0008 "proposta".
- Working tree mistura 008 (staged), 009 e 010 nos mesmos arquivos: separar commits.

## Testes

| Caso            | Teste                          | Observação                             |
| --------------- | ------------------------------ | -------------------------------------- |
| 1–3             | `users/user.avatar.test.ts`    | caso 3 pelo handler (422)              |
| 4–10            | `users/user.avatar.test.ts`    |                                        |
| 11              | `lib/storage.test.ts`          | só `publicBaseUrl`, não a URL assinada |
| 12              | `web/.../avatar.image.test.ts` |                                        |
| 13              | roteiro manual                 |                                        |
| 14              | `checks/uploads.test.ts`       |                                        |
| staged→alterado | `user.avatar.test.ts`          | só reformatação do biome               |

## npm run check

Verde (exit 0): api 235 testes, checks 56, typecheck ok.
