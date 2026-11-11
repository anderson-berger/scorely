# 0008: S3 no dev local com Adobe S3Mock

- Data: 2026-11-09
- Estado: aceita (teste da tarefa 1 do plano 010 em 2026-11-09)

## Contexto

A foto de perfil (plano 010) é enviada pelo navegador direto ao S3 com um POST assinado. No dev local não há LocalStack ([0007](0007-dynamodb-local-sem-localstack.md)), e a edição community do MinIO foi arquivada em 2026. É preciso um S3 local sem conta nem token.

## Decisão

O devcontainer usa o Adobe S3Mock (`adobe/s3mock`, versão fixa, porta 9090, volume `s3-data`). O `db:setup` do scorely cria o bucket `scorely-<stage>-uploads` e o CORS. A api assina as URLs com `S3_PUBLIC_ENDPOINT` (o host que o navegador alcança) e fala com o S3Mock por `S3_ENDPOINT`.

## Por quê

É um container só, sem configuração, licença Apache 2.0, feito para dev e testes. O código da api é o mesmo da AWS: só muda o endpoint. Se o S3Mock não aceitar o POST assinado ou o CORS, a alternativa é o Garage (`dxflrs/garage`), com a mesma estrutura.

## Consequências

- O S3Mock não confere assinatura, expiração nem a policy do POST (aceitou um arquivo de 2 MB + 1 byte no teste). Por isso a api confere peso, formato real e dimensões ao confirmar o envio (MID-05, `HeadObject` + leitura do cabeçalho), e a regra vale também no local.
- Na AWS, o bucket, a policy pública em `public/*`, a limpeza do `tmp/` e o CORS vêm do stack de infra ([0001](0001-infra-separada-da-api.md)). Os prefixos estão em [midia.md](../modules/midia.md).
- O S3Mock não implementa `PutBucketCors`, mas já responde CORS com `*`. O `db:setup` tenta configurar e ignora a falha.
- Check: `checks/uploads.test.ts`.
