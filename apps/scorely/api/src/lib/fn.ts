/** Cria o valor na primeira chamada e devolve o mesmo nas próximas (um por container Lambda). */
export function lazy<T>(create: () => T): () => T {
  const box: { value?: T } = {};
  return () => {
    if (!('value' in box)) box.value = create();
    return box.value as T;
  };
}

/** Divide a lista em pedaços de até `size` itens, na ordem. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
}

/** `[0, 1, ..., n - 1]`, para repetir algo `n` vezes com `for (const i of range(n))`. */
export function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}
