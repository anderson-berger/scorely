import { VersionSchema } from '@scorely/contracts/src/entity';
import { EmailSchema, PublicUserIdSchema, UserSchema } from '@scorely/contracts/src/users';
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

/** O cargo de quem pede no grupo (GRV-02, 15). Por enquanto, dois fixos: o dono e o cargo base. */
export const GroupRoleV2Schema = z.enum(['owner', 'member']);
export type GroupRoleV2 = z.infer<typeof GroupRoleV2Schema>;

/** Como a pessoa participa (GRV-17): membro, com prioridade, ou reserva. */
export const GroupTierV2Schema = z.enum(['member', 'reserve']);
export type GroupTierV2 = z.infer<typeof GroupTierV2Schema>;

/** O catálogo de permissões de administração (GRV-15). */
export const GroupPermissionV2Schema = z.enum(['group.edit', 'members.invite', 'members.remove']);
export type GroupPermissionV2 = z.infer<typeof GroupPermissionV2Schema>;

/** Corpo do `POST /v2/groups` (GRV-01): só o nome. */
export const CreateGroupV2InputSchema = z.object({ name: GroupNameV2Schema });
export type CreateGroupV2Input = z.infer<typeof CreateGroupV2InputSchema>;

/** Grupo como a api devolve (GRV-04, 05). O `id` é o público (GRV-08), por isso não estende o `EntitySchema`. */
export const GroupV2Schema = z.object({
  id: PublicGroupIdSchema,
  createdAt: z.iso.datetime(),
  version: VersionSchema,
  name: z.string(),
  myTier: GroupTierV2Schema,
  myRole: GroupRoleV2Schema,
  /** O que quem pede pode administrar (GRV-16). A tela só mostra essas ações; a api confere de novo. */
  myPermissions: z.array(GroupPermissionV2Schema),
  /** Logo e capa (GRV-09, GRV-10): URLs públicas das mídias `group.logo` e `group.cover`, só quando existem. */
  logoUrl: z.url().optional(),
  coverUrl: z.url().optional(),
});
export type GroupV2 = z.infer<typeof GroupV2Schema>;

// ---- Convites (GRV-18–22) ----

/** Validade em dias; `null` = sem prazo (GRV-18). */
export const GroupInviteValidityV2Schema = z.union([z.literal(1), z.literal(7), z.literal(30)]).nullable();

/** Limite de usos (GRV-18): de 1 a 100, ou `null` = sem limite. */
export const GroupInviteMaxUsesV2Schema = z.number().int().min(1).max(100).nullable();

/** Máximo de convites ativos por grupo (GRV-18). */
export const GROUP_INVITE_MAX_ACTIVE = 50;

/** Para quem é o convite pessoal (GRV-23): pelo id público ou pelo email (guardado normalizado). */
export const GroupInviteTargetInputV2Schema = z.union([
  z.object({ publicId: PublicUserIdSchema }),
  z.object({ email: EmailSchema }),
]);
export type GroupInviteTargetInputV2 = z.infer<typeof GroupInviteTargetInputV2Schema>;

/**
 * Corpo do `POST /v2/groups/{publicId}/invites` (GRV-18, 23). Padrões: membro, 7 dias, sem limite, para qualquer
 * pessoa. Com `target`, o convite tem sempre 1 uso: a api ignora o `maxUses`.
 */
export const CreateGroupInviteV2InputSchema = z.object({
  tier: GroupTierV2Schema.default('member'),
  validityDays: GroupInviteValidityV2Schema.default(7),
  maxUses: GroupInviteMaxUsesV2Schema.default(null),
  target: GroupInviteTargetInputV2Schema.optional(),
});
export type CreateGroupInviteV2Input = z.infer<typeof CreateGroupInviteV2InputSchema>;

/** Situação do convite, calculada ao ler (GRV-19). `declined` só vem com o convite pessoal (etapa B). */
export const GroupInviteStatusV2Schema = z.enum(['active', 'expired', 'exhausted', 'revoked', 'declined']);
export type GroupInviteStatusV2 = z.infer<typeof GroupInviteStatusV2Schema>;

/** O convite como quem tem `members.invite` vê (GRV-18, 19). */
export const GroupInviteV2Schema = z.object({
  id: z.uuid(),
  /** O token do link `/v2/join/<token>`. */
  token: z.string().min(1),
  tier: GroupTierV2Schema,
  status: GroupInviteStatusV2Schema,
  expiresAt: z.iso.datetime().optional(),
  maxUses: z.number().int().positive().optional(),
  uses: z.number().int().nonnegative(),
  createdBy: UserSchema,
  createdAt: z.iso.datetime(),
  /** Quem entrou por ele (perfis). */
  usedBy: z.array(UserSchema),
  /** Para quem é, no convite pessoal (GRV-23): o perfil, se foi pelo id público; o email, se foi por ele. */
  target: z.union([z.object({ user: UserSchema }), z.object({ email: z.string() })]).optional(),
});
export type GroupInviteV2 = z.infer<typeof GroupInviteV2Schema>;

/** Apresentação do grupo para quem abre um convite que vale (GRV-21). */
export const GroupInvitePreviewV2Schema = z.object({
  groupId: PublicGroupIdSchema,
  name: z.string(),
  logoUrl: z.url().optional(),
  coverUrl: z.url().optional(),
  participants: z.number().int().nonnegative(),
  /** Como a pessoa vai entrar. */
  tier: GroupTierV2Schema,
  /** Como ela já participa, quando participa. */
  myTier: GroupTierV2Schema.optional(),
});
export type GroupInvitePreviewV2 = z.infer<typeof GroupInvitePreviewV2Schema>;

/** Por que o convite não vale (GRV-21). */
export const GroupInviteInvalidReasonV2Schema = z.enum([
  'not_found',
  'expired',
  'exhausted',
  'revoked',
  'declined',
]);
export type GroupInviteInvalidReasonV2 = z.infer<typeof GroupInviteInvalidReasonV2Schema>;

/** Um convite pessoal para mim (GRV-24, 36): a apresentação do grupo (GRV-21) e quem convidou. */
export const MyGroupInviteV2Schema = GroupInvitePreviewV2Schema.extend({
  id: z.uuid(),
  /** O token, para entrar (GRV-22) e abrir `/v2/join/<token>`. */
  token: z.string().min(1),
  invitedBy: UserSchema,
  createdAt: z.iso.datetime(),
});
export type MyGroupInviteV2 = z.infer<typeof MyGroupInviteV2Schema>;

// ---- Membros (GRV-29) ----

/** Uma participação como a lista de membros mostra (GRV-29). */
export const GroupMemberV2Schema = z.object({
  user: UserSchema,
  tier: GroupTierV2Schema,
  role: GroupRoleV2Schema,
  /** A data de entrada: não muda quando a reserva vira membro (GRV-22). */
  joinedAt: z.iso.datetime(),
  /** Quem criou o convite pelo qual entrou ou subiu, quando houve. */
  invitedBy: UserSchema.optional(),
});
export type GroupMemberV2 = z.infer<typeof GroupMemberV2Schema>;
