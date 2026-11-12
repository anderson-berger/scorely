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
