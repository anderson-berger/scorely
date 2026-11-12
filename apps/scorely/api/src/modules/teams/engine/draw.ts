import { range } from '@scorely/api/src/lib/fn';
import { matches, type RulePeople } from '@scorely/api/src/modules/teams/engine/rules';
import type { Gender, TeamApartRule, TeamRule } from '@scorely/contracts';

/** O que o sorteio recebe (TIM-15, 16). Puro: sem I/O, o acaso vem de `random`. */
export interface DrawInput {
  /** Times atuais; a quantidade de times é `teams.length`. */
  teams: string[][];
  /** Fixados: ficam no time em que estão em `teams`. Fixado fora dos times é ignorado. */
  pinned: string[];
  /** Quem é sorteado (sem os fixados). */
  pool: string[];
  /** Número em [0, 1). */
  random: () => number;
}

/** Embaralha com uma chave ao acaso por pessoa. */
function shuffle(ids: readonly string[], random: () => number): string[] {
  return ids
    .map((id) => ({ id, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.id);
}

/**
 * TIM-15: os fixados ficam onde estão e cada sorteado vai para um dos menores times (empate, ao acaso).
 * Assim a diferença fica ≤ 1 sempre que os fixados permitem; senão, os menores são completados primeiro.
 */
export function draw(input: DrawInput): string[][] {
  const pinned = new Set(input.pinned);
  const start = input.teams.map((team) => team.filter((id) => pinned.has(id)));
  const placedPinned = new Set(start.flat());
  const pool = [...new Set(input.pool)].filter((id) => !placedPinned.has(id));
  return shuffle(pool, input.random).reduce<string[][]>((teams, id) => {
    const smallest = Math.min(...teams.map((t) => t.length));
    const candidates = teams.flatMap((t, i) => (t.length === smallest ? [i] : []));
    const target = candidates[Math.floor(input.random() * candidates.length)] ?? 0;
    return teams.map((t, i) => (i === target ? [...t, id] : t));
  }, start);
}

/** O sorteio com as regras do grupo (TIM-19, 22) e a preferência de gênero (TIM-23). */
export interface RulesDrawInput extends DrawInput {
  rules: readonly TeamRule[];
  /** Times opostos (TIM-22): cada conjunto vale como "no máximo 1 por time" de quem está nele. */
  apart?: readonly TeamApartRule[];
  /** TIM-23: depois de cumprir as regras, espalha homens e mulheres o melhor possível. */
  spreadGender?: boolean;
  /** Quem conta para as regras e para o gênero (ver `RulePeople`). */
  people: RulePeople;
  /** Passos de cada tentativa (padrão 3000). */
  maxSteps?: number;
  /** Tentativas, cada uma partindo de um sorteio novo (padrão 10). */
  attempts?: number;
}

/**
 * Tamanhos que o TIM-15 permite: o nível `level` é o maior que dá para encher com o `pool`, completando os menores primeiro.
 * Cada time termina entre `lower` e `upper`; quem já passa do nível (fixados) não recebe ninguém.
 */
function sizeBounds(sizes: readonly number[], pool: number) {
  const need = (level: number) => sizes.reduce((sum, size) => sum + Math.max(0, level - size), 0);
  const findLevel = (level: number): number => (need(level + 1) <= pool ? findLevel(level + 1) : level);
  const level = findLevel(Math.min(...sizes));
  return {
    lower: sizes.map((size) => Math.max(size, level)),
    upper: sizes.map((size) => (size > level ? size : level + 1)),
  };
}

/** Uma restrição por time: as regras de quantidade e, nos times opostos, "no máximo 1". */
interface Limit {
  min?: number;
  max?: number;
}

/** Quanto a contagem `count` está fora do limite. */
function penalty(limit: Limit, count: number): number {
  return Math.max(0, (limit.min ?? 0) - count) + Math.max(0, count - (limit.max ?? Number.POSITIVE_INFINITY));
}

const GENDERS: readonly Gender[] = ['M', 'F'];

/** TIM-23: quanto os gêneros estão desiguais: por gênero, o maior menos o menor entre os times. */
function genderCost(rows: readonly (readonly number[])[]): number {
  return GENDERS.reduce((sum, _, g) => {
    const values = rows.map((row) => row[g] ?? 0);
    return sum + Math.max(...values) - Math.min(...values);
  }, 0);
}

/** Uma troca entre dois times: `a` sai de `from` para `to` e, numa troca, `b` faz o caminho contrário. */
interface Move {
  from: number;
  to: number;
  a: string;
  b?: string;
  delta: number;
}

/** Soma (ou tira, `sign` = -1) a pessoa nas contagens `row` dos índices `list`. */
function shift(row: number[], list: readonly number[], sign: 1 | -1): void {
  for (const k of list) row[k] = (row[k] ?? 0) + sign;
}

/**
 * TIM-19, 22: busca local. Parte do sorteio sem regras (tamanhos do TIM-15, fixados no lugar) e, a cada passo, num time
 * fora das regras, faz a troca (ou a mudança de time, quando os tamanhos deixam) que mais aproxima todos das regras;
 * às vezes uma ao acaso, para não travar. Sem sucesso, tenta de novo a partir de outro sorteio.
 * TIM-23: cumpridas as regras, continua só com trocas que não tiram nenhum time das regras, enquanto alguma deixa os
 * gêneros mais iguais.
 * `undefined` = não achou uma divisão (as regras não fecham juntas, ou a busca passou do limite).
 */
export function drawWithRules(input: RulesDrawInput): string[][] | undefined {
  const { rules, people, random } = input;
  const apart = input.apart ?? [];
  const limits: Limit[] = [
    ...rules.map((rule) => ({
      ...(rule.min !== undefined && { min: rule.min }),
      ...(rule.max !== undefined && { max: rule.max }),
    })),
    ...apart.map(() => ({ max: 1 })),
  ];
  const pinned = new Set(input.pinned);
  const fixedSizes = input.teams.map((team) => team.filter((id) => pinned.has(id)).length);
  const placedPinned = new Set(input.teams.flat().filter((id) => pinned.has(id)));
  const poolSize = new Set(input.pool.filter((id) => !placedPinned.has(id))).size;
  const bounds = sizeBounds(fixedSizes, poolSize);
  const memberOf = new Map(
    [...placedPinned, ...input.pool].map((id) => {
      const person = people.get(id);
      const byRule = rules.flatMap((rule, k) => (matches(rule, person) ? [k] : []));
      const byApart = apart.flatMap((r, j) => (person && r.people.includes(id) ? [rules.length + j] : []));
      return [id, [...byRule, ...byApart]];
    }),
  );
  const ruleList = (id: string) => memberOf.get(id) ?? [];
  const genderList = (id: string): number[] => {
    const g = people.get(id)?.gender;
    return g ? [GENDERS.indexOf(g)] : [];
  };
  const attempts = input.attempts ?? 10;
  const maxSteps = input.maxSteps ?? 3000;

  function attempt(): string[][] | undefined {
    const teams = draw(input).map((team) => [...team]);
    const counts = teams.map((team) =>
      limits.map((_, k) => team.filter((id) => ruleList(id).includes(k)).length),
    );
    const genders = teams.map((team) =>
      GENDERS.map((_, g) => team.filter((id) => genderList(id).includes(g)).length),
    );
    const teamCost = (row: readonly number[]) =>
      limits.reduce((sum, limit, k) => sum + penalty(limit, row[k] ?? 0), 0);

    /** Como as linhas `rows` de `from` e `to` ficam com a troca (`list` = em que contagens cada pessoa entra). */
    function after(
      rows: readonly (readonly number[])[],
      move: Omit<Move, 'delta'>,
      list: (id: string) => number[],
    ) {
      const rowFrom = [...(rows[move.from] ?? [])];
      const rowTo = [...(rows[move.to] ?? [])];
      shift(rowFrom, list(move.a), -1);
      shift(rowTo, list(move.a), 1);
      if (move.b !== undefined) {
        shift(rowFrom, list(move.b), 1);
        shift(rowTo, list(move.b), -1);
      }
      return { rowFrom, rowTo };
    }

    /** Quanto o custo das regras nos dois times muda com a troca. */
    function deltaOf(move: Omit<Move, 'delta'>): number {
      const { rowFrom, rowTo } = after(counts, move, ruleList);
      const before = teamCost(counts[move.from] ?? []) + teamCost(counts[move.to] ?? []);
      return teamCost(rowFrom) + teamCost(rowTo) - before;
    }

    function movesFrom(from: number): Move[] {
      const movable = (teams[from] ?? []).filter((id) => !pinned.has(id));
      return teams.flatMap((other, to) => {
        if (to === from) return [];
        const canMove =
          (teams[from]?.length ?? 0) > (bounds.lower[from] ?? 0) && other.length < (bounds.upper[to] ?? 0);
        return movable
          .flatMap((a) => [
            ...(canMove ? [{ from, to, a }] : []),
            ...other.filter((b) => !pinned.has(b)).map((b) => ({ from, to, a, b })),
          ])
          .map((m) => ({ ...m, delta: deltaOf(m) }));
      });
    }

    function apply(move: Move): void {
      const from = teams[move.from] ?? [];
      const to = teams[move.to] ?? [];
      from.splice(from.indexOf(move.a), 1, ...(move.b === undefined ? [] : [move.b]));
      if (move.b !== undefined) to.splice(to.indexOf(move.b), 1);
      to.push(move.a);
      for (const [rows, list] of [
        [counts, ruleList],
        [genders, genderList],
      ] as const) {
        const { rowFrom, rowTo } = after(rows, move, list);
        rows[move.from] = rowFrom;
        rows[move.to] = rowTo;
      }
    }

    const pick = <T>(list: readonly T[]): T | undefined => list[Math.floor(random() * list.length)];

    /** TIM-23: o quanto os gêneros ficam desiguais com a troca. */
    function genderAfter(move: Move): number {
      const { rowFrom, rowTo } = after(genders, move, genderList);
      return genderCost(genders.map((row, i) => (i === move.from ? rowFrom : i === move.to ? rowTo : row)));
    }

    /** TIM-23: cada passo faz a troca que mais iguala os gêneros sem tirar ninguém das regras; para quando nenhuma melhora. */
    function spread(): string[][] {
      for (const _ of range(maxSteps)) {
        const current = genderCost(genders);
        if (current === 0) return teams;
        const better = teams
          .flatMap((_, from) => movesFrom(from))
          .filter((m) => m.delta === 0)
          .map((m) => ({ move: m, cost: genderAfter(m) }))
          .filter((x) => x.cost < current);
        if (better.length === 0) return teams;
        const best = Math.min(...better.map((x) => x.cost));
        const choice = pick(better.filter((x) => x.cost === best));
        if (choice) apply(choice.move);
      }
      return teams;
    }

    for (const _ of range(maxSteps)) {
      const outside = counts.flatMap((row, i) => (teamCost(row) > 0 ? [i] : []));
      const from = pick(outside);
      if (from === undefined) return input.spreadGender ? spread() : teams;
      const moves = movesFrom(from);
      // Nenhum time fora das regras tem troca possível (todos fixados): não adianta continuar.
      if (moves.length === 0 && outside.every((i) => movesFrom(i).length === 0)) return undefined;
      const best = Math.min(...moves.map((m) => m.delta));
      const move = random() < 0.1 ? pick(moves) : pick(moves.filter((m) => m.delta === best));
      if (move) apply(move);
    }
    return undefined;
  }

  return range(attempts).reduce<string[][] | undefined>((found) => found ?? attempt(), undefined);
}
