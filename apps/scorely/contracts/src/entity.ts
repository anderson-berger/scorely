import { z } from 'zod';

/**
 * Campos que toda entidade tem. Os schemas de entidade estendem este (`EntitySchema.extend({...})`).
 * `createdAt` é ISO 8601 em UTC (`2026-11-05T14:32:10.123Z`); o web converte para o fuso do usuário.
 */
export const EntitySchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type Entity = z.infer<typeof EntitySchema>;

/**
 * A versão de um item (ADR 0013, 0016): começa em 1 e soma 1 a cada alteração. `0` = o item ainda não existe
 * (ex.: o jogo sem times). Toda edição manda a versão que a tela mostrou; diferente da atual → `VERSION_CONFLICT`.
 */
export const VersionSchema = z.number().int().min(0);
export type Version = z.infer<typeof VersionSchema>;

/** Corpo das ações e dos DELETEs que só mandam a versão (TIM-25, CMP-42). */
export const VersionInputSchema = z.object({ version: VersionSchema });
export type VersionInput = z.infer<typeof VersionInputSchema>;

/** `Nothing to update` de um PATCH parcial: a `version` sozinha não conta como mudança. */
export function hasChanges(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some((key) => key !== 'version');
}
