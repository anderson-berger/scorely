import { VersionSchema } from '@scorely/contracts/src/entity';
import { z } from 'zod';

/** Lugares do grupo (GRP-60–63): limites dos campos e quantos ativos o grupo tem. */
export const PLACE_LIMITS = {
  /** GRP-60: lugares ativos por grupo. */
  perGroup: 10,
  name: { min: 1, max: 60 },
  street: { max: 120 },
  number: { max: 20 },
  district: { max: 60 },
  city: { max: 60 },
  state: { max: 60 },
  postalCode: { max: 12 },
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);

/** GRP-60: o endereço do lugar. O país é o código de 2 letras (padrão `BR`). */
export const PlaceAddressSchema = z.object({
  street: text(PLACE_LIMITS.street.max),
  number: text(PLACE_LIMITS.number.max).optional(),
  district: text(PLACE_LIMITS.district.max).optional(),
  city: text(PLACE_LIMITS.city.max),
  state: text(PLACE_LIMITS.state.max),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((c) => c.toUpperCase())
    .default('BR'),
  postalCode: text(PLACE_LIMITS.postalCode.max).optional(),
});
export type PlaceAddress = z.infer<typeof PlaceAddressSchema>;

/** POST /groups/{id}/places (GRP-60): nome, endereço e o ponto no mapa. */
export const PlaceInputSchema = z.object({
  name: text(PLACE_LIMITS.name.max),
  address: PlaceAddressSchema,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type PlaceInput = z.input<typeof PlaceInputSchema>;

/** PUT /groups/{id}/places/{placeId} (GRP-60): o lugar inteiro, com a versão que a tela mostrou (ADR 0016). */
export const UpdatePlaceInputSchema = PlaceInputSchema.extend({ version: VersionSchema });
export type UpdatePlaceInput = z.input<typeof UpdatePlaceInputSchema>;

/** Um lugar do grupo (GRP-60, 61). `archivedAt` = arquivado: fora da escolha e do limite. */
export const PlaceSchema = PlaceInputSchema.extend({
  id: z.uuid(),
  version: VersionSchema,
  address: PlaceAddressSchema.extend({ country: z.string() }),
  archivedAt: z.iso.datetime().optional(),
});
export type Place = z.infer<typeof PlaceSchema>;
