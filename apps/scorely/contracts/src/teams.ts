import { z } from 'zod';
import { GroupRoleSchema, LocalDateSchema, type Sport } from './groups';

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

/** Times do jogo (TIM-06–14). Quantidade de times permitida (TIM-08). */
export const TEAM_COUNT = { min: 2, max: 8 } as const;

/** `draft`: só o dono vê; `published`: todos do grupo e o link do jogo (TIM-09). */
export const TeamsStatusSchema = z.enum(['draft', 'published']);
export type TeamsStatus = z.infer<typeof TeamsStatusSchema>;

/** Uma pessoa nos times (ou sem time), como a tela mostra. */
export const TeamPlayerSchema = z.object({
  userId: z.uuid(),
  name: z.string().optional(),
  role: GroupRoleSchema,
  /** As posições que valem no jogo: o ajuste do jogo ou, sem ele, as do grupo (TIM-13). A primeira é a principal. */
  positions: z.array(PlayerPositionSchema),
  /** O dono mudou as posições só neste jogo (TIM-13). */
  adjusted: z.boolean(),
  /** Ainda está na lista do jogo (dentro ou fila). `false` = "saiu da lista" (TIM-12). */
  inList: z.boolean(),
  /** Está na fila (o Banco), não dentro da lista (TIM-08). */
  bench: z.boolean(),
});
export type TeamPlayer = z.infer<typeof TeamPlayerSchema>;

/** Os times do jogo atual. `unassigned` ("sem time", TIM-08/12) só vem para o dono; para os outros, vazio. */
export const TeamsSchema = z.object({
  groupId: z.uuid(),
  date: LocalDateSchema,
  status: TeamsStatusSchema,
  teams: z.array(z.array(TeamPlayerSchema)),
  unassigned: z.array(TeamPlayerSchema),
  /** Quando foi a 1ª publicação (TIM-10). */
  publishedAt: z.iso.datetime().optional(),
});
export type Teams = z.infer<typeof TeamsSchema>;

/** GET dos times: `null` = não há times (ou é rascunho e quem pede não é o dono, TIM-09). */
export const TeamsResponseSchema = z.object({ teams: TeamsSchema.nullable() });
export type TeamsResponse = z.infer<typeof TeamsResponseSchema>;

/** PUT dos times: ids por time, na ordem, e os ajustes de posição só do jogo (TIM-08, 13). Não muda o status. */
export const SaveTeamsInputSchema = z.object({
  teams: z
    .array(z.array(z.uuid()))
    .min(TEAM_COUNT.min)
    .max(TEAM_COUNT.max)
    .refine((teams) => {
      const ids = teams.flat();
      return new Set(ids).size === ids.length;
    }, 'A person must be in one team only'),
  positions: z.record(z.uuid(), PlayerPositionsSchema),
});
export type SaveTeamsInput = z.infer<typeof SaveTeamsInputSchema>;
