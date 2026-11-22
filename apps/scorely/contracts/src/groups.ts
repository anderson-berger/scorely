import { VersionSchema } from '@scorely/contracts/src/entity';
import { EmailSchema, PublicUserIdSchema, UserSchema } from '@scorely/contracts/src/users';
import { z } from 'zod';

// Grupo (docs/modules/grupos.md, ADRs 0017 e 0018).

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
export const GroupNameSchema = z.string().trim().min(1, 'Name is required').max(80);

/** Máximo de cargos criados por grupo (GRV-44). */
export const GROUP_ROLE_MAX = 20;

/** GRV-44: de 1 a 30 caracteres, sem os espaços das pontas. */
export const GroupRoleNameSchema = z.string().trim().min(1, 'Name is required').max(30);

/**
 * Um cargo como a pessoa o vê (GRV-40): os fixos, Dono e Todos, vêm sem nome (a tela traduz); o criado traz o uuid
 * e o nome.
 */
export const GroupRoleRefSchema = z.union([
  z.object({ id: z.literal('owner') }),
  z.object({ id: z.literal('everyone') }),
  z.object({ id: z.uuid(), name: z.string() }),
]);
export type GroupRoleRef = z.infer<typeof GroupRoleRefSchema>;

/** Como a pessoa participa (GRV-17): membro, com prioridade, ou reserva. */
export const GroupTierSchema = z.enum(['member', 'reserve']);
export type GroupTier = z.infer<typeof GroupTierSchema>;

/** O catálogo de permissões de administração (GRV-15). */
export const GroupPermissionSchema = z.enum([
  'group.edit',
  'members.invite',
  'members.remove',
  'roles.manage',
]);
export type GroupPermission = z.infer<typeof GroupPermissionSchema>;

/** Modo de entrada (GRV-25): só por convite (o padrão) ou também por pedido aceito. */
export const GroupJoinModeSchema = z.enum(['invite', 'open']);
export type GroupJoinMode = z.infer<typeof GroupJoinModeSchema>;

/** Corpo do `POST /groups` (GRV-01): só o nome. */
export const CreateGroupInputSchema = z.object({ name: GroupNameSchema });
export type CreateGroupInput = z.infer<typeof CreateGroupInputSchema>;

/** Grupo como a api devolve (GRV-04, 05). O `id` é o público (GRV-08), por isso não estende o `EntitySchema`. */
export const GroupSchema = z.object({
  id: PublicGroupIdSchema,
  createdAt: z.iso.datetime(),
  version: VersionSchema,
  name: z.string(),
  myTier: GroupTierSchema,
  myRole: GroupRoleRefSchema,
  /** O que quem pede pode administrar (GRV-16). A tela só mostra essas ações; a api confere de novo. */
  myPermissions: z.array(GroupPermissionSchema),
  /** O modo de entrada (GRV-25), para a tela mostrar o atual (GRV-38). */
  joinMode: GroupJoinModeSchema,
  /** Logo e capa (GRV-09, GRV-10): URLs públicas das mídias `group.logo` e `group.cover`, só quando existem. */
  logoUrl: z.url().optional(),
  coverUrl: z.url().optional(),
});
export type Group = z.infer<typeof GroupSchema>;

// ---- Convites (GRV-18–22) ----

/** Validade em dias; `null` = sem prazo (GRV-18). */
export const GroupInviteValiditySchema = z.union([z.literal(1), z.literal(7), z.literal(30)]).nullable();

/** Limite de usos (GRV-18): de 1 a 100, ou `null` = sem limite. */
export const GroupInviteMaxUsesSchema = z.number().int().min(1).max(100).nullable();

/** Máximo de convites ativos por grupo (GRV-18). */
export const GROUP_INVITE_MAX_ACTIVE = 50;

/** Para quem é o convite pessoal (GRV-23): pelo id público ou pelo email (guardado normalizado). */
export const GroupInviteTargetInputSchema = z.union([
  z.object({ publicId: PublicUserIdSchema }),
  z.object({ email: EmailSchema }),
]);
export type GroupInviteTargetInput = z.infer<typeof GroupInviteTargetInputSchema>;

/**
 * Corpo do `POST /groups/{publicId}/invites` (GRV-18, 23). Padrões: membro, 7 dias, sem limite, para qualquer
 * pessoa. Com `target`, o convite tem sempre 1 uso: a api ignora o `maxUses`.
 */
export const CreateGroupInviteInputSchema = z.object({
  tier: GroupTierSchema.default('member'),
  validityDays: GroupInviteValiditySchema.default(7),
  maxUses: GroupInviteMaxUsesSchema.default(null),
  target: GroupInviteTargetInputSchema.optional(),
});
export type CreateGroupInviteInput = z.infer<typeof CreateGroupInviteInputSchema>;
/** O corpo como a tela manda: o que fica de fora a api completa com o padrão (GRV-18, 32). */
export type CreateGroupInviteBody = z.input<typeof CreateGroupInviteInputSchema>;

/** Situação do convite, calculada ao ler (GRV-19). `declined` só vem com o convite pessoal (etapa B). */
export const GroupInviteStatusSchema = z.enum(['active', 'expired', 'exhausted', 'revoked', 'declined']);
export type GroupInviteStatus = z.infer<typeof GroupInviteStatusSchema>;

/** O convite como quem tem `members.invite` vê (GRV-18, 19). */
export const GroupInviteSchema = z.object({
  id: z.uuid(),
  /** O token do link `/join/<token>`. */
  token: z.string().min(1),
  tier: GroupTierSchema,
  status: GroupInviteStatusSchema,
  expiresAt: z.iso.datetime().optional(),
  maxUses: z.number().int().positive().optional(),
  uses: z.number().int().nonnegative(),
  createdBy: UserSchema,
  createdAt: z.iso.datetime(),
  /** Quem pede pode cancelar este convite (GRV-19, 43). */
  manageable: z.boolean(),
  /** Quem entrou por ele (perfis). */
  usedBy: z.array(UserSchema),
  /** Para quem é, no convite pessoal (GRV-23): o perfil, se foi pelo id público; o email, se foi por ele. */
  target: z.union([z.object({ user: UserSchema }), z.object({ email: EmailSchema })]).optional(),
});
export type GroupInvite = z.infer<typeof GroupInviteSchema>;

/** Apresentação do grupo para quem abre um convite que vale (GRV-21). */
export const GroupInvitePreviewSchema = z.object({
  groupId: PublicGroupIdSchema,
  name: z.string(),
  logoUrl: z.url().optional(),
  coverUrl: z.url().optional(),
  participants: z.number().int().nonnegative(),
  /** Como a pessoa vai entrar. */
  tier: GroupTierSchema,
  /** Como ela já participa, quando participa. */
  myTier: GroupTierSchema.optional(),
});
export type GroupInvitePreview = z.infer<typeof GroupInvitePreviewSchema>;

/** Por que o convite não vale (GRV-21). */
export const GroupInviteInvalidReasonSchema = z.enum([
  'not_found',
  'expired',
  'exhausted',
  'revoked',
  'declined',
]);
export type GroupInviteInvalidReason = z.infer<typeof GroupInviteInvalidReasonSchema>;

/** Um convite pessoal para mim (GRV-24, 36): a apresentação do grupo (GRV-21) e quem convidou. */
export const MyGroupInviteSchema = GroupInvitePreviewSchema.extend({
  id: z.uuid(),
  /** O token, para entrar (GRV-22) e abrir `/join/<token>`. */
  token: z.string().min(1),
  invitedBy: UserSchema,
  createdAt: z.iso.datetime(),
});
export type MyGroupInvite = z.infer<typeof MyGroupInviteSchema>;

// ---- Grupo aberto e pedidos (GRV-25–28) ----

/** Corpo do `PUT /groups/{publicId}/join-mode` (GRV-25), com a `version` conferida (ADR 0016). */
export const SetGroupJoinModeInputSchema = z.object({
  mode: GroupJoinModeSchema,
  expectedVersion: VersionSchema,
});
export type SetGroupJoinModeInput = z.infer<typeof SetGroupJoinModeInputSchema>;

/** Apresentação do grupo aberto pelo código (GRV-26) e resposta do pedido (GRV-27). */
export const GroupPreviewSchema = z.object({
  groupId: PublicGroupIdSchema,
  name: z.string(),
  logoUrl: z.url().optional(),
  coverUrl: z.url().optional(),
  participants: z.number().int().nonnegative(),
  /** Como a pessoa já participa, quando participa. */
  myTier: GroupTierSchema.optional(),
  /** A data do pedido esperando, quando há. */
  requestedAt: z.iso.datetime().optional(),
});
export type GroupPreview = z.infer<typeof GroupPreviewSchema>;

/** Um pedido esperando, como quem tem `members.invite` vê (GRV-28): o perfil e a data. */
export const GroupJoinRequestSchema = z.object({
  user: UserSchema,
  createdAt: z.iso.datetime(),
});
export type GroupJoinRequest = z.infer<typeof GroupJoinRequestSchema>;

/** Corpo do aceitar (GRV-28): quem aceita escolhe como a pessoa entra. */
export const ApproveGroupRequestInputSchema = z.object({ tier: GroupTierSchema });
export type ApproveGroupRequestInput = z.infer<typeof ApproveGroupRequestInputSchema>;

// ---- Membros (GRV-29) ----

/** Uma participação como a lista de membros mostra (GRV-29). */
export const GroupMemberSchema = z.object({
  user: UserSchema,
  tier: GroupTierSchema,
  role: GroupRoleRefSchema,
  /** Quem pede pode mexer nesta pessoa: remover, mudar o cargo (GRV-43). */
  manageable: z.boolean(),
  /** A data de entrada: não muda quando a reserva vira membro (GRV-22). */
  joinedAt: z.iso.datetime(),
  /** Quem criou o convite pelo qual entrou ou subiu, quando houve. Guardado na participação: não some com o convite. */
  invitedBy: UserSchema.optional(),
  /** O convite pelo qual entrou ou subiu (GRV-29, 37). Só para quem tem `members.invite`. */
  inviteId: z.uuid().optional(),
});
export type GroupMember = z.infer<typeof GroupMemberSchema>;

// ---- Logo e capa (GRV-09) ----

/** Qual imagem do grupo (GRV-09): `logo` → mídia `group.logo`; `cover` → `group.cover`. */
export const GroupImageSlotSchema = z.enum(['logo', 'cover']);
export type GroupImageSlot = z.infer<typeof GroupImageSlotSchema>;

// ---- Cargos (GRV-40–49) ----

/** Um cargo na lista de cargos (GRV-42), na ordem: Dono, os criados, Todos. */
export const GroupRoleItemSchema = z.object({
  id: z.union([z.literal('owner'), z.literal('everyone'), z.uuid()]),
  /** Só o cargo criado tem nome; os fixos a tela traduz. */
  name: z.string().optional(),
  permissions: z.array(GroupPermissionSchema),
  /** Quantas pessoas têm o cargo. */
  members: z.number().int().nonnegative(),
  /** Quem pede pode editar, ordenar e apagar este cargo (GRV-43). */
  manageable: z.boolean(),
  fixed: z.enum(['owner', 'everyone']).optional(),
});
export type GroupRoleItem = z.infer<typeof GroupRoleItemSchema>;

/** `GET /groups/{publicId}/roles` (GRV-42): a lista e a `version` que toda edição manda de volta. */
export const GroupRolesSchema = z.object({
  version: VersionSchema,
  roles: z.array(GroupRoleItemSchema),
});
export type GroupRoles = z.infer<typeof GroupRolesSchema>;

/** Corpo do `POST /groups/{publicId}/roles` (GRV-44). */
export const CreateGroupRoleInputSchema = z.object({
  name: GroupRoleNameSchema,
  permissions: z.array(GroupPermissionSchema),
  expectedVersion: VersionSchema,
});
export type CreateGroupRoleInput = z.infer<typeof CreateGroupRoleInputSchema>;

/** Corpo do `PUT /groups/{publicId}/roles/{roleId}` (GRV-45). No Todos o nome é ignorado. */
export const UpdateGroupRoleInputSchema = CreateGroupRoleInputSchema;
export type UpdateGroupRoleInput = CreateGroupRoleInput;

/** Corpo do `PUT /groups/{publicId}/roles/order` (GRV-46): os cargos criados, do mais alto para o mais baixo. */
export const OrderGroupRolesInputSchema = z.object({
  roleIds: z.array(z.uuid()),
  expectedVersion: VersionSchema,
});
export type OrderGroupRolesInput = z.infer<typeof OrderGroupRolesInputSchema>;

/** Corpo do `DELETE /groups/{publicId}/roles/{roleId}` (GRV-47). */
export const DeleteGroupRoleInputSchema = z.object({ expectedVersion: VersionSchema });
export type DeleteGroupRoleInput = z.infer<typeof DeleteGroupRoleInputSchema>;

/** Corpo do `PUT /groups/{publicId}/members/{userPublicId}/role` (GRV-48): `everyone` ou o uuid de um cargo criado. */
export const SetMemberRoleInputSchema = z.object({
  roleId: z.union([z.literal('everyone'), z.uuid()]),
});
export type SetMemberRoleInput = z.infer<typeof SetMemberRoleInputSchema>;

/** Corpo do `POST /groups/{publicId}/transfer` (GRV-49). */
export const TransferGroupInputSchema = z.object({ userPublicId: PublicUserIdSchema });
export type TransferGroupInput = z.infer<typeof TransferGroupInputSchema>;
