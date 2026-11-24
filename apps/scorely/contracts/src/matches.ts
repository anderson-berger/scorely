import { VersionSchema } from '@scorely/contracts/src/entity';
import { GroupTierSchema } from '@scorely/contracts/src/groups';
import { PublicUserIdSchema, TimeZoneSchema, UserSchema } from '@scorely/contracts/src/users';
import { z } from 'zod';

// Partida (docs/modules/partidas.md).

/** Máximo de partidas por vir (que não terminaram) por grupo (PAR-01). */
export const MATCH_MAX_UPCOMING = 20;

/** Máximo de convidados `pending` + `approved` por partida (PAR-12). */
export const MATCH_GUEST_MAX = 30;

/** Máximo de repetições ativas (não encerradas) por grupo (PAR-20). */
export const MATCH_SERIES_MAX_ACTIVE = 10;

/** Quantos times a divisão tem (PAR-25). */
export const MATCH_TEAMS_LIMITS = { min: 2, max: 10 } as const;

/** Limites de PAR-01 e PAR-03. */
export const MATCH_LIMITS = {
  /** O início fica no futuro, até 90 dias. */
  startMaxDays: 90,
  /** O fim fica até 24 h depois do início. */
  durationMaxHours: 24,
  teams: { min: 1, max: 10 },
  playersPerTeam: { min: 1, max: 50 },
  slots: 100,
  /** As horas das ondas e do fechamento: de 0 a 336 (14 dias). */
  waveMaxHours: 336,
  guestName: 40,
} as const;

/**
 * A duração no painel de criar e no "Dia e hora" (PAR-17, 18), em minutos: livre de 1 min até 24 h, e o padrão. A tela converte a duração no fim; a api recebe o início e o fim (PAR-01).
 */
export const MATCH_DURATION = {
  defaultMinutes: 120,
  minMinutes: 1,
} as const;

/** Uma onda (PAR-03): quem pode confirmar agora. */
export const MatchWaveSchema = z.enum(['members', 'reserves', 'guests']);
export type MatchWave = z.infer<typeof MatchWaveSchema>;

/** A onda que dá para abrir à mão (PAR-05). */
export const AdvanceMatchWaveSchema = z.enum(['reserves', 'guests']);
export type AdvanceMatchWave = z.infer<typeof AdvanceMatchWaveSchema>;

/** Situação da partida, calculada pela hora (PAR-16). */
export const MatchStatusSchema = z.enum([
  'scheduled',
  'open',
  'closed',
  'in_progress',
  'finished',
  'cancelled',
]);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

/** A resposta de quem participa (PAR-08). */
export const AttendanceStatusSchema = z.enum(['going', 'not_going']);
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

/** Onde quem pede está na partida (PAR-17): dentro, na fila ou "não vou". Sem resposta: ausente. */
export const MyAttendanceSchema = z.enum(['in', 'queued', 'not_going']);
export type MyAttendance = z.infer<typeof MyAttendanceSchema>;

/** Situação do convidado (PAR-11). */
export const MatchGuestStatusSchema = z.enum(['pending', 'approved', 'declined', 'cancelled', 'removed']);
export type MatchGuestStatus = z.infer<typeof MatchGuestStatusSchema>;

const hours = z.number().int().min(0).max(MATCH_LIMITS.waveMaxHours);

/** O início e o fim (PAR-01): o que criar recebe. */
const MatchTimesSchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});
type MatchTimes = z.infer<typeof MatchTimesSchema>;

/**
 * As configurações da partida (PAR-06): o início e o fim, o formato e a abertura da lista. Tudo nasce vazio (PAR-01):
 * sem formato = sem limite (PAR-02); sem a hora de uma onda, ela abre com a anterior, e a dos membros desde a
 * criação (PAR-03).
 */
const MatchFieldsSchema = MatchTimesSchema.extend({
  /** O formato: os dois juntos, ou nenhum (PAR-02). */
  teams: z.number().int().min(MATCH_LIMITS.teams.min).max(MATCH_LIMITS.teams.max).optional(),
  playersPerTeam: z
    .number()
    .int()
    .min(MATCH_LIMITS.playersPerTeam.min)
    .max(MATCH_LIMITS.playersPerTeam.max)
    .optional(),
  membersHours: hours.optional(),
  reservesHours: hours.optional(),
  guestsHours: hours.optional(),
  /** "Sem convidados" (PAR-03, 12). */
  noGuests: z.boolean(),
  closeHours: hours,
});
type MatchFields = z.infer<typeof MatchFieldsSchema>;

const HOUR_MS = 3_600_000;

/** PAR-01: o fim depois do início, até 24 h. O "início no futuro, até 90 dias" a api confere. */
function checkMatchTimes(value: MatchTimes, ctx: z.RefinementCtx): void {
  const duration = Date.parse(value.endsAt) - Date.parse(value.startsAt);
  if (duration <= 0 || duration > MATCH_LIMITS.durationMaxHours * HOUR_MS) {
    ctx.addIssue({
      code: 'custom',
      path: ['endsAt'],
      message: 'End must be after the start, up to 24 hours',
    });
  }
}

/** O formato e a abertura da lista (PAR-02–04): o que a partida (PAR-06) e a repetição (PAR-22) configuram. */
type MatchSetup = Pick<
  MatchFields,
  'teams' | 'playersPerTeam' | 'membersHours' | 'reservesHours' | 'guestsHours' | 'noGuests' | 'closeHours'
>;

/** PAR-06: as horas, o formato e a abertura. */
function checkMatchFields(value: MatchFields, ctx: z.RefinementCtx): void {
  checkMatchTimes(value, ctx);
  checkMatchSetup(value, ctx);
}

/**
 * PAR-02–04: o formato inteiro ou nenhum, as vagas até 100 e as ondas em ordem (membros ≥ reservas ≥ convidados ≥
 * fechamento), contando a onda sem hora como aberta junto com a anterior.
 */
function checkMatchSetup(value: MatchSetup, ctx: z.RefinementCtx): void {
  if ((value.teams === undefined) !== (value.playersPerTeam === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['teams'], message: 'Teams and players per team go together' });
  } else if (value.teams !== undefined && value.teams * (value.playersPerTeam ?? 0) > MATCH_LIMITS.slots) {
    ctx.addIssue({ code: 'custom', path: ['playersPerTeam'], message: 'Too many slots' });
  }
  const members = value.membersHours ?? Number.POSITIVE_INFINITY;
  const reserves = value.reservesHours ?? members;
  const guests = value.guestsHours ?? reserves;
  if (reserves > members) {
    ctx.addIssue({ code: 'custom', path: ['reservesHours'], message: 'Reserves must open after members' });
  }
  if (!value.noGuests && guests > reserves) {
    ctx.addIssue({ code: 'custom', path: ['guestsHours'], message: 'Guests must open after reserves' });
  }
  if (value.closeHours > (value.noGuests ? reserves : guests)) {
    ctx.addIssue({ code: 'custom', path: ['closeHours'], message: 'Close must come after the last wave' });
  }
}

/**
 * Corpo do `POST /groups/{publicId}/matches` (PAR-01): só o início e o fim; o resto nasce vazio. Com `repeatWeekly`,
 * nasce também a repetição, no `timeZone` de quem cria (PAR-20), que aí é obrigatório e válido (a api guarda o nome
 * canônico, `TimeZoneSchema`). Sem o `repeatWeekly`, o `timeZone` é ignorado.
 */
export const CreateMatchInputSchema = MatchTimesSchema.extend({
  repeatWeekly: z.boolean().optional(),
  timeZone: z.string().optional(),
}).superRefine((value, ctx) => {
  checkMatchTimes(value, ctx);
  if (value.repeatWeekly === true && !TimeZoneSchema.safeParse(value.timeZone).success) {
    ctx.addIssue({ code: 'custom', path: ['timeZone'], message: 'Invalid time zone' });
  }
});
export type CreateMatchInput = z.infer<typeof CreateMatchInputSchema>;

/** Corpo do `PUT /groups/{publicId}/matches/{matchId}` (PAR-06): todas as configurações e a `version` (ADR 0016). */
export const UpdateMatchInputSchema = MatchFieldsSchema.extend({
  expectedVersion: VersionSchema,
}).superRefine(checkMatchFields);
export type UpdateMatchInput = z.infer<typeof UpdateMatchInputSchema>;

/** O dia da semana da repetição (PAR-20): 1 a 7, de segunda a domingo (ISO 8601). */
export const MatchWeekdaySchema = z.number().int().min(1).max(7);
export type MatchWeekday = z.infer<typeof MatchWeekdaySchema>;

/** A hora da repetição (PAR-20), `HH:mm`, no fuso dela. */
export const MatchSeriesTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time');

/** O que a repetição configura (PAR-20, 22): o dia da semana, a hora, a duração, o formato e a abertura. */
const MatchSeriesFieldsSchema = MatchFieldsSchema.omit({ startsAt: true, endsAt: true }).extend({
  weekday: MatchWeekdaySchema,
  time: MatchSeriesTimeSchema,
  /** De 1 min até 24 h (PAR-01, 17). */
  durationMinutes: z
    .number()
    .int()
    .min(MATCH_DURATION.minMinutes)
    .max(MATCH_LIMITS.durationMaxHours * 60),
});

/** Corpo do `PUT /groups/{publicId}/match-series/{seriesId}` (PAR-22): tudo, menos o fuso, e a `version` (ADR 0016). */
export const UpdateMatchSeriesInputSchema = MatchSeriesFieldsSchema.extend({
  expectedVersion: VersionSchema,
}).superRefine(checkMatchSetup);
export type UpdateMatchSeriesInput = z.infer<typeof UpdateMatchSeriesInputSchema>;

/** A repetição, como vem na partida que ela criou (PAR-16). */
export const MatchSeriesSchema = MatchSeriesFieldsSchema.extend({
  id: z.uuid(),
  /** O fuso de quem criou (PAR-20); não muda. */
  timeZone: z.string(),
  /** Encerrada (PAR-23); ausente = ativa. */
  endedAt: z.iso.datetime().optional(),
  version: VersionSchema,
});
export type MatchSeries = z.infer<typeof MatchSeriesSchema>;

/** Corpo do `POST .../advance` (PAR-05). */
export const AdvanceMatchInputSchema = z.object({ wave: AdvanceMatchWaveSchema });
export type AdvanceMatchInput = z.infer<typeof AdvanceMatchInputSchema>;

/** Corpo do `PUT .../attendance` (PAR-08). */
export const SetAttendanceInputSchema = z.object({ status: AttendanceStatusSchema });
export type SetAttendanceInput = z.infer<typeof SetAttendanceInputSchema>;

/** PAR-12: de 1 a 40 caracteres, sem os espaços das pontas. */
export const MatchGuestNameSchema = z.string().trim().min(1, 'Name is required').max(MATCH_LIMITS.guestName);

/** Corpo do `POST .../guests` (PAR-12). */
export const RequestMatchGuestInputSchema = z.object({ name: MatchGuestNameSchema });
export type RequestMatchGuestInput = z.infer<typeof RequestMatchGuestInputSchema>;

/** Um lugar na lista (PAR-09, 16): quem participa, com a participação, ou um convidado liberado. */
export const MatchEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('player'), user: UserSchema, tier: GroupTierSchema }),
  z.object({
    kind: z.literal('guest'),
    guestId: z.uuid(),
    name: z.string(),
    /** Quem trouxe ("convidado de Fulano"). */
    requestedBy: UserSchema,
    /** Quem pede pode tirar este convidado (PAR-14). */
    removable: z.boolean(),
  }),
]);
export type MatchEntry = z.infer<typeof MatchEntrySchema>;

/** Quem disse "não vou" (PAR-16). */
export const MatchNotGoingSchema = z.object({ user: UserSchema, tier: GroupTierSchema });
export type MatchNotGoing = z.infer<typeof MatchNotGoingSchema>;

/** Um pedido de convidado esperando (PAR-12, 16): só para quem tem `matches.manage` e para quem pediu. */
export const MatchGuestRequestSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  requestedBy: UserSchema,
  createdAt: z.iso.datetime(),
  /** Quem pede pode liberar e recusar (PAR-13). */
  decidable: z.boolean(),
  /** Quem pede pode desistir do pedido (PAR-14: só quem pediu). */
  cancellable: z.boolean(),
});
export type MatchGuestRequest = z.infer<typeof MatchGuestRequestSchema>;

/** Uma pessoa num time, como vai ao salvar (PAR-25): o id público de quem tem conta, ou o id do convidado. */
export const MatchTeamPlayerRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), id: PublicUserIdSchema }),
  z.object({ kind: z.literal('guest'), id: z.uuid() }),
]);
export type MatchTeamPlayerRef = z.infer<typeof MatchTeamPlayerRefSchema>;

/**
 * Corpo do `PUT .../teams` (PAR-25): os times, na ordem, cada um com as pessoas, e a `version` dos times que a tela
 * mostrou (0 sem times, ADR 0016). Cada pessoa num time só; de 2 a 10 times; um time pode ficar vazio.
 */
export const SaveMatchTeamsInputSchema = z
  .object({
    teams: z.array(z.array(MatchTeamPlayerRefSchema)).min(MATCH_TEAMS_LIMITS.min).max(MATCH_TEAMS_LIMITS.max),
    expectedVersion: VersionSchema,
  })
  .superRefine((value, ctx) => {
    const keys = value.teams.flat().map((p) => `${p.kind}:${p.id}`);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: 'custom', path: ['teams'], message: 'A person can be in one team only' });
    }
  });
export type SaveMatchTeamsInput = z.infer<typeof SaveMatchTeamsInputSchema>;

/**
 * Uma pessoa num time salvo (PAR-27, 28), com a marca `left` de quem não está mais dentro. A participação (`tier`)
 * fica ausente para quem saiu do grupo.
 */
export const MatchTeamMemberSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('player'),
    user: UserSchema,
    tier: GroupTierSchema.optional(),
    left: z.boolean(),
  }),
  z.object({
    kind: z.literal('guest'),
    guestId: z.uuid(),
    name: z.string(),
    requestedBy: UserSchema,
    left: z.boolean(),
  }),
]);
export type MatchTeamMember = z.infer<typeof MatchTeamMemberSchema>;

/** Os times salvos da partida (PAR-16, 27, 28). */
export const MatchLineupSchema = z.object({
  /** Os times, na ordem ("Time 1", "Time 2"...), com as pessoas na ordem salva. */
  list: z.array(z.array(MatchTeamMemberSchema)),
  /** Quem está dentro e não está em nenhum time (PAR-28), na ordem da lista. */
  unassigned: z.array(MatchEntrySchema),
  /** Para o `expectedVersion` do salvar (PAR-25). */
  version: VersionSchema,
});
export type MatchLineup = z.infer<typeof MatchLineupSchema>;

/** A hora em que cada onda abre e a lista fecha (PAR-03, 04), já com o que foi aberto à mão (PAR-05). */
export const MatchWavesSchema = z.object({
  members: z.iso.datetime(),
  reserves: z.iso.datetime(),
  /** Ausente = "sem convidados" e ainda não aberta à mão. */
  guests: z.iso.datetime().optional(),
  close: z.iso.datetime(),
});
export type MatchWaves = z.infer<typeof MatchWavesSchema>;

/** A partida na lista (PAR-15). */
export const MatchSummarySchema = z.object({
  id: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  /** O formato; ausente = sem limite de vagas (PAR-02). */
  teams: z.number().int().positive().optional(),
  playersPerTeam: z.number().int().positive().optional(),
  status: MatchStatusSchema,
  /** A onda aberta agora; ausente antes da onda dos membros (só com a hora dela configurada). */
  wave: MatchWaveSchema.optional(),
  /** Quantos estão dentro (PAR-09). */
  confirmed: z.number().int().nonnegative(),
  myAttendance: MyAttendanceSchema.optional(),
  /** O dia da semana da repetição de onde a partida saiu, só com ela ativa (PAR-15, 17: "Toda sexta"). */
  seriesWeekday: MatchWeekdaySchema.optional(),
});
export type MatchSummary = z.infer<typeof MatchSummarySchema>;

/** O que quem pede pode fazer agora (PAR-16). A tela só mostra essas ações; a api confere de novo. */
export const MatchActionsSchema = z.object({
  /** Dizer "vou" (PAR-08). */
  going: z.boolean(),
  /** Dizer "não vou" (PAR-08). */
  notGoing: z.boolean(),
  /** Pedir convidado (PAR-12). */
  requestGuest: z.boolean(),
  /** Tem `matches.manage` (editar, cancelar, abrir onda, decidir convidados), com a partida ainda não começada. */
  manage: z.boolean(),
  /** Tem `matches.manage`, com a partida não terminada nem cancelada: dividir ou mudar os times (PAR-25, 30). */
  manageTeams: z.boolean(),
});
export type MatchActions = z.infer<typeof MatchActionsSchema>;

/** A partida como a página mostra (PAR-16). Toda ação sobre a partida responde com ela de novo. */
export const MatchSchema = MatchSummarySchema.extend({
  createdAt: z.iso.datetime(),
  version: VersionSchema,
  /** A abertura da lista como foi configurada (PAR-03); a hora ausente não foi configurada. */
  membersHours: hours.optional(),
  reservesHours: hours.optional(),
  guestsHours: hours.optional(),
  noGuests: z.boolean(),
  closeHours: hours,
  /** As horas em que cada onda abre, já calculadas (a sem hora configurada abre com a anterior, ou na criação). */
  waves: MatchWavesSchema,
  cancelledAt: z.iso.datetime().optional(),
  /** Dentro, na ordem (PAR-09). */
  in: z.array(MatchEntrySchema),
  /** A fila, na ordem (PAR-09). */
  queue: z.array(MatchEntrySchema),
  notGoing: z.array(MatchNotGoingSchema),
  /** Os pedidos de convidado `pending` que quem pede pode ver. */
  guestRequests: z.array(MatchGuestRequestSchema),
  actions: MatchActionsSchema,
  /** A repetição de onde a partida saiu, encerrada ou não (PAR-16, 22). */
  series: MatchSeriesSchema.optional(),
  /** Os times salvos (PAR-27); ausente sem times. */
  lineup: MatchLineupSchema.optional(),
});
export type Match = z.infer<typeof MatchSchema>;
