import { z } from 'zod';
import { EntitySchema } from './entity';
import { TimeZoneSchema } from './users';

/** Esportes do grupo. O web traduz o nome (`sports.<valor>`). */
export const SportSchema = z.enum(['volleyball', 'soccer', 'basketball', 'other']);
export type Sport = z.infer<typeof SportSchema>;

/** Dia da semana no fuso do grupo: 0 = domingo ... 6 = sábado. */
export const WeekdaySchema = z.number().int().min(0).max(6);

/** Hora local `HH:mm` (24 h). */
export const LocalTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time');

/** Data local `YYYY-MM-DD` no fuso do grupo (identifica o jogo nas rotas). */
export const LocalDateSchema = z.iso.date();

export const GROUP_LIMITS = {
  slots: { min: 2, max: 50 },
  listOpensHoursBefore: { min: 1, max: 144 },
} as const;

const SlotsSchema = z.number().int().min(GROUP_LIMITS.slots.min).max(GROUP_LIMITS.slots.max);
const ListOpensHoursBeforeSchema = z
  .number()
  .int()
  .min(GROUP_LIMITS.listOpensHoursBefore.min)
  .max(GROUP_LIMITS.listOpensHoursBefore.max);

/** POST /groups. Sem `timeZone`: o do perfil do dono, ou `America/Sao_Paulo`. */
export const CreateGroupInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  sport: SportSchema,
  weekday: WeekdaySchema,
  time: LocalTimeSchema,
  timeZone: TimeZoneSchema.optional(),
  location: z.string().trim().min(1).max(120).optional(),
  slots: SlotsSchema,
  listOpensHoursBefore: ListOpensHoursBeforeSchema,
});
export type CreateGroupInput = z.infer<typeof CreateGroupInputSchema>;

/**
 * Grupo como a api devolve. `inviteToken` só vem para o dono.
 * `timeZone` é texto livre na leitura: a api já validou ao gravar (plano 003, D13).
 */
export const GroupSchema = EntitySchema.extend({
  name: z.string(),
  sport: SportSchema,
  weekday: WeekdaySchema,
  time: LocalTimeSchema,
  timeZone: z.string(),
  location: z.string().optional(),
  slots: z.number().int(),
  listOpensHoursBefore: z.number().int(),
  ownerId: z.uuid(),
  inviteToken: z.string().optional(),
});
export type Group = z.infer<typeof GroupSchema>;

/** POST /groups/{id}/invite: o link novo (o anterior deixa de valer). */
export const InviteSchema = z.object({ inviteToken: z.string() });
export type Invite = z.infer<typeof InviteSchema>;

export const MemberSchema = z.object({
  userId: z.uuid(),
  name: z.string().optional(),
  isOwner: z.boolean(),
});
export type Member = z.infer<typeof MemberSchema>;

export const GameStatusSchema = z.enum(['scheduled', 'open', 'in_progress', 'cancelled']);
export type GameStatus = z.infer<typeof GameStatusSchema>;

export const AttendeeSchema = z.object({
  userId: z.uuid(),
  name: z.string().optional(),
  confirmedAt: z.iso.datetime(),
});
export type Attendee = z.infer<typeof AttendeeSchema>;

/** Onde o usuário logado está na lista: dentro ou na fila, com a posição (1 = primeiro) naquela parte. */
export const MyAttendanceSchema = z.object({
  list: z.enum(['confirmed', 'waitlist']),
  position: z.number().int().positive(),
});
export type MyAttendance = z.infer<typeof MyAttendanceSchema>;

/** Jogo da semana (pode ser "virtual": ainda sem item no banco, com a lista vazia). Instantes em UTC. */
export const GameSchema = z.object({
  groupId: z.uuid(),
  date: LocalDateSchema,
  startsAt: z.iso.datetime(),
  opensAt: z.iso.datetime(),
  status: GameStatusSchema,
  slots: z.number().int(),
  confirmed: z.array(AttendeeSchema),
  waitlist: z.array(AttendeeSchema),
  me: MyAttendanceSchema.optional(),
});
export type Game = z.infer<typeof GameSchema>;

/** GET /me/groups: cada grupo com o resumo do jogo atual. */
export const MyGroupSchema = GroupSchema.extend({
  game: GameSchema.pick({ date: true, startsAt: true, status: true, slots: true, me: true }).extend({
    confirmedCount: z.number().int().nonnegative(),
  }),
});
export type MyGroup = z.infer<typeof MyGroupSchema>;
