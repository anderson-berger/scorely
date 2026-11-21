import { VersionSchema } from '@scorely/contracts/src/entity';
import { z } from 'zod';

// Grupo v2 (docs/modules/grupos-v2.md, ADR 0017). Convive com o grupo antigo (`groups.ts`) até a troca.

/** Tamanho do id público do grupo (GRV-08). O alfabeto é o do usuário (`PUBLIC_USER_ID_ALPHABET`). */
export const PUBLIC_GROUP_ID_LENGTH = 8;

/**
 * Id público do grupo (GRV-08): o único id de grupo que a api devolve ou recebe. O uuid do sistema fica no banco.
 * Não é convite: saber o código não dá acesso (GRV-04).
 */
export const PublicGroupIdSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{8}$/, 'Invalid group id')
  .brand<'PublicGroupId'>();
export type PublicGroupId = z.infer<typeof PublicGroupIdSchema>;

/** GRV-01: de 1 a 80 caracteres, sem os espaços das pontas. Pode repetir (GRV-03). */
export const GroupNameV2Schema = z.string().trim().min(1, 'Name is required').max(80);

/** O papel de quem pede no grupo (GRV-02). Por enquanto, só o dono. */
export const GroupRoleV2Schema = z.enum(['owner']);
export type GroupRoleV2 = z.infer<typeof GroupRoleV2Schema>;

/** Corpo do `POST /v2/groups` (GRV-01): só o nome. */
export const CreateGroupV2InputSchema = z.object({ name: GroupNameV2Schema });
export type CreateGroupV2Input = z.infer<typeof CreateGroupV2InputSchema>;

/** Grupo como a api devolve (GRV-04, 05). O `id` é o público (GRV-08), por isso não estende o `EntitySchema`. */
export const GroupV2Schema = z.object({
  id: PublicGroupIdSchema,
  createdAt: z.iso.datetime(),
  version: VersionSchema,
  name: z.string(),
  myRole: GroupRoleV2Schema,
  /** Logo e capa (GRV-09, GRV-10): URLs públicas das mídias `group.logo` e `group.cover`, só quando existem. */
  logoUrl: z.url().optional(),
  coverUrl: z.url().optional(),
});
export type GroupV2 = z.infer<typeof GroupV2Schema>;
