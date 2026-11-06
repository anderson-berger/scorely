# 006 — Conflitos de transação no DynamoDB (fecha a E1)

Origem: os ⚠️ da revisão do bloco 2 do plano 003 (`003-grupos-e1.bloco2.review.md`).

## Objetivo

Separar os dois motivos pelos quais uma `TransactWriteItems` é cancelada e tratar cada um do jeito certo:

- **condição falhou** (`ConditionalCheckFailed`): o estado do banco não é o esperado ("já existe", "não existe mais", "o convite mudou"). É resposta de negócio.
- **conflito com outra transação** (`TransactionConflict`, e também `ThrottlingError`/`ProvisionedThroughputExceeded`): nada foi decidido; a escrita deve ser repetida.

Hoje o `isTransactionConflict` (`apps/scorely/api/src/lib/db.ts:134`) trata os dois como "a condição falhou". Efeitos:

- `addAttendance` devolve `false` num conflito e o `confirm` responde 200 sem ter gravado a presença;
- `addMember` engole o conflito e o convite "funciona" sem a pessoa virar membro;
- `removeAttendance` engole o conflito e a desistência pode não acontecer;
- `create` do jogo devolve `false`, o `ensureRecord` relê, não acha e responde 500.

Também: duas remoções simultâneas do mesmo membro → a segunda responde 500 em vez de `GROUP_MEMBER_NOT_FOUND`.

Depois da correção, a E1 passa a "concluída" no `PRODUCT.md`.

## Fora de escopo

- Cancelar um jogo já cancelado dentro da janela de 3 h (outro ⚠️ do bloco 2): fica como está.
- O limite conhecido da promoção dupla (`PRODUCT.md`, "Limites conhecidos (E1)"): continua.
- Testes contra o DynamoDB de verdade (LocalStack). Os testes do módulo seguem com repositórios em memória.

## Decisões

- **D1. Um helper só para transações**, `transactWrite(items)` em `lib/db.ts`, usado por todos os repositórios (groups, games, users, notifications). Ele repete a escrita quando o cancelamento é só por conflito/throttling e devolve quais condições falharam. Motivo: o erro é o mesmo em 6 lugares; corrigir num ponto só evita repetir a lógica.
- **D2. Repetição limitada**: até 3 tentativas no total, com espera curta e aleatória entre elas (50–150 ms × tentativa). Esgotou → lança o erro original (500). Motivo: conflito entre transações é passageiro; sem limite, um item muito disputado prende a Lambda.
- **D3. Resultado com os índices**: `{ ok: true }` ou `{ ok: false, failed: number[] }` (índices dos itens com `ConditionalCheckFailed`). Cancelamento com outro motivo (ex.: `ValidationError`) → lança. Motivo: a remoção de membro precisa saber _qual_ condição falhou.
- **D4. Remoção de membro**: o repositório devolve `'removed' | 'not_member' | 'stale'`. Falhou a condição do lookup do membro (índice 0) → `not_member` → o service lança `GROUP_MEMBER_NOT_FOUND`. Falhou outra condição (o convite foi trocado ou a presença sumiu nesse meio-tempo) → `stale` → o service relê o grupo e o plano da remoção e tenta de novo, até 3 vezes; esgotou → 500.
- **D5. `isTransactionConflict` sai** de `lib/db.ts`. Nenhum repositório lê o erro da transação na mão.

## Contrato

Nenhuma rota, schema ou código de erro novo. `GROUP_MEMBER_NOT_FOUND` já existe.

## Interface (para os testes)

`apps/scorely/api/src/lib/db.ts`:

```ts
export type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];
export type TransactResult = { ok: true } | { ok: false; failed: number[] };

/** Classifica o erro de uma TransactWriteItems. Pura. */
export function transactionFailure(
  err: unknown,
): { kind: 'condition'; failed: number[] } | { kind: 'retry' } | undefined;

/** Fábrica testável: `send` envia a transação, `sleep` espera (ms). */
export function createTransactWrite(deps: {
  send: (items: TransactItem[]) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
  attempts?: number; // padrão 3
}): (items: TransactItem[]) => Promise<TransactResult>;

/** A instância de produção (dynamo() + setTimeout). */
export const transactWrite: (items: TransactItem[]) => Promise<TransactResult>;
```

Regras do `transactionFailure`:

- não é `Error` com `name === 'TransactionCanceledException'` → `undefined`;
- algum `CancellationReasons[i].Code` em `TransactionConflict`, `ThrottlingError` ou `ProvisionedThroughputExceeded` → `{ kind: 'retry' }`;
- senão, se todo motivo é `None` ou `ConditionalCheckFailed` e há pelo menos um `ConditionalCheckFailed` → `{ kind: 'condition', failed: [índices] }`;
- qualquer outro caso (sem `CancellationReasons`, outro código) → `undefined`.

Regras do `createTransactWrite`: `send` resolve → `{ ok: true }`; erro com `condition` → `{ ok: false, failed }`; com `retry` → espera e tenta de novo, até `attempts` envios no total, e na última tentativa lança o erro; com `undefined` → lança o erro.

`apps/scorely/api/src/modules/groups/group.repository.ts`:

```ts
export type RemoveMemberResult = 'removed' | 'not_member' | 'stale';
removeMember(input: { group; userId; newToken; attendance? }): Promise<RemoveMemberResult>;
```

O `GroupRepository` em memória dos testes passa a devolver esse resultado. Os outros métodos dos repositórios mantêm a assinatura; muda só como tratam o erro.

## Casos de comportamento

1. Dado um erro que não é `TransactionCanceledException`, quando classificado, então `undefined`.
2. Dado `CancellationReasons = [None, ConditionalCheckFailed, None]`, então `{ kind: 'condition', failed: [1] }`.
3. Dado `[ConditionalCheckFailed, TransactionConflict]`, então `{ kind: 'retry' }` (conflito vence: a condição pode ter falhado por causa da outra transação).
4. Dado `[None, ThrottlingError]`, então `{ kind: 'retry' }`.
5. Dado `TransactionCanceledException` sem `CancellationReasons`, ou com `ValidationError`, então `undefined`.
6. Dado `send` que resolve, quando `transactWrite`, então `{ ok: true }` e 1 envio.
7. Dado `send` que falha 2 vezes com conflito e depois resolve, então `{ ok: true }`, 3 envios e 2 esperas.
8. Dado `send` que sempre falha com conflito, então lança o erro depois de 3 envios.
9. Dado `send` que falha com condição no índice 0, então `{ ok: false, failed: [0] }` sem repetir.
10. Dado `send` que falha com um erro qualquer (ex.: rede), então lança sem repetir.
11. Dado que o membro B já foi removido por outra requisição entre o `isMember` e a transação (o repositório devolve `not_member`), quando o dono remove B, então `GROUP_MEMBER_NOT_FOUND` e ninguém é notificado.
12. Dado que o convite foi trocado entre a leitura do grupo e a transação (o repositório devolve `stale` na 1ª vez e `removed` na 2ª), quando o dono remove B, então a remoção acontece, o repositório recebeu na 2ª chamada o grupo relido (token novo) e a promoção da fila (D6 do 003) roda uma vez.
13. Dado que o repositório devolve `stale` 3 vezes, quando o dono remove B, então lança erro comum (500), não um `appError`.

Os efeitos nos repositórios (confirmar com conflito grava a presença, aceitar convite com conflito vira membro) decorrem dos casos 6–10 e de os repositórios usarem só o `transactWrite`; o reviewer confere que nenhum repositório lê o erro da transação na mão.

## Tarefas

1. **`lib/db.ts`**: `transactionFailure`, `createTransactWrite`, `transactWrite`; remove `isTransactionConflict`. Pronto quando: casos 1–10 verdes. Risco: baixo.
2. **Repositórios** (`game`, `group`, `user`, `notification`): toda `TransactWriteCommand` passa a ser `transactWrite(items)`; `false`/idempotência só com `ok: false`. Pronto quando: `npm run check` verde e nenhum `TransactionCanceledException` fora de `lib/db.ts`. Risco: médio (mexe em users e notifications, que já estavam em produção local).
3. **Remoção de membro**: `RemoveMemberResult` no repositório (índice 0 → `not_member`, outro → `stale`) e o laço de até 3 tentativas no `group.service`. Pronto quando: casos 11–13 verdes. Risco: baixo.
4. **`PRODUCT.md`**: E1 "concluída", e a linha "Já existe / Próximo" do MVP passa a citar a E1 pronta e a E2 como próxima. Pronto quando: lint verde.

## Perguntas

Nenhuma que bloqueie. Se preferir que a correção fique só no módulo de grupos (sem mexer em users e notifications), avise antes de aprovar.

## Status

| Passo            | Estado                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Plano         | ✅ aprovado                                                                                                                          |
| 2. Contrato      | ✅ sem mudança de contrato                                                                                                           |
| 3. Testes        | ✅ `test-writer`: casos 1–13 (20 testes novos em `lib/db.test.ts` e `groups.service.test.ts`), todos falhando antes da implementação |
| 4. Implementação | ✅ tarefas 1–4; `npm run check` verde (api 163); testes staged intactos; formato do `CancellationReasons` conferido no LocalStack    |
| 5. Revisão       | ✅ `reviewer`: aprovado com ressalvas, sem ❌ (`006-conflitos-transacao.review.md`)                                                  |
| 6. Entrega       | ✅ tudo staged; commit é do dono                                                                                                     |
