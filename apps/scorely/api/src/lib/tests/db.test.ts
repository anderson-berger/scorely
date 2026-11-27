import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  createTransactWrite,
  dbItem,
  LOOKUP_ENTITY,
  stripKeys,
  type TransactItem,
  touch,
  transactionFailure,
} from '@scorely/api/src/lib/db';
import { describe, expect, it } from 'vitest';

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

// ADR 0013 (docs/decisions/0013-version-e-updatedat.md): toda entidade nasce com `updatedAt = createdAt` e
// `version = 1`; lookups ficam de fora.
describe('dbItem: updatedAt e version (ADR 0013)', () => {
  const KEYS = { PK: 'USER#u1', SK: 'META' };
  const AT = '2026-11-14T12:00:00.000Z';

  it('ADR 0013: entidade nova nasce com updatedAt = createdAt e version = 1', () => {
    const item = dbItem(KEYS, 'User', { id: 'u1' }, AT);
    expect(item).toMatchObject({
      ...KEYS,
      entity: 'User',
      id: 'u1',
      createdAt: AT,
      updatedAt: AT,
      version: 1,
    });
  });

  it('ADR 0013: o createdAt da entidade (newEntity) vale também para o updatedAt', () => {
    const created = '2026-11-01T08:00:00.000Z';
    const item = dbItem(KEYS, 'User', { id: 'u1', createdAt: created }, AT);
    expect(item).toMatchObject({ createdAt: created, updatedAt: created, version: 1 });
  });

  it('ADR 0013: sem createdAt informado, updatedAt e createdAt são o mesmo instante', () => {
    const item = dbItem(KEYS, 'User', { id: 'u1' });
    expect(typeof item.createdAt).toBe('string');
    expect(item.updatedAt).toBe(item.createdAt);
    expect(item.version).toBe(1);
  });

  it('ADR 0013: lookup não é entidade: sem updatedAt nem version', () => {
    const item = dbItem(
      { PK: 'LOOKUP#USER#EMAIL#ana@example.com', SK: 'META' },
      LOOKUP_ENTITY,
      { id: 'u1' },
      AT,
    );
    expect(item).toMatchObject({ entity: LOOKUP_ENTITY, id: 'u1', createdAt: AT });
    expect(item).not.toHaveProperty('updatedAt');
    expect(item).not.toHaveProperty('version');
  });
});

// ADR 0013: toda alteração de entidade grava `updatedAt` e soma 1 na `version`, pelo helper `touch`.
describe('touch: alteração de entidade (ADR 0013)', () => {
  const AT = new Date('2026-11-14T15:30:00.000Z');
  const placeholderValue = (values: Record<string, unknown>, expression: string, pattern: RegExp) => {
    const placeholder = expression.match(pattern)?.[1];
    return placeholder === undefined ? undefined : values[placeholder];
  };

  it('ADR 0013: Update sem nada mais → SET updatedAt com o instante da alteração e ADD version 1', () => {
    const update: { Key: { PK: string; SK: string }; UpdateExpression?: string } = {
      Key: { PK: 'A', SK: 'META' },
    };
    const out = touch(update, AT);
    expect(placeholderValue(out.ExpressionAttributeValues, out.UpdateExpression, /updatedAt = (:\w+)/)).toBe(
      AT.toISOString(),
    );
    expect(placeholderValue(out.ExpressionAttributeValues, out.UpdateExpression, /ADD version (:\w+)/)).toBe(
      1,
    );
    expect(out.UpdateExpression).toMatch(/^SET /);
  });

  it('ADR 0013: mantém os campos, nomes e valores do Update original', () => {
    const out = touch(
      {
        Key: { PK: 'A', SK: 'META' },
        UpdateExpression: 'SET #nickname = :nickname REMOVE #gender',
        ExpressionAttributeNames: { '#nickname': 'nickname', '#gender': 'gender' },
        ExpressionAttributeValues: { ':nickname': 'Aninha' },
        ConditionExpression: 'attribute_exists(PK)',
      },
      AT,
    );
    expect(out).toMatchObject({
      Key: { PK: 'A', SK: 'META' },
      ExpressionAttributeNames: { '#nickname': 'nickname', '#gender': 'gender' },
      ConditionExpression: 'attribute_exists(PK)',
    });
    expect(out.ExpressionAttributeValues[':nickname']).toBe('Aninha');
    expect(out.UpdateExpression).toContain('#nickname = :nickname');
    expect(out.UpdateExpression).toContain('REMOVE #gender');
    expect(out.UpdateExpression.match(/\bSET\b/g)).toHaveLength(1);
    expect(placeholderValue(out.ExpressionAttributeValues, out.UpdateExpression, /updatedAt = (:\w+)/)).toBe(
      AT.toISOString(),
    );
    expect(placeholderValue(out.ExpressionAttributeValues, out.UpdateExpression, /ADD version (:\w+)/)).toBe(
      1,
    );
  });

  it('ADR 0013: com um ADD já existente (contador junto), a version entra no mesmo ADD', () => {
    const out = touch(
      { UpdateExpression: 'SET a = :a ADD hits :one', ExpressionAttributeValues: { ':a': 1, ':one': 1 } },
      AT,
    );
    expect(out.UpdateExpression.match(/\bADD\b/g)).toHaveLength(1);
    expect(out.UpdateExpression).toContain('hits :one');
    expect(placeholderValue(out.ExpressionAttributeValues, out.UpdateExpression, /ADD version (:\w+)/)).toBe(
      1,
    );
  });
});

// ADR 0013 (consequências): o `updatedAt` e a `version` saem nas respostas que espalham o item do banco.
describe('stripKeys: o que sai na resposta (ADR 0013)', () => {
  it('ADR 0013: tira as chaves, a `entity` e o `ttl`, e mantém o `updatedAt` e a `version`', () => {
    const out = stripKeys<Record<string, unknown>>({
      PK: 'GROUP#g1',
      SK: 'META',
      entity: 'Group',
      ttl: 1_800_000_000,
      id: 'g1',
      createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-14T12:00:00.000Z',
      version: 3,
    });
    expect(out).toEqual({
      id: 'g1',
      createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-14T12:00:00.000Z',
      version: 3,
    });
  });
});
