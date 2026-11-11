# 0007: dev local com DynamoDB Local, sem LocalStack

- Data: 2026-11-09
- Estado: aceita

## Contexto

O ambiente local usava a LocalStack `4.9` community só para emular o DynamoDB. Em 03/2026 a LocalStack encerrou a edição community: a imagem atual só sobe com conta e `LOCALSTACK_AUTH_TOKEN`, e o plano gratuito (Hobby) não cobre uso comercial. A `4.9` continua rodando, mas está congelada e sem suporte, e o painel web (Resource Browser) não aceita instância sem licença.

## Decisão

O devcontainer usa o DynamoDB Local oficial da AWS (`amazon/dynamodb-local`, porta 8000, `-sharedDb`, volume `dynamodb-data`) e o `dynamodb-admin` (porta 8001) como interface web. Ambos com versão fixa.

## Por quê

O projeto só usa o DynamoDB. O DynamoDB Local é da própria AWS, gratuito, sem conta nem token, e suporta transações, que os repositórios usam. Com isso, nenhum dev precisa de conta externa para rodar o projeto.

## Consequências

- O DynamoDB Local não apaga itens vencidos por TTL. Não muda nada, porque a validade vem do `expiresAt` ([0004](0004-ttl-com-expiresat.md)). O `db:setup` tenta ligar o TTL e só avisa se falhar.
- Outro serviço AWS emulado no futuro (S3, SQS...) vai precisar de um emulador próprio. A LocalStack não volta sem uma nova decisão.
- Os dados do volume antigo `localstack-data` não foram migrados.
- Check: `checks/local-env.test.ts` (imagens fixas, sem `localstack`, endpoint e portas).
