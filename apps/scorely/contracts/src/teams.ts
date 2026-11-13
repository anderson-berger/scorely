import { GroupRoleSchema, LocalDateSchema, type Sport } from '@scorely/contracts/src/groups';
import { GenderSchema, PublicUserIdSchema } from '@scorely/contracts/src/users';
import { z } from 'zod';

/** Quem está nos times: uma pessoa (id público, USR-16) ou um avulso do jogo (uuid gerado pelo web, TIM-24). */
export const TeamPersonIdSchema = z.union([PublicUserIdSchema, z.uuid()]);
export type TeamPersonId = z.infer<typeof TeamPersonIdSchema>;

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
  userId: PublicUserIdSchema,
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

/** Limites da configuração de times (TIM-18). */
export const TEAM_RULE_LIMITS = { count: { min: 0, max: 50 }, rules: 10 } as const;

/** O que a regra conta (TIM-18): quem tem a posição como principal no jogo, ou quem é do gênero pelo perfil. */
export const TeamRuleTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('position'), position: PlayerPositionSchema }),
  z.object({ kind: z.literal('gender'), gender: GenderSchema }),
]);
export type TeamRuleTarget = z.infer<typeof TeamRuleTargetSchema>;

const RuleCountSchema = z.number().int().min(TEAM_RULE_LIMITS.count.min).max(TEAM_RULE_LIMITS.count.max);

/** "Todo time tem no mínimo `min` e/ou no máximo `max`" do alvo (TIM-18). */
export const TeamRuleSchema = z
  .object({ target: TeamRuleTargetSchema, min: RuleCountSchema.optional(), max: RuleCountSchema.optional() })
  .refine((rule) => rule.min !== undefined || rule.max !== undefined, 'A rule needs a min or a max')
  .refine(
    (rule) => rule.min === undefined || rule.max === undefined || rule.min <= rule.max,
    'Min must not exceed max',
  );
export type TeamRule = z.infer<typeof TeamRuleSchema>;

/** Chave do alvo: uma regra por posição ou gênero (TIM-18). */
export function teamRuleKey(target: TeamRuleTarget): string {
  return target.kind === 'position' ? `position:${target.position}` : `gender:${target.gender}`;
}

/** Limites dos times opostos (TIM-22): pessoas por regra e regras por grupo. */
export const TEAM_APART_LIMITS = { people: { min: 2, max: 8 }, rules: 10 } as const;

/** TIM-22: "estas pessoas sempre em times diferentes" (cada uma num time diferente das outras). */
export const TeamApartRuleSchema = z.object({
  people: z
    .array(PublicUserIdSchema)
    .min(TEAM_APART_LIMITS.people.min)
    .max(TEAM_APART_LIMITS.people.max)
    .refine((people) => new Set(people).size === people.length, 'People must not repeat'),
});
export type TeamApartRule = z.infer<typeof TeamApartRuleSchema>;

/** PUT /groups/{id}/team-settings: a configuração inteira (TIM-17). */
export const UpdateTeamSettingsInputSchema = z.object({
  teamCount: z.number().int().min(TEAM_COUNT.min).max(TEAM_COUNT.max),
  rules: z
    .array(TeamRuleSchema)
    .max(TEAM_RULE_LIMITS.rules)
    .refine(
      (rules) => new Set(rules.map((r) => teamRuleKey(r.target))).size === rules.length,
      'One rule per target',
    ),
  /** Times opostos (TIM-22). Pode faltar (vale `[]`). */
  apart: z.array(TeamApartRuleSchema).max(TEAM_APART_LIMITS.rules).default([]),
  /** Preferência "Espalhar homens e mulheres" (TIM-23). Pode faltar (vale `false`). */
  spreadGender: z.boolean().default(false),
  allowOutsideRules: z.boolean(),
});
/** Tipo de entrada: `apart` e `spreadGender` podem faltar. */
export type UpdateTeamSettingsInput = z.input<typeof UpdateTeamSettingsInputSchema>;

/**
 * Configuração de times do grupo (TIM-17). Sem nada salvo: 2 times, sem regras, sem opostos, não espalha, não permite
 * publicar fora. `names`: o nome de cada pessoa dos times opostos (inclusive quem saiu do grupo), para a tela.
 */
export const TeamSettingsSchema = UpdateTeamSettingsInputSchema.extend({
  apart: z.array(TeamApartRuleSchema).max(TEAM_APART_LIMITS.rules),
  spreadGender: z.boolean(),
  names: z.record(PublicUserIdSchema, z.string()),
});
export type TeamSettings = z.infer<typeof TeamSettingsSchema>;

/**
 * O que está fora das regras num time (TIM-20). `team` a partir de 1.
 * `count`: o time tem `count` do alvo da regra de quantidade. `apart`: `people` (2 ou mais) de uma regra de times opostos estão juntas.
 */
export const TeamViolationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('count'),
    team: z.number().int().positive(),
    rule: TeamRuleSchema,
    count: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('apart'),
    team: z.number().int().positive(),
    people: z.array(PublicUserIdSchema).min(2),
  }),
]);
export type TeamViolation = z.infer<typeof TeamViolationSchema>;

/** O que impede o sorteio (TIM-19). */
export const TeamRuleConflictSchema = z.discriminatedUnion('reason', [
  /** O mínimo de todos os times precisa de `needed`, e o sorteio tem `available` do alvo. */
  z.object({
    reason: z.literal('not_enough'),
    rule: TeamRuleSchema,
    needed: z.number().int().nonnegative(),
    available: z.number().int().nonnegative(),
  }),
  /** O máximo de todos os times cabe `capacity`, e o sorteio tem `available` do alvo. */
  z.object({
    reason: z.literal('too_many'),
    rule: TeamRuleSchema,
    capacity: z.number().int().nonnegative(),
    available: z.number().int().nonnegative(),
  }),
  /** Os fixados do time `team` já passam do máximo (`count` do alvo). */
  z.object({
    reason: z.literal('pinned'),
    rule: TeamRuleSchema,
    team: z.number().int().positive(),
    count: z.number().int().nonnegative(),
  }),
  /** TIM-22: `people` (os da regra que estão no sorteio) não cabem em `teams` times diferentes. */
  z.object({
    reason: z.literal('apart_too_many'),
    people: z.array(PublicUserIdSchema).min(2),
    teams: z.number().int().positive(),
  }),
  /** TIM-22: `people` da mesma regra de times opostos estão fixadas juntas no time `team`. */
  z.object({
    reason: z.literal('apart_pinned'),
    people: z.array(PublicUserIdSchema).min(2),
    team: z.number().int().positive(),
  }),
  /** Cada regra dá sozinha, mas não todas juntas com esses tamanhos. */
  z.object({ reason: z.literal('unsolvable') }),
]);
export type TeamRuleConflict = z.infer<typeof TeamRuleConflictSchema>;

/** Avulsos por jogo (TIM-24). */
export const TEAM_EXTRA_LIMITS = { name: { min: 1, max: 40 }, perGame: 20 } as const;

/** TIM-24: pessoa sem conta só nos times deste jogo. O id é gerado pelo web. */
export const TeamExtraSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(TEAM_EXTRA_LIMITS.name.min).max(TEAM_EXTRA_LIMITS.name.max),
  gender: GenderSchema.optional(),
  /** A primeira é a principal (TIM-02). Do esporte do grupo: a api confere (`TEAM_POSITION_INVALID`). */
  positions: PlayerPositionsSchema,
});
export type TeamExtra = z.infer<typeof TeamExtraSchema>;

/** Uma pessoa nos times (ou sem time), como a tela mostra. `userId`: o id público, ou o id do avulso (TIM-24). */
export const TeamPlayerSchema = z.object({
  userId: TeamPersonIdSchema,
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
  /** O dono fixou a pessoa no time: o sorteio não a move (TIM-16). Sempre `false` para quem não é dono. */
  pinned: z.boolean(),
  /** Avulso do jogo (TIM-24): sem conta, `role` = `guest`, `inList` = true, `bench` = false. */
  extra: z.boolean(),
  /** Só do avulso: o gênero dele, para o dono editar (TIM-24). */
  gender: GenderSchema.optional(),
});
export type TeamPlayer = z.infer<typeof TeamPlayerSchema>;

/** Homens e mulheres de um time (TIM-23). */
export const TeamGendersSchema = z.object({
  M: z.number().int().nonnegative(),
  F: z.number().int().nonnegative(),
});
export type TeamGenders = z.infer<typeof TeamGendersSchema>;

/** Os times do jogo atual. `unassigned` ("sem time", TIM-08/12) só vem para o dono; para os outros, vazio. */
export const TeamsSchema = z.object({
  groupId: z.uuid(),
  date: LocalDateSchema,
  status: TeamsStatusSchema,
  teams: z.array(z.array(TeamPlayerSchema)),
  unassigned: z.array(TeamPlayerSchema),
  /** Quando foi a 1ª publicação (TIM-10). */
  publishedAt: z.iso.datetime().optional(),
  /** O que está fora das regras do grupo em cada time (TIM-20). Só vem para o dono. */
  violations: z.array(TeamViolationSchema).optional(),
  /** Homens e mulheres de cada time, na ordem dos times. Só com "Espalhar homens e mulheres" ligada (TIM-23), para todos. */
  genders: z.array(TeamGendersSchema).optional(),
});
export type Teams = z.infer<typeof TeamsSchema>;

/** GET dos times: `null` = não há times (ou é rascunho e quem pede não é o dono, TIM-09). */
export const TeamsResponseSchema = z.object({
  teams: TeamsSchema.nullable(),
  /** Quantidade padrão de times do grupo (TIM-17), para "Montar à mão". Só vem para o dono. */
  defaultTeamCount: z.number().int().min(TEAM_COUNT.min).max(TEAM_COUNT.max).optional(),
});
export type TeamsResponse = z.infer<typeof TeamsResponseSchema>;

/** PUT dos times: ids por time, na ordem, os ajustes de posição só do jogo, quem está fixo e os avulsos (TIM-08, 13, 16, 24). Não muda o status. */
export const SaveTeamsInputSchema = z
  .object({
    teams: z
      .array(z.array(TeamPersonIdSchema))
      .min(TEAM_COUNT.min)
      .max(TEAM_COUNT.max)
      .refine((teams) => {
        const ids = teams.flat();
        return new Set(ids).size === ids.length;
      }, 'A person must be in one team only'),
    positions: z.record(TeamPersonIdSchema, PlayerPositionsSchema),
    /** Quem está fixo no time em que está (TIM-16). */
    pinned: z.array(TeamPersonIdSchema).default([]),
    /** Os avulsos do jogo, inteiros (TIM-24): quem não vier aqui deixa de existir. */
    extras: z
      .array(TeamExtraSchema)
      .max(TEAM_EXTRA_LIMITS.perGame)
      .default([])
      .refine((extras) => new Set(extras.map((e) => e.id)).size === extras.length, 'Extras must not repeat'),
  })
  .refine((input) => {
    const placed = new Set(input.teams.flat());
    return input.pinned.every((id) => placed.has(id));
  }, 'Only a person in a team can be pinned')
  .refine((input) => {
    const extras = new Set(input.extras.map((e) => e.id));
    return Object.keys(input.positions).every((id) => !extras.has(id));
  }, 'Extra positions go in the extra');
/** Tipo de entrada: `pinned` e `extras` podem faltar (valem `[]`). */
export type SaveTeamsInput = z.input<typeof SaveTeamsInputSchema>;
