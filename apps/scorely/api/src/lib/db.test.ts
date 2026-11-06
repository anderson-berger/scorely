import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { describe, expect, it } from 'vitest';
import { createTransactWrite, type TransactItem, transactionFailure } from './db';

// Plano 006: casos 1–10 (classificação e repetição da TransactWriteItems).

const canceled = (codes?: string[]) =>
  new TransactionCanceledException({
    message: 'Transaction cancelled',
    $metadata: {},
    ...(codes && { CancellationReasons: codes.map((Code) => ({ Code })) }),
  });

const ITEMS: TransactItem[] = [
  { Put: { TableName: 'table', Item: { PK: 'A', SK: 'A' } } },
  { Delete: { TableName: 'table', Key: { PK: 'B', SK: 'B' } } },
];

/** `send` que falha com os erros da fila, na ordem, e resolve quando ela acaba. */
function fakeDeps(failures: unknown[], opts: { always?: unknown } = {}) {
  const sent: TransactItem[][] = [];
  const slept: number[] = [];
  const queue = [...failures];
  const deps = {
    async send(items: TransactItem[]) {
      sent.push(items);
      if (opts.always !== undefined) throw opts.always;
      const next = queue.shift();
      if (next !== undefined) throw next;
      return {};
    },
    async sleep(ms: number) {
      slept.push(ms);
    },
  };
  return { deps, sent, slept, write: createTransactWrite(deps) };
}

async function rejection(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => undefined,
    (e: unknown) => e,
  );
}

describe('transactionFailure (casos 1–5)', () => {
  it('caso 1: erro que não é TransactionCanceledException → undefined', () => {
    expect(transactionFailure(new Error('network down'))).toBeUndefined();
    const conditional = Object.assign(new Error('x'), { name: 'ConditionalCheckFailedException' });
    expect(transactionFailure(conditional)).toBeUndefined();
    expect(transactionFailure('TransactionCanceledException')).toBeUndefined();
    expect(transactionFailure(undefined)).toBeUndefined();
  });

  it('caso 2: [None, ConditionalCheckFailed, None] → condition com failed [1]', () => {
    expect(transactionFailure(canceled(['None', 'ConditionalCheckFailed', 'None']))).toEqual({
      kind: 'condition',
      failed: [1],
    });
  });

  it('caso 2: várias condições falhando → todos os índices', () => {
    expect(
      transactionFailure(canceled(['ConditionalCheckFailed', 'None', 'ConditionalCheckFailed'])),
    ).toEqual({
      kind: 'condition',
      failed: [0, 2],
    });
  });

  it('caso 3: [ConditionalCheckFailed, TransactionConflict] → retry (conflito vence)', () => {
    expect(transactionFailure(canceled(['ConditionalCheckFailed', 'TransactionConflict']))).toEqual({
      kind: 'retry',
    });
  });

  it('caso 4: [None, ThrottlingError] → retry', () => {
    expect(transactionFailure(canceled(['None', 'ThrottlingError']))).toEqual({ kind: 'retry' });
  });

  it('caso 4: ProvisionedThroughputExceeded também → retry', () => {
    expect(transactionFailure(canceled(['ProvisionedThroughputExceeded', 'None']))).toEqual({
      kind: 'retry',
    });
  });

  it('caso 5: sem CancellationReasons → undefined', () => {
    expect(transactionFailure(canceled())).toBeUndefined();
  });

  it('caso 5: com ValidationError → undefined', () => {
    expect(transactionFailure(canceled(['ValidationError', 'None']))).toBeUndefined();
    expect(transactionFailure(canceled(['ConditionalCheckFailed', 'ValidationError']))).toBeUndefined();
  });

  it('caso 5: só None (nenhuma condição falhou) → undefined', () => {
    expect(transactionFailure(canceled(['None', 'None']))).toBeUndefined();
  });
});

describe('createTransactWrite (casos 6–10)', () => {
  it('caso 6: send resolve → { ok: true } e 1 envio, sem espera', async () => {
    const t = fakeDeps([]);
    await expect(t.write(ITEMS)).resolves.toEqual({ ok: true });
    expect(t.sent).toEqual([ITEMS]);
    expect(t.slept).toEqual([]);
  });

  it('caso 7: falha 2 vezes com conflito e depois resolve → { ok: true }, 3 envios e 2 esperas', async () => {
    const t = fakeDeps([canceled(['TransactionConflict', 'None']), canceled(['None', 'ThrottlingError'])]);
    await expect(t.write(ITEMS)).resolves.toEqual({ ok: true });
    expect(t.sent).toEqual([ITEMS, ITEMS, ITEMS]);
    expect(t.slept).toHaveLength(2);
  });

  it('caso 7: a espera é curta e cresce com a tentativa (50–150 ms × tentativa, D2)', async () => {
    const t = fakeDeps([canceled(['TransactionConflict']), canceled(['TransactionConflict'])]);
    await t.write(ITEMS);
    const [first, second] = t.slept;
    expect(first).toBeGreaterThanOrEqual(50);
    expect(first).toBeLessThanOrEqual(150);
    expect(second).toBeGreaterThanOrEqual(100);
    expect(second).toBeLessThanOrEqual(300);
  });

  it('caso 8: sempre conflito → lança o erro original depois de 3 envios', async () => {
    const conflict = canceled(['None', 'TransactionConflict']);
    const t = fakeDeps([], { always: conflict });
    const err = await rejection(t.write(ITEMS));
    expect(err).toBe(conflict);
    expect(t.sent).toHaveLength(3);
    expect(t.slept).toHaveLength(2);
  });

  it('caso 8: attempts configura o total de envios', async () => {
    const conflict = canceled(['TransactionConflict']);
    const sent: TransactItem[][] = [];
    const write = createTransactWrite({
      async send(items: TransactItem[]) {
        sent.push(items);
        throw conflict;
      },
      sleep: async () => undefined,
      attempts: 2,
    });
    expect(await rejection(write(ITEMS))).toBe(conflict);
    expect(sent).toHaveLength(2);
  });

  it('caso 9: condição falha no índice 0 → { ok: false, failed: [0] } sem repetir', async () => {
    const t = fakeDeps([canceled(['ConditionalCheckFailed', 'None'])]);
    await expect(t.write(ITEMS)).resolves.toEqual({ ok: false, failed: [0] });
    expect(t.sent).toHaveLength(1);
    expect(t.slept).toEqual([]);
  });

  it('caso 10: erro qualquer (rede) → lança sem repetir', async () => {
    const network = new Error('socket hang up');
    const t = fakeDeps([network]);
    expect(await rejection(t.write(ITEMS))).toBe(network);
    expect(t.sent).toHaveLength(1);
    expect(t.slept).toEqual([]);
  });

  it('caso 10: cancelamento com ValidationError → lança sem repetir', async () => {
    const invalid = canceled(['ValidationError']);
    const t = fakeDeps([invalid]);
    expect(await rejection(t.write(ITEMS))).toBe(invalid);
    expect(t.sent).toHaveLength(1);
  });
});
