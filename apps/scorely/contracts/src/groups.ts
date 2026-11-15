import { EntitySchema, hasChanges, VersionSchema } from '@scorely/contracts/src/entity';
import { PlaceSchema } from '@scorely/contracts/src/places';
import { SportIdSchema } from '@scorely/contracts/src/sports';
import { PublicUserIdSchema, TimeZoneSchema } from '@scorely/contracts/src/users';
import { z } from 'zod';

/** Dia da semana no fuso do grupo: 0 = domingo ... 6 = sábado. */
export const WeekdaySchema = z.number().int().min(0).max(6);

/** Hora local `HH:mm` (24 h). */
export const LocalTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time');

/** Data local `YYYY-MM-DD` no fuso do grupo (identifica o jogo nas rotas). */
export const LocalDateSchema = z.iso.date();

export const GROUP_LIMITS = {
  slots: { min: 2, max: 50 },
  /** Mínimo para o jogo acontecer (GRP-46): de 2 até as vagas (a api confere contra as vagas). */
  minPlayers: { min: 2, max: 50 },
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
const MinPlayersSchema = z.number().int().min(GROUP_LIMITS.minPlayers.min).max(GROUP_LIMITS.minPlayers.max);
const ListOpensHoursBeforeSchema = z
  .number()
  .int()
  .min(GROUP_LIMITS.listOpensHoursBefore.min)
  .max(GROUP_LIMITS.listOpensHoursBefore.max);

const LayerHoursSchema = z.number().int().min(0).max(144);

/**
 * O papel (`tier`) de quem participa do jogo (GRP-17): membro e reserva são do grupo; convidado vem pelo link do jogo.
 * Diz a camada em que confirma e o limite em que conta (GRP-38). Não é o cargo (GRP-48, ADR 0015).
 */
export const TierSchema = z.enum(['member', 'reserve', 'guest']);
export type Tier = z.infer<typeof TierSchema>;
export const MemberTierSchema = TierSchema.exclude(['guest']);
export type MemberTier = z.infer<typeof MemberTierSchema>;

/**
 * Permissões de administração do grupo (GRP-49), por assunto. O dono tem todas; quem não tem cargo, nenhuma.
 * Só do dono, fora do catálogo: arquivar, desarquivar, cargos e passar o grupo.
 */
export const PermissionSchema = z.enum([
  'game.manage',
  'teams.manage',
  'members.manage',
  'settings.edit',
  'seasons.manage',
  'results.record',
]);
export type Permission = z.infer<typeof PermissionSchema>;
export const ALL_PERMISSIONS: readonly Permission[] = PermissionSchema.options;

/**
 * Cargos (GRP-48, 50): três, fixos no código. Toda participação tem um; `member` é o padrão de quem entra.
 * O nome na tela vem do i18n do web, pelo id.
 */
export const RoleIdSchema = z.enum(['owner', 'admin', 'member']);
export type RoleId = z.infer<typeof RoleIdSchema>;
export const ROLES: Record<RoleId, { permissions: readonly Permission[] }> = {
  owner: { permissions: ALL_PERMISSIONS },
  admin: { permissions: ALL_PERMISSIONS },
  member: { permissions: [] },
};

/** O cargo que o dono dá e tira (GRP-51). Tirar devolve o `member`. */
export const GrantableRoleIdSchema = RoleIdSchema.extract(['admin']);
export type GrantableRoleId = z.infer<typeof GrantableRoleIdSchema>;

/** PUT /groups/{id}/members/{userId}/staff-role (dono, GRP-51). */
export const SetRoleInputSchema = z.object({ roleId: GrantableRoleIdSchema });
export type SetRoleInput = z.infer<typeof SetRoleInputSchema>;

/** POST /groups/{id}/transfer (dono, GRP-54): o membro que vira o dono, pelo id público. */
export const TransferGroupInputSchema = z.object({ userId: PublicUserIdSchema });
export type TransferGroupInput = z.infer<typeof TransferGroupInputSchema>;

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
    /** GRP-58: um esporte do catálogo (ESP), ativo. Não muda depois. */
    sportId: SportIdSchema,
    weekday: WeekdaySchema,
    time: LocalTimeSchema,
    timeZone: TimeZoneSchema.optional(),
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

/**
 * PATCH /groups/{id} (`settings.edit`): as camadas, os limites, as vagas e o mínimo padrão (GRP-16, 38, 45, 46).
 * `guestsOpenHoursBefore: null` desliga os convidados; `minPlayers: null` desliga o mínimo.
 */
export const UpdateGroupInputSchema = z
  .object({
    /** GRP-59: a `settingsVersion` que a tela mostrou. */
    version: VersionSchema,
    listOpensHoursBefore: ListOpensHoursBeforeSchema.optional(),
    reservesOpenHoursBefore: LayerHoursSchema.optional(),
    guestsOpenHoursBefore: LayerHoursSchema.nullable().optional(),
    maxMembers: MaxMembersSchema.optional(),
    maxReserves: MaxReservesSchema.optional(),
    slots: SlotsSchema.optional(),
    minPlayers: MinPlayersSchema.nullable().optional(),
    /** GRP-62: o lugar padrão; `null` tira. */
    defaultPlaceId: z.uuid().nullable().optional(),
  })
  .refine(hasChanges, { message: 'Nothing to update' });
export type UpdateGroupInput = z.infer<typeof UpdateGroupInputSchema>;

/**
 * Grupo como a api devolve. Os 3 tokens só vêm para quem tem `members.manage` (GRP-05); `myTier`, `myRoleId` e
 * `myPermissions` são o papel, o cargo e as permissões de quem pede (GRP-55). Quem é o dono vem dos membros.
 * `timeZone` é texto livre na leitura: a api já validou ao gravar (plano 003, D13).
 */
export const GroupSchema = EntitySchema.extend({
  /** A versão da identidade: nome, esporte, logo e capa (ADR 0013). */
  version: VersionSchema,
  /** GRP-59: a versão dos Ajustes, que o `PATCH /groups/{id}` manda. */
  settingsVersion: VersionSchema,
  name: z.string(),
  /** GRP-58: o esporte do grupo, do catálogo (`GET /sports`, ESP-07). */
  sportId: SportIdSchema,
  weekday: WeekdaySchema,
  time: LocalTimeSchema,
  timeZone: z.string(),
  /** GRP-62: o lugar padrão (um lugar ativo do grupo). Ausente = o jogo sem local. */
  defaultPlaceId: z.uuid().optional(),
  slots: z.number().int(),
  /** Mínimo padrão para o jogo acontecer (GRP-46). Ausente = sem mínimo. */
  minPlayers: z.number().int().optional(),
  listOpensHoursBefore: z.number().int(),
  reservesOpenHoursBefore: z.number().int(),
  guestsOpenHoursBefore: z.number().int().optional(),
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
  myTier: MemberTierSchema,
  /** O cargo de quem pede (GRP-48, 55). */
  myRoleId: RoleIdSchema,
  /** O que quem pede pode fazer no grupo (GRP-55). O dono recebe todas. */
  myPermissions: z.array(PermissionSchema),
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
  userId: PublicUserIdSchema,
  /** O apelido (USR-04). O nome da pessoa nunca sai aqui (USR-13). */
  nickname: z.string(),
  tier: MemberTierSchema,
  /** O cargo da pessoa (GRP-48, 55): `owner` é o dono. Todos veem. */
  roleId: RoleIdSchema,
  /** Só na resposta para quem tem `members.manage`: a reserva tem convite para membro pendente até essa data (GRP-40). */
  memberInviteExpiresAt: z.iso.datetime().optional(),
});
export type Member = z.infer<typeof MemberSchema>;

/** POST /groups/{id}/members/{userId}/member-invite: o convite pendente (GRP-40). */
export const MemberInviteSchema = z.object({ userId: PublicUserIdSchema, expiresAt: z.iso.datetime() });
export type MemberInvite = z.infer<typeof MemberInviteSchema>;

export const GameStatusSchema = z.enum(['scheduled', 'open', 'in_progress', 'cancelled']);
export type GameStatus = z.infer<typeof GameStatusSchema>;

export const AttendeeSchema = z.object({
  userId: PublicUserIdSchema,
  /** O apelido (USR-04). O nome da pessoa nunca sai aqui (USR-13). */
  nickname: z.string(),
  confirmedAt: z.iso.datetime(),
  tier: TierSchema,
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
  /** Vagas que valem no jogo: as do jogo ou, sem elas, as do grupo (GRP-45). */
  slots: z.number().int(),
  /** Mínimo que vale no jogo (GRP-46). Ausente = sem mínimo. */
  minPlayers: z.number().int().optional(),
  /** `true` = as vagas / o mínimo são só deste jogo (GRP-45, 46). */
  slotsCustom: z.boolean().optional(),
  minPlayersCustom: z.boolean().optional(),
  /** GRP-62, 63: onde é o jogo (o lugar padrão do grupo). Ausente = sem local. */
  place: PlaceSchema.optional(),
  confirmed: z.array(AttendeeSchema),
  waitlist: z.array(AttendeeSchema),
  me: MyAttendanceSchema.optional(),
});
export type Game = z.infer<typeof GameSchema>;

/**
 * PATCH /groups/{id}/games/{date} (`game.manage`): vagas e mínimo só do jogo atual (GRP-45, 46).
 * `null` = voltar ao padrão do grupo.
 */
export const UpdateGameInputSchema = z
  .object({
    slots: SlotsSchema.nullable().optional(),
    minPlayers: MinPlayersSchema.nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to update' });
export type UpdateGameInput = z.infer<typeof UpdateGameInputSchema>;

/** GET /me/groups: cada grupo com o resumo do jogo atual. */
export const MyGroupSchema = GroupSchema.extend({
  game: GameSchema.pick({
    date: true,
    startsAt: true,
    status: true,
    slots: true,
    minPlayers: true,
    me: true,
  }).extend({
    confirmedCount: z.number().int().nonnegative(),
  }),
});
export type MyGroup = z.infer<typeof MyGroupSchema>;

/** GET /play/{token}: o jogo atual pelo link do jogo (D7), com o resumo do grupo e o papel de quem pede. */
export const GuestGameSchema = z.object({
  group: GroupSchema.pick({
    id: true,
    name: true,
    sportId: true,
    weekday: true,
    time: true,
    timeZone: true,
    logoUrl: true,
    coverUrl: true,
  }),
  myTier: TierSchema,
  game: GameSchema,
});
export type GuestGame = z.infer<typeof GuestGameSchema>;

/** Qual imagem do grupo (GRP-35): `logo` → mídia `group.logo`; `cover` → `group.cover`. */
export const GroupImageSlotSchema = z.enum(['logo', 'cover']);
export type GroupImageSlot = z.infer<typeof GroupImageSlotSchema>;
