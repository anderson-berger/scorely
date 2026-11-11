import { z } from 'zod';
import { GroupRoleSchema, type Sport } from './groups';

/** Posições do esporte (TIM-02). O web traduz (`teams.positions.<valor>`). */
export const PlayerPositionSchema = z.enum([
  'setter',
  'opposite',
  'outside',
  'middle',
  'libero',
  'goalkeeper',
  'defender',
  'fullback',
  'defensive_mid',
  'midfielder',
  'forward',
  'guard',
  'wing',
  'center',
]);
export type PlayerPosition = z.infer<typeof PlayerPositionSchema>;

/** Catálogo de posições por esporte, na ordem de exibição (TIM-02). Esporte novo = entrada nova aqui. */
export const SPORT_POSITIONS = {
  volleyball: ['setter', 'opposite', 'outside', 'middle', 'libero'],
  soccer: ['goalkeeper', 'defender', 'fullback', 'defensive_mid', 'midfielder', 'forward'],
  basketball: ['guard', 'wing', 'center'],
  other: [],
} as const satisfies Record<Sport, readonly PlayerPosition[]>;

/** Posições sem repetição; a primeira é a principal. Se pertencem ao esporte do grupo, a api confere (`TEAM_POSITION_INVALID`). */
const PlayerPositionsSchema = z
  .array(PlayerPositionSchema)
  .refine((positions) => new Set(positions).size === positions.length, 'Positions must not repeat');

/** Jogador no grupo (TIM-01): membro, reserva ou convidado da lista atual, com as suas posições (a primeira é a principal). */
export const PlayerSchema = z.object({
  userId: z.uuid(),
  name: z.string().optional(),
  role: GroupRoleSchema,
  positions: z.array(PlayerPositionSchema),
});
export type Player = z.infer<typeof PlayerSchema>;

/** PUT /groups/{id}/players/{userId}: as posições da pessoa no grupo, a principal primeiro (substitui as anteriores). */
export const UpdatePlayerInputSchema = z.object({ positions: PlayerPositionsSchema });
export type UpdatePlayerInput = z.infer<typeof UpdatePlayerInputSchema>;
