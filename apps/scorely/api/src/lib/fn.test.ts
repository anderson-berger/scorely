import { describe, expect, it } from 'vitest';
import { chunk, lazy, range } from './fn';

describe('fn', () => {
  it('lazy cria uma vez só, mesmo quando o valor é undefined', () => {
    const calls: number[] = [];
    const get = lazy(() => void calls.push(1));
    get();
    get();
    expect(calls).toHaveLength(1);
  });

  it('lazy tenta de novo se a criação falhou', () => {
    const attempts: number[] = [];
    const get = lazy(() => {
      attempts.push(1);
      if (attempts.length === 1) throw new Error('boom');
      return 'ok';
    });
    expect(get).toThrow('boom');
    expect(get()).toBe('ok');
  });

  it('chunk divide mantendo a ordem', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });

  it('range', () => {
    expect(range(3)).toEqual([0, 1, 2]);
    expect(range(0)).toEqual([]);
  });
});
