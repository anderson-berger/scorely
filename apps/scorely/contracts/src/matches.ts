import { VersionSchema } from '@scorely/contracts/src/entity';
import { GroupTierSchema } from '@scorely/contracts/src/groups';
import { UserSchema } from '@scorely/contracts/src/users';
import { z } from 'zod';

// Partida (docs/modules/partidas.md).

/** Máximo de partidas por vir (que não terminaram) por grupo (PAR-01). */
export const MATCH_MAX_UPCOMING = 20;

/** Máximo de convidados `pending` + `approved` por partida (PAR-12). */
export const MATCH_GUEST_MAX = 30;

/** Limites de PAR-01 e PAR-03. */
export const MATCH_LIMITS = {
  /** O início fica no futuro, até 90 dias. */
  startMaxDays: 90,
  /** O fim fica até 24 h depois do início. */
  durationMaxHours: 24,
  note: 200,
  teams: { min: 1, max: 10 },
  playersPerTeam: { min: 1, max: 50 },
  slots: 100,
  /** As horas das ondas e do fechamento: de 0 a 336 (14 dias). */
  waveMaxHours: 336,
  guestName: 40,
} as const;

/**
 * A duração no painel de criar e no "Dia e hora" (PAR-17, 18): as opções prontas, o padrão e o passo da "outra",
 * em minutos. A tela converte a duração no fim; a api recebe o início e o fim (PAR-01).
 */
export const MATCH_DURATION = {
  defaultMinutes: 120,
  optionsMinutes: [60, 90, 120, 180],
  stepMinutes: 30,
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

/** As configurações da partida (PAR-06): o início e o fim, o formato, as ondas e o recado. */
const MatchFieldsSchema = MatchTimesSchema.extend({
  note: z.string().trim().min(1).max(MATCH_LIMITS.note).optional(),
  teams: z.number().int().min(MATCH_LIMITS.teams.min).max(MATCH_LIMITS.teams.max),
  playersPerTeam: z.number().int().min(MATCH_LIMITS.playersPerTeam.min).max(MATCH_LIMITS.playersPerTeam.max),
  membersHours: hours,
  reservesHours: hours,
  /** Ausente = a onda de convidados desligada (PAR-03). */
  guestsHours: hours.optional(),
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

/** PAR-02–04, 06: as horas, as vagas até 100 e as ondas em ordem (membros ≥ reservas ≥ convidados ≥ fechamento). */
function checkMatchFields(value: MatchFields, ctx: z.RefinementCtx): void {
  checkMatchTimes(value, ctx);
  if (value.teams * value.playersPerTeam > MATCH_LIMITS.slots) {
    ctx.addIssue({ code: 'custom', path: ['playersPerTeam'], message: 'Too many slots' });
  }
  if (value.reservesHours > value.membersHours) {
    ctx.addIssue({ code: 'custom', path: ['reservesHours'], message: 'Reserves must open after members' });
  }
  const lastWave = value.guestsHours ?? value.reservesHours;
  if (value.guestsHours !== undefined && value.guestsHours > value.reservesHours) {
    ctx.addIssue({ code: 'custom', path: ['guestsHours'], message: 'Guests must open after reserves' });
  }
  if (value.closeHours > lastWave) {
    ctx.addIssue({ code: 'custom', path: ['closeHours'], message: 'Close must come after the last wave' });
  }
}

/** Corpo do `POST /groups/{publicId}/matches` (PAR-01): só o início e o fim; o resto a api põe no padrão. */
export const CreateMatchInputSchema = MatchTimesSchema.superRefine(checkMatchTimes);
export type CreateMatchInput = z.infer<typeof CreateMatchInputSchema>;

/** Corpo do `PUT /groups/{publicId}/matches/{matchId}` (PAR-06): todas as configurações e a `version` (ADR 0016). */
export const UpdateMatchInputSchema = MatchFieldsSchema.extend({
  expectedVersion: VersionSchema,
}).superRefine(checkMatchFields);
export type UpdateMatchInput = z.infer<typeof UpdateMatchInputSchema>;

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

/** A hora em que cada onda abre e a lista fecha (PAR-03, 04), já com o que foi aberto à mão (PAR-05). */
export const MatchWavesSchema = z.object({
  members: z.iso.datetime(),
  reserves: z.iso.datetime(),
  /** Ausente = a onda de convidados desligada e ainda não aberta à mão. */
  guests: z.iso.datetime().optional(),
  close: z.iso.datetime(),
});
export type MatchWaves = z.infer<typeof MatchWavesSchema>;

/** A partida na lista (PAR-15). */
export const MatchSummarySchema = z.object({
  id: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  note: z.string().optional(),
  teams: z.number().int().positive(),
  playersPerTeam: z.number().int().positive(),
  status: MatchStatusSchema,
  /** A onda aberta agora; ausente antes da onda dos membros. */
  wave: MatchWaveSchema.optional(),
  /** Quantos estão dentro (PAR-09). */
  confirmed: z.number().int().nonnegative(),
  myAttendance: MyAttendanceSchema.optional(),
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
});
export type MatchActions = z.infer<typeof MatchActionsSchema>;

/** A partida como a página mostra (PAR-16). Toda ação sobre a partida responde com ela de novo. */
export const MatchSchema = MatchSummarySchema.extend({
  createdAt: z.iso.datetime(),
  version: VersionSchema,
  membersHours: hours,
  reservesHours: hours,
  guestsHours: hours.optional(),
  closeHours: hours,
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
});
export type Match = z.infer<typeof MatchSchema>;
