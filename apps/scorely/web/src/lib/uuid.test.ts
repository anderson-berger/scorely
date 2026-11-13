import { uuid } from '@scorely/web/src/lib/uuid';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// TIM-24 (docs/modules/times.md): o avulso novo nasce no navegador com um id que o `TeamExtraSchema.id` (`z.uuid()`) aceita.
// O `crypto.randomUUID` só existe em contexto seguro (https ou localhost); sem ele, o id sai do `crypto.getRandomValues`.
// O painel abrindo em `http://<ip>` fica no roteiro manual.

const isUuid = (value: string) => z.uuid().safeParse(value).success;
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const realCrypto = globalThis.crypto;
const insecureCrypto = {
  getRandomValues: (array: Uint8Array<ArrayBuffer>) => realCrypto.getRandomValues(array),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uuid (TIM-24)', () => {
  it('TIM-24: com https (randomUUID disponível) → usa o randomUUID, e o z.uuid() aceita', () => {
    const randomUUID = vi.fn(() => '0b6f1c3e-8f5a-4d2b-9c7e-1a2b3c4d5e6f');
    vi.stubGlobal('crypto', { getRandomValues: insecureCrypto.getRandomValues, randomUUID });

    const id = uuid();

    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(id).toBe('0b6f1c3e-8f5a-4d2b-9c7e-1a2b3c4d5e6f');
    expect(isUuid(id)).toBe(true);
  });

  it('TIM-24: sem https (sem randomUUID) → monta um uuid v4 em minúsculas, e o z.uuid() aceita', () => {
    vi.stubGlobal('crypto', insecureCrypto);

    const id = uuid();

    expect(id).toMatch(V4);
    expect(isUuid(id)).toBe(true);
  });

  it('TIM-24: sem https → versão 4 no byte 6 e variante 10xx no byte 8, mesmo com bytes todos 0xff ou 0x00', () => {
    const fill = (byte: number) => ({
      getRandomValues: (array: Uint8Array<ArrayBuffer>) => array.fill(byte),
    });

    vi.stubGlobal('crypto', fill(0xff));
    const high = uuid();
    vi.stubGlobal('crypto', fill(0x00));
    const low = uuid();

    expect(high).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(low).toBe('00000000-0000-4000-8000-000000000000');
    expect(isUuid(high)).toBe(true);
    expect(isUuid(low)).toBe(true);
  });

  it('TIM-24: sem https → ids seguidos são diferentes', () => {
    vi.stubGlobal('crypto', insecureCrypto);

    const ids = Array.from({ length: 50 }, () => uuid());

    expect(new Set(ids).size).toBe(50);
  });

  it('TIM-24: com https → ids seguidos são diferentes', () => {
    const ids = Array.from({ length: 50 }, () => uuid());

    expect(new Set(ids).size).toBe(50);
    expect(ids.every(isUuid)).toBe(true);
  });
});
