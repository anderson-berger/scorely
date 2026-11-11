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
  reservesOpenHoursBefore: { min: 0, max: 144 },
  guestsOpenHoursBefore: { min: 0, max: 144 },
  /** Limites do grupo (GRP-38): membros contando o dono; reservas 0 = não aceita reservas. */
  maxMembers: { min: 2, max: 30 },
  maxReserves: { min: 0, max: 30 },
} as const;

const MaxMembersSchema = z.number().int().min(GROUP_LIMITS.maxMembers.min).max(GROUP_LIMITS.maxMembers.max);
const MaxReservesSchema = z
  .number()
  .int()
  .min(GROUP_LIMITS.maxReserves.min)
  .max(GROUP_LIMITS.maxReserves.max);

const SlotsSchema = z.number().int().min(GROUP_LIMITS.slots.min).max(GROUP_LIMITS.slots.max);
const ListOpensHoursBeforeSchema = z
  .number()
  .int()
  .min(GROUP_LIMITS.listOpensHoursBefore.min)
  .max(GROUP_LIMITS.listOpensHoursBefore.max);

const LayerHoursSchema = z.number().int().min(0).max(144);

/** Papel de quem participa do jogo (plano 007): membro e reserva são do grupo; convidado vem pelo link do jogo. */
export const GroupRoleSchema = z.enum(['member', 'reserve', 'guest']);
export type GroupRole = z.infer<typeof GroupRoleSchema>;
export const MemberRoleSchema = GroupRoleSchema.exclude(['guest']);
export type MemberRole = z.infer<typeof MemberRoleSchema>;

/** Qual link: de membro e de reserva (`/join`) ou do jogo, para convidados (`/play`). */
export const InviteKindSchema = z.enum(['member', 'reserve', 'guest']);
export type InviteKind = z.infer<typeof InviteKindSchema>;

/** Camadas da lista (plano 007, D2): membros ≥ reservas ≥ convidados, em horas antes do início. */
interface Layers {
  listOpensHoursBefore: number;
  reservesOpenHoursBefore: number;
  guestsOpenHoursBefore?: number | null | undefined;
}

/** O campo que quebra a ordem das camadas, ou `undefined` se está tudo certo. */
function layersViolation(l: Layers): 'reservesOpenHoursBefore' | 'guestsOpenHoursBefore' | undefined {
  if (l.reservesOpenHoursBefore > l.listOpensHoursBefore) return 'reservesOpenHoursBefore';
  if (l.guestsOpenHoursBefore != null && l.guestsOpenHoursBefore > l.reservesOpenHoursBefore) {
    return 'guestsOpenHoursBefore';
  }
  return undefined;
}

const LAYERS_MESSAGE = 'Layers must open in order: members, reserves, guests';

/** As 3 camadas juntas, já com os valores finais. A api valida com ele o grupo depois de um PATCH. */
export const GroupLayersSchema = z
  .object({
    listOpensHoursBefore: z.number().int(),
    reservesOpenHoursBefore: z.number().int(),
    guestsOpenHoursBefore: z.number().int().nullable().optional(),
  })
  .superRefine((layers, ctx) => {
    const field = layersViolation(layers);
    if (field) ctx.addIssue({ code: 'custom', path: [field], message: LAYERS_MESSAGE });
  });

/**
 * POST /groups. Sem `timeZone`: o do perfil do dono, ou `America/Sao_Paulo`.
 * Sem `reservesOpenHoursBefore`: metade da dos membros. Sem `guestsOpenHoursBefore`: convidados desligados.
 */
export const CreateGroupInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80),
    sport: SportSchema,
    weekday: WeekdaySchema,
    time: LocalTimeSchema,
    timeZone: TimeZoneSchema.optional(),
    location: z.string().trim().min(1).max(120).optional(),
    slots: SlotsSchema,
    /**
     * Camadas opcionais (GRP-15): quem decide o padrão é a api. Sem nenhuma, membros 48h, reservas 24h e
     * convidados desligados; com os membros e sem as reservas, reservas na metade dos membros.
     */
    listOpensHoursBefore: ListOpensHoursBeforeSchema.optional(),
    reservesOpenHoursBefore: LayerHoursSchema.optional(),
    guestsOpenHoursBefore: LayerHoursSchema.optional(),
  })
  .superRefine((input, ctx) => {
    // Sem os membros, o contrato não sabe o padrão (é da api): confere só o que veio. A api confere a ordem completa.
    if (input.listOpensHoursBefore === undefined) {
      if (input.reservesOpenHoursBefore === undefined) return;
      const field = layersViolation({
        listOpensHoursBefore: input.reservesOpenHoursBefore,
        reservesOpenHoursBefore: input.reservesOpenHoursBefore,
        guestsOpenHoursBefore: input.guestsOpenHoursBefore,
      });
      if (field) ctx.addIssue({ code: 'custom', path: [field], message: LAYERS_MESSAGE });
      return;
    }
    const field = layersViolation({
      ...input,
      listOpensHoursBefore: input.listOpensHoursBefore,
      // Sem reservas, a api usa a metade da antecedência dos membros, que nunca quebra a ordem das reservas.
      reservesOpenHoursBefore: input.reservesOpenHoursBefore ?? Math.floor(input.listOpensHoursBefore / 2),
    });
    if (field) ctx.addIssue({ code: 'custom', path: [field], message: LAYERS_MESSAGE });
  });
export type CreateGroupInput = z.infer<typeof CreateGroupInputSchema>;

/** PATCH /groups/{id} (dono): as camadas e os limites (GRP-16, 38). `guestsOpenHoursBefore: null` desliga os convidados. */
export const UpdateGroupInputSchema = z
  .object({
    listOpensHoursBefore: ListOpensHoursBeforeSchema.optional(),
    reservesOpenHoursBefore: LayerHoursSchema.optional(),
    guestsOpenHoursBefore: LayerHoursSchema.nullable().optional(),
    maxMembers: MaxMembersSchema.optional(),
    maxReserves: MaxReservesSchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to update' });
export type UpdateGroupInput = z.infer<typeof UpdateGroupInputSchema>;

/**
 * Grupo como a api devolve. Os 3 tokens só vêm para o dono; `myRole` é o papel de quem pede.
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
  reservesOpenHoursBefore: z.number().int(),
  guestsOpenHoursBefore: z.number().int().optional(),
  ownerId: z.uuid(),
  inviteToken: z.string().optional(),
  reserveInviteToken: z.string().optional(),
  guestToken: z.string().optional(),
  archivedAt: z.iso.datetime().optional(),
  /** Logo e capa (GRP-35, GRP-36): URLs públicas das mídias `group.logo` e `group.cover`. */
  logoUrl: z.url().optional(),
  coverUrl: z.url().optional(),
  /** Limites (GRP-38). A contagem sai da lista de membros. */
  maxMembers: z.number().int(),
  maxReserves: z.number().int(),
  myRole: MemberRoleSchema,
  /** Só para a reserva com convite para membro pendente (GRP-40, 41). */
  myMemberInvite: z.object({ expiresAt: z.iso.datetime() }).optional(),
});
export type Group = z.infer<typeof GroupSchema>;

/** POST /groups/{id}/invite: body opcional com o tipo do link (padrão `member`). */
export const RotateInviteInputSchema = z.object({ kind: InviteKindSchema.default('member') });
export type RotateInviteInput = z.infer<typeof RotateInviteInputSchema>;

/** POST /groups/{id}/invite: o link novo daquele tipo (o anterior deixa de valer). */
export const InviteSchema = z.object({ kind: InviteKindSchema, token: z.string() });
export type Invite = z.infer<typeof InviteSchema>;

export const MemberSchema = z.object({
  userId: z.uuid(),
  name: z.string().optional(),
  isOwner: z.boolean(),
  role: MemberRoleSchema,
  /** Só na resposta para o dono: a reserva tem convite para membro pendente até essa data (GRP-40). */
  memberInviteExpiresAt: z.iso.datetime().optional(),
});
export type Member = z.infer<typeof MemberSchema>;

/** POST /groups/{id}/members/{userId}/member-invite: o convite pendente (GRP-40). */
export const MemberInviteSchema = z.object({ userId: z.uuid(), expiresAt: z.iso.datetime() });
export type MemberInvite = z.infer<typeof MemberInviteSchema>;

export const GameStatusSchema = z.enum(['scheduled', 'open', 'in_progress', 'cancelled']);
export type GameStatus = z.infer<typeof GameStatusSchema>;

export const AttendeeSchema = z.object({
  userId: z.uuid(),
  name: z.string().optional(),
  confirmedAt: z.iso.datetime(),
  role: GroupRoleSchema,
});
export type Attendee = z.infer<typeof AttendeeSchema>;

/** Onde o usuário logado está na lista: dentro ou na fila, com a posição (1 = primeiro) naquela parte. */
export const MyAttendanceSchema = z.object({
  list: z.enum(['confirmed', 'waitlist']),
  position: z.number().int().positive(),
});
export type MyAttendance = z.infer<typeof MyAttendanceSchema>;

/**
 * Jogo da semana (pode ser "virtual": ainda sem item no banco, com a lista vazia). Instantes em UTC.
 * `opensAt`/`status`: camada dos membros. `myOpensAt`: quando quem pede pode confirmar (ausente = nunca).
 */
export const GameSchema = z.object({
  groupId: z.uuid(),
  date: LocalDateSchema,
  startsAt: z.iso.datetime(),
  opensAt: z.iso.datetime(),
  reservesOpensAt: z.iso.datetime(),
  guestsOpensAt: z.iso.datetime().optional(),
  myOpensAt: z.iso.datetime().optional(),
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

/** GET /play/{token}: o jogo atual pelo link do jogo (D7), com o resumo do grupo e o papel de quem pede. */
export const GuestGameSchema = z.object({
  group: GroupSchema.pick({
    id: true,
    name: true,
    sport: true,
    weekday: true,
    time: true,
    timeZone: true,
    location: true,
    logoUrl: true,
    coverUrl: true,
  }),
  myRole: GroupRoleSchema,
  game: GameSchema,
});
export type GuestGame = z.infer<typeof GuestGameSchema>;

/** Qual imagem do grupo (GRP-35): `logo` → mídia `group.logo`; `cover` → `group.cover`. */
export const GroupImageSlotSchema = z.enum(['logo', 'cover']);
export type GroupImageSlot = z.infer<typeof GroupImageSlotSchema>;
