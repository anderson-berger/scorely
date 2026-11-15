import { LocaleSchema } from '@scorely/contracts/src/users';
import { z } from 'zod';

/** ESP-02: id legível, que nunca muda. Vale para o esporte e para a posição (única dentro do esporte). */
const CATALOG_ID = /^[a-z0-9_]{2,40}$/;

export const SportIdSchema = z.string().regex(CATALOG_ID, 'Invalid sport id');
export type SportId = z.infer<typeof SportIdSchema>;

export const PositionIdSchema = z.string().regex(CATALOG_ID, 'Invalid position id');
export type PositionId = z.infer<typeof PositionIdSchema>;

/** ESP-03: texto em todos os idiomas do web (`LocaleSchema`). Faltou um → o sync recusa o catálogo. */
export const LocalizedTextSchema = z.object(
  Object.fromEntries(LocaleSchema.options.map((locale) => [locale, z.string().trim().min(1)])) as Record<
    z.infer<typeof LocaleSchema>,
    z.ZodString
  >,
);
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

/** Posição do esporte (TIM-02). Desativada (ESP-05): continua para quem já tem, mas não é escolhida de novo. */
export const SportPositionSchema = z.object({
  id: PositionIdSchema,
  name: LocalizedTextSchema,
  active: z.boolean(),
});
export type SportPosition = z.infer<typeof SportPositionSchema>;

/** Esporte do catálogo (ESP-01–06). As posições vêm na ordem de exibição (ESP-06). */
export const SportSchema = z.object({
  id: SportIdSchema,
  name: LocalizedTextSchema,
  positions: z.array(SportPositionSchema),
  active: z.boolean(),
});
export type Sport = z.infer<typeof SportSchema>;

/** GET /sports (ESP-07): todos os esportes, ativos e desativados, na ordem do catálogo (ESP-06). */
export const SportCatalogSchema = z.object({ sports: z.array(SportSchema) });
export type SportCatalog = z.infer<typeof SportCatalogSchema>;
