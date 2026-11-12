import { describe, expect, it } from 'vitest';
import { range } from '../../../lib/fn';
import { draw } from './draw';

// E3 etapa 3 (`.claude/work/e3-times-3.md`): motor puro do sorteio, TIM-15 e TIM-16.
// Testes de propriedade com laços e seeds fixos (o repo não tem fast-check).

/** Gerador determinístico em [0, 1) (mulberry32), com o estado num objeto. */
function seeded(seed: number): () => number {
  const s = { v: seed >>> 0 };
  return () => {
    s.v = (s.v + 0x6d2b79f5) | 0;
    const a = Math.imul(s.v ^ (s.v >>> 15), 1 | s.v);
    const b = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
    return ((b ^ (b >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inteiro em [min, max]. */
const int = (random: () => number, min: number, max: number) => min + Math.floor(random() * (max - min + 1));

const id = (prefix: string, n: number) => `${prefix}${n}`;

interface Case {
  teams: string[][];
  pinned: string[];
  pool: string[];
}

/**
 * Caso ao acaso: de 2 a 8 times, cada time com 0 a 3 fixados e 0 a 2 não fixados (que não estão no pool),
 * e um pool grande o bastante para os fixados permitirem diferença ≤ 1 (quando `balanced`).
 */
function randomCase(seed: number, balanced: boolean): Case {
  const random = seeded(seed);
  const count = int(random, 2, 8);
  const pinnedPerTeam = range(count).map(() => int(random, 0, 3));
  const loosePerTeam = range(count).map(() => int(random, 0, 2));
  const teams = range(count).map((t) => [
    ...range(pinnedPerTeam[t] ?? 0).map((i) => id(`p${t}-`, i)),
    ...range(loosePerTeam[t] ?? 0).map((i) => id(`l${t}-`, i)),
  ]);
  const pinned = range(count).flatMap((t) => range(pinnedPerTeam[t] ?? 0).map((i) => id(`p${t}-`, i)));
  const maxPinned = Math.max(...pinnedPerTeam);
  const minPool = balanced ? count * maxPinned - pinned.length : 0;
  const poolSize = minPool + int(random, 0, 12);
  const pool = range(poolSize).map((i) => id('x', i));
  return { teams, pinned, pool };
}

const SEEDS = range(300).map((i) => i * 7919 + 1);
const sizes = (teams: string[][]) => teams.map((t) => t.length);
const sorted = (xs: string[]) => [...xs].sort();

describe('motor do sorteio: quem entra e onde fica (TIM-15, TIM-16)', () => {
  it('TIM-15: cada pessoa do pool aparece exatamente uma vez, junto com os fixados, e ninguém mais', () => {
    for (const seed of SEEDS) {
      const input = randomCase(seed, seed % 2 === 0);
      const result = draw({ ...input, random: seeded(seed + 1) });
      expect(sorted(result.flat())).toEqual(sorted([...input.pool, ...input.pinned]));
    }
  });

  it('TIM-15: usa a quantidade de times da entrada', () => {
    for (const seed of SEEDS) {
      const input = randomCase(seed, true);
      expect(draw({ ...input, random: seeded(seed + 1) })).toHaveLength(input.teams.length);
    }
  });

  it('TIM-15: quem estava nos times sem ser fixado e não está no pool sai dos times', () => {
    const result = draw({
      teams: [
        ['a', 'b'],
        ['c', 'd'],
      ],
      pinned: ['a'],
      pool: ['x', 'y'],
      random: seeded(1),
    });
    expect(sorted(result.flat())).toEqual(['a', 'x', 'y']);
  });

  it('TIM-16: cada fixado fica no mesmo time (mesmo índice) em que estava', () => {
    for (const seed of SEEDS) {
      const input = randomCase(seed, seed % 2 === 0);
      const result = draw({ ...input, random: seeded(seed + 1) });
      input.teams.forEach((team, t) => {
        for (const person of team.filter((p) => input.pinned.includes(p)))
          expect(result[t]).toContain(person);
      });
    }
  });

  it('TIM-16: fixado que não está em nenhum time é ignorado (não aparece no resultado)', () => {
    const result = draw({
      teams: [['a'], []],
      pinned: ['a', 'ghost'],
      pool: ['x', 'y', 'z'],
      random: seeded(3),
    });
    expect(result.flat()).not.toContain('ghost');
    expect(result[0]).toContain('a');
    expect(sorted(result.flat())).toEqual(['a', 'x', 'y', 'z']);
  });
});

describe('motor do sorteio: tamanhos (TIM-15)', () => {
  it('TIM-15: sem fixados, a diferença entre o maior e o menor time é de no máximo 1', () => {
    for (const seed of SEEDS) {
      const random = seeded(seed);
      const count = int(random, 2, 8);
      const pool = range(int(random, 0, 30)).map((i) => id('x', i));
      const result = draw({ teams: range(count).map(() => []), pinned: [], pool, random });
      expect(Math.max(...sizes(result)) - Math.min(...sizes(result))).toBeLessThanOrEqual(1);
    }
  });

  it('TIM-15: com fixados que permitem, a diferença (contando os fixados) é de no máximo 1', () => {
    for (const seed of SEEDS) {
      const input = randomCase(seed, true);
      const result = draw({ ...input, random: seeded(seed + 1) });
      expect(Math.max(...sizes(result)) - Math.min(...sizes(result))).toBeLessThanOrEqual(1);
    }
  });

  it('TIM-15: fixados que passam do equilíbrio → o sorteio completa primeiro os menores (todo time que recebeu alguém tem no máximo o menor + 1)', () => {
    for (const seed of SEEDS) {
      const input = randomCase(seed, false);
      const result = draw({ ...input, random: seeded(seed + 1) });
      const min = Math.min(...sizes(result));
      input.teams.forEach((team, t) => {
        const pinnedHere = team.filter((p) => input.pinned.includes(p)).length;
        const size = result[t]?.length ?? 0;
        if (size > pinnedHere) expect(size).toBeLessThanOrEqual(min + 1);
      });
    }
  });

  it('TIM-15: 4 fixados no Time 1 com 6 pessoas e 2 times → os 2 sorteados vão para o Time 2', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const result = draw({
        teams: [['a', 'b', 'c', 'd'], []],
        pinned: ['a', 'b', 'c', 'd'],
        pool: ['x', 'y'],
        random: seeded(seed),
      });
      expect(sorted(result[0] ?? [])).toEqual(['a', 'b', 'c', 'd']);
      expect(sorted(result[1] ?? [])).toEqual(['x', 'y']);
    }
  });

  it('TIM-15: caso de referência: 12 pessoas em 2 times → 6 e 6; 13 → 7 e 6', () => {
    const twelve = range(12).map((i) => id('x', i));
    expect(sizes(draw({ teams: [[], []], pinned: [], pool: twelve, random: seeded(5) }))).toEqual([6, 6]);
    const thirteen = draw({ teams: [[], []], pinned: [], pool: [...twelve, 'x12'], random: seeded(5) });
    expect(sizes(thirteen).sort()).toEqual([6, 7]);
  });
});

describe('motor do sorteio: acaso (TIM-15)', () => {
  it('TIM-15: a mesma sequência de random dá o mesmo resultado', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const input = randomCase(seed, true);
      expect(draw({ ...input, random: seeded(seed + 1) })).toEqual(
        draw({ ...input, random: seeded(seed + 1) }),
      );
    }
  });

  it('TIM-15: sortear de novo (outra sequência) pode dar outro resultado', () => {
    const pool = range(12).map((i) => id('x', i));
    const results = new Set(
      range(20).map((i) =>
        JSON.stringify(draw({ teams: [[], []], pinned: [], pool, random: seeded(i + 100) }).map(sorted)),
      ),
    );
    expect(results.size).toBeGreaterThan(1);
  });

  it('TIM-15: com 2 times e ninguém fixado, cada pessoa às vezes cai em cada time', () => {
    const pool = range(6).map((i) => id('x', i));
    const results = range(60).map((i) =>
      draw({ teams: [[], []], pinned: [], pool, random: seeded(i + 1000) }),
    );
    for (const person of pool)
      for (const t of [0, 1]) expect(results.some((r) => r[t]?.includes(person))).toBe(true);
  });
});
