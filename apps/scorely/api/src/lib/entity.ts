import { randomUUID } from 'node:crypto';
import type { Entity } from '@scorely/contracts';

/**
 * Cria uma entidade nova com `id` e `createdAt` (ISO em UTC). Toda entidade nasce por aqui:
 * o service passa só os dados próprios e o seu `now()` (injetável nos testes).
 */
export function newEntity<T extends Entity>(data: Omit<T, keyof Entity>, at: Date = new Date()): T {
  return { ...data, id: randomUUID(), createdAt: at.toISOString() } as T;
}
