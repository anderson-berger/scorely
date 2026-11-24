# 0013: Toda entidade tem `updatedAt` e `version`

- Data: 2026-11-14
- Estado: aceita

## Contexto

Só algumas entidades guardam `updatedAt` (temporada, times, preferências), e nenhuma guarda um número de versão. Trava otimista (dois editores no mesmo grupo), sincronização com o navegador e um log de eventos ou auditoria estão no horizonte, sem nada decidido. Ainda não há dados em produção: o formato muda hoje sem migração.

## Decisão

Toda entidade (inclusive a de relação e o item extra na partição de outra, como `GROUP#<id> / SETTINGS`) nasce com `updatedAt = createdAt` e `version = 1`. Toda alteração grava `updatedAt` com o instante dela e soma 1 na `version` (`ADD version :one`), no mesmo `Update` ou `Put`. Lookups e contadores ficam de fora: não são entidades. Os itens internos do auth (o código de login e a sessão) também ficam de fora (decisão do dono em 2026-11-20). Eles vivem pouco, ninguém os edita e nada confere a versão deles. A parte privada e as preferências do usuário (`USER#<id> / PRIVATE` e `PREFERENCES`) também ficam de fora (decisão do dono em 2026-11-20). Os dois só mudam pelo `PATCH /me`, que sempre soma 1 na `version` do perfil (`META`), e é essa que a tela confere (USR-18). A `version` e o `updatedAt` saem nas respostas que espalham o item do banco, mas ainda não estão nos contratos, e nenhuma condição usa a `version`.

## Por quê

A `version` é o número da alteração da entidade. Quando vier a trava otimista, a condição é `version = :lida`. Se vier um log de eventos, ela é a ordem dos eventos da entidade e o cursor da sincronização. Gravada desde o começo, qualquer um desses caminhos começa sem reescrever o banco.

## Consequências

- Todo `Put` passa pelo `dbItem`, que já põe `createdAt` e passa a pôr `updatedAt` e `version: 1`. Todo `Update` de entidade usa o helper de alteração do `db.ts`. Regra em `.claude/rules/dynamodb.md`.
- Escrita que substitui o item inteiro (`Put` de times, configuração de times) precisa ler a `version` atual ou virar `Update`, para não voltar a 1.
- Upsert (`Update` que pode criar o item) usa `if_not_exists` para o `createdAt` e soma a `version` a partir de 0.
- Exceção (2026-11-24): a marca interna gravada pelo sistema, que ninguém edita, não soma a `version` nem grava o `updatedAt`. Caso: o `notifiedWave` da partida (`markNotified`, PAR-24), a maior onda já avisada. Ela é controle do aviso, não uma edição: somar a `version` faria a edição de quem está com a partida aberta dar `VERSION_CONFLICT` sem ninguém ter mudado nada. Ela se protege com a própria condição (`notifiedWave = :from`).
- O `updatedAt` e a `version` saem nas respostas que espalham o item do banco, mesmo fora do contrato (decisão do dono em 2026-11-14). O `stripKeys` não os remove. A exceção é o `/me` (decisão do dono em 2026-11-20): a resposta é montada campo a campo pelo contrato, então sai só a `version` do perfil (`META`), sem o `updatedAt`. Toda mudança pelo `PATCH /me` soma 1 nela, mesmo quando muda só o nome ou as preferências (USR-18).
- CQRS, DynamoDB Streams e tabela de eventos continuam em aberto (revisão de desempenho e custo).
