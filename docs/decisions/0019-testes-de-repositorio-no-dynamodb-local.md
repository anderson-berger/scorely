# 0019: testes de repositório rodam também contra o DynamoDB Local

- Data: 2026-11-23
- Estado: aceita

## Contexto

Os testes usam repositórios em memória (`groups.memory.ts`), e o plano 009 deixou testes contra o DynamoDB de verdade como "fora de escopo". Em 2026-11-22, o `transferGroup` passou no `npm run check` com um erro que o DynamoDB recusa (`#tier` declarado em `ExpressionAttributeNames` e não usado), e só o `serverless dev` mostrou. Erros de expressão, de condição e de chave não existem na memória, e a memória pode divergir do Dynamo sem ninguém ver.

## Decisão

- Cada repositório do scorely ganha uma **suíte de contrato** (`<mod>.repository.contract.test.ts`): os mesmos cenários rodam contra a implementação em memória e contra a do DynamoDB, chamando o repositório direto.
- O Dynamo roda no **DynamoDB Local** (o do ambiente, `DYNAMODB_ENDPOINT`), numa tabela `scorely-test-<runId>` criada pelo `globalSetup` do vitest da api, com o `singleTableSchema`, e apagada no fim.
- **O DynamoDB Local é obrigatório:** sem ele o `npm run check` falha com mensagem clara, sem `skipIf`.
- Entra por módulo, começando pelas transações do grupo. Os testes de service continuam em memória.

## Por quê

O objetivo não é só validar expressões: é garantir que as duas implementações respeitem o mesmo contrato. Pular em silêncio quando o serviço não está no ar deixaria o `check` verde sem cobrir nada, a falsa confiança que causou o bug. Uma tabela por execução, com ids sempre novos (uuid), evita interferência sem limpar dados entre testes, e não toca nas tabelas de desenvolvimento.

## Consequências

- `npm run check` e o `pre-commit` passam a exigir o DynamoDB Local no ar (o devcontainer já sobe). Fora dele, a mensagem diz como subir.
- Quando um cenário diverge entre memória e Dynamo, o erro é da memória ou do repositório: um dos dois muda, nunca o teste.
- Substitui, para os repositórios, a linha "Testes contra o DynamoDB de verdade" do plano 009 ("fora de escopo"). O plano é histórico e não muda.
- Regra: `.claude/rules/dynamodb.md` (seção de testes de repositório).
