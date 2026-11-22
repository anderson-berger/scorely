import { randomBytes, randomUUID } from 'node:crypto';
import { normalizeEmail } from '@scorely/api/src/lib/email';
import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import {
  type GroupRoles,
  isBelow,
  permissionsOf,
  rankOf,
  requireBelow,
  requirePermission,
  roleRefOf,
} from '@scorely/api/src/modules/groups/group.permissions';
import {
  type GroupRepository,
  graceTtl,
  type InviteTarget,
  type JoinAction,
  type StoredGroup,
  type StoredInvite,
  type StoredJoinRequest,
  type StoredMembership,
  type StoredRole,
} from '@scorely/api/src/modules/groups/group.repository';
import { newPublicGroupId } from '@scorely/api/src/modules/groups/public-id';
import { type MediaService, mediaService } from '@scorely/api/src/modules/media/media.service';
import type { NotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import type { UserDirectory, UserRecord } from '@scorely/api/src/modules/users/user.repository';
import {
  type ApproveGroupRequestInput,
  type CreateGroupInput,
  type CreateGroupInviteInput,
  type CreateGroupRoleInput,
  type DeleteGroupRoleInput,
  GROUP_INVITE_MAX_ACTIVE,
  GROUP_ROLE_MAX,
  type Group,
  type GroupInvite,
  type GroupInviteInvalidReason,
  type GroupInvitePreview,
  type GroupInviteStatus,
  type GroupJoinRequest,
  type GroupMember,
  type GroupPermission,
  type GroupPreview,
  type GroupRoleItem,
  type GroupRoles as GroupRolesView,
  type MyGroupInvite,
  type OrderGroupRolesInput,
  type PublicGroupId,
  type PublicUserId,
  type SetGroupJoinModeInput,
  type SetMemberRoleInput,
  type TransferGroupInput,
  type UpdateGroupRoleInput,
  type User,
} from '@scorely/contracts';

/** MID-12: monta a URL pública pela finalidade e o id da mídia. */
export type UrlOf = MediaService['urlOf'];
const productionUrlOf: UrlOf = (purpose, mediaId) => mediaService.urlOf(purpose, mediaId);

/** GRV-08: um código em uso (chance desprezível) sorteia outro, até 3 vezes (como o id público do usuário). */
const PUBLIC_ID_ATTEMPTS = 3;

/** GRV-02: o grupo recém-criado só tem os cargos fixos. */
const NO_ROLES: GroupRoles = { roles: [], everyonePermissions: [] };

/** GRV-44: nome sem maiúsculas e acentos, para comparar. */
const normalizeRoleName = (name: string) => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** GRV-44: "Dono" e "Todos" são dos cargos fixos. */
const RESERVED_ROLE_NAMES = ['dono', 'todos'];

/** GRV-45: o Todos não recebe o que é de quem tem alguém abaixo. */
const NOT_FOR_EVERYONE: readonly GroupPermission[] = ['members.remove', 'roles.manage'];

/** GRV-05: ordem de nome sem diferenciar maiúsculas e acentos. */
const byName = new Intl.Collator('pt-BR', { sensitivity: 'base' });

export interface GroupsDeps {
  groups: GroupRepository;
  /** MID-12: só o `urlOf` da mídia. Sem ele, a mídia de produção. */
  media?: Pick<MediaService, 'urlOf'>;
  /** Perfis das pessoas (GRV-19, 29) e ids públicos → uuid (GRV-31). */
  users: Pick<UserDirectory, 'getMany' | 'resolve'>;
  now?: () => Date;
  newPublicId?: () => PublicGroupId;
  /** GRV-23: o email da conta (parte privada, USR-13) e a conta de um email. */
  emails: {
    emailOf(userId: UserId): Promise<string | undefined>;
    userIdOf(email: string): Promise<UserId | undefined>;
  };
  /** Os avisos `group_invited` (GRV-23), `group_join_requested` (GRV-27) e `group_join_approved` (GRV-28). */
  notifications: { notify(...args: Parameters<NotificationService['notify']>): Promise<unknown> };
  /** GRV-18: o token do link do convite. Padrão: 32 bytes aleatórios em base64url. */
  newToken?: () => string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const newInviteToken = () => randomBytes(32).toString('base64url');

/** USR-16: o perfil da pessoa como sai na resposta (id público, sem email nem nome). */
function toUser(record: UserRecord, urlOf: UrlOf): User {
  return {
    id: record.publicId,
    createdAt: record.createdAt,
    nickname: record.nickname,
    ...(record.gender !== undefined && { gender: record.gender }),
    ...(record.avatarMediaId !== undefined && { avatarUrl: urlOf('avatar', record.avatarMediaId) }),
  };
}

/** GRV-19: a situação do convite, calculada ao ler. */
function inviteStatus(invite: StoredInvite, now: Date): GroupInviteStatus {
  if (invite.revokedAt !== undefined) return 'revoked';
  if (invite.declinedAt !== undefined) return 'declined';
  if (invite.maxUses !== undefined && invite.uses >= invite.maxUses) return 'exhausted';
  if (invite.expiresAt !== undefined && invite.expiresAt <= now.toISOString()) return 'expired';
  return 'active';
}

/** GRV-19: o convite que deixou de valer há mais de 30 dias já não aparece (o `ttl` do banco atrasa até ~48 h). */
const isGone = (invite: StoredInvite, now: Date) =>
  invite.ttl !== undefined && invite.ttl * 1000 <= now.getTime();

/** O grupo para quem pede: o id público no lugar do uuid (GRV-08), o papel (GRV-04) e as URLs das imagens (GRV-10). */
export function forViewer(
  group: StoredGroup,
  membership: Pick<StoredMembership, 'role' | 'tier'>,
  roles: GroupRoles,
  urlOf: UrlOf = productionUrlOf,
): Group {
  return {
    id: group.publicId,
    createdAt: group.createdAt,
    version: group.version,
    name: group.name,
    myTier: membership.tier,
    myRole: roleRefOf(membership, roles),
    myPermissions: permissionsOf(membership, roles),
    joinMode: group.joinMode,
    ...(group.logoMediaId !== undefined && { logoUrl: urlOf('group.logo', group.logoMediaId) }),
    ...(group.coverMediaId !== undefined && { coverUrl: urlOf('group.cover', group.coverMediaId) }),
  };
}

export function createGroupService(deps: GroupsDeps) {
  const now = deps.now ?? (() => new Date());
  const newPublicId = deps.newPublicId ?? newPublicGroupId;

  /** GRV-01, 02, 03, 08: o nome já vem validado pelo contrato; quem cria é o dono. */
  async function create(userId: UserId, input: CreateGroupInput, attempt = 1): Promise<Group> {
    // `newEntity` gera o id do sistema (uuid) e o `createdAt`; o `updatedAt` nasce igual (ADR 0013).
    const entity = newEntity<Omit<StoredGroup, 'updatedAt'>>(
      { publicId: newPublicId(), name: input.name, joinMode: 'invite', version: 1 },
      now(),
    );
    const group: StoredGroup = { ...entity, updatedAt: entity.createdAt };
    const result = await deps.groups.create(group, userId);
    if (result === 'public_id_taken') {
      if (attempt >= PUBLIC_ID_ATTEMPTS) throw new Error('Could not allocate a group public id');
      return create(userId, input, attempt + 1);
    }
    return forViewer(group, { role: 'owner', tier: 'member' }, NO_ROLES, deps.media?.urlOf);
  }

  /** GRV-04: quem não participa, ou um código que não existe, recebe `GROUP_NOT_FOUND`. */
  async function get(userId: UserId, publicId: PublicGroupId): Promise<Group> {
    const id = await deps.groups.resolve(publicId);
    if (id === undefined) throw appError('GROUP_NOT_FOUND');
    const [group, membership, roles] = await Promise.all([
      deps.groups.get(id),
      deps.groups.getMembership(id, userId),
      deps.groups.getRoles(id),
    ]);
    if (!group || !membership) throw appError('GROUP_NOT_FOUND');
    return forViewer(group, membership, roles, deps.media?.urlOf);
  }

  /** GRV-05: os grupos de que a pessoa participa, por nome. */
  async function mine(userId: UserId): Promise<Group[]> {
    const rows = await deps.groups.listMine(userId);
    const roles = await Promise.all(rows.map(({ group }) => deps.groups.getRoles(group.id)));
    return rows
      .map(({ group, membership }, i) =>
        forViewer(group, membership, roles[i] as GroupRoles, deps.media?.urlOf),
      )
      .sort((a, b) => byName.compare(a.name, b.name));
  }

  const urlOf: UrlOf = (purpose, mediaId) => (deps.media?.urlOf ?? productionUrlOf)(purpose, mediaId);
  const newToken = deps.newToken ?? newInviteToken;

  /** Quem participa e o grupo; senão `GROUP_NOT_FOUND` (GRV-04, 15). */
  async function access(userId: UserId, publicId: PublicGroupId) {
    const id = await deps.groups.resolve(publicId);
    if (id === undefined) throw appError('GROUP_NOT_FOUND');
    const [group, membership, roles] = await Promise.all([
      deps.groups.get(id),
      deps.groups.getMembership(id, userId),
      deps.groups.getRoles(id),
    ]);
    if (!group || !membership) throw appError('GROUP_NOT_FOUND');
    return { id, group, membership, roles };
  }

  /** Perfis de uma vez (`getMany`). */
  async function profiles(ids: readonly UserId[]): Promise<Map<UserId, User>> {
    const unique = [...new Set(ids)];
    const records = unique.length > 0 ? await deps.users.getMany(unique) : [];
    return new Map(records.map((r) => [r.id, toUser(r, urlOf)]));
  }

  function profileOf(map: Map<UserId, User>, id: UserId): User {
    const user = map.get(id);
    if (!user) throw new Error('Group participant without a user profile');
    return user;
  }

  function inviteView(
    invite: StoredInvite,
    people: Map<UserId, User>,
    usedBy: readonly UserId[],
    at: Date,
    manageable: boolean,
  ): GroupInvite {
    const target = invite.target;
    return {
      id: invite.id,
      token: invite.token,
      tier: invite.tier,
      status: inviteStatus(invite, at),
      ...(invite.expiresAt !== undefined && { expiresAt: invite.expiresAt }),
      ...(invite.maxUses !== undefined && { maxUses: invite.maxUses }),
      uses: invite.uses,
      createdBy: profileOf(people, invite.createdBy),
      createdAt: invite.createdAt,
      manageable,
      usedBy: usedBy.map((u) => profileOf(people, u)),
      ...(target && {
        target: 'userId' in target ? { user: profileOf(people, target.userId) } : { email: target.email },
      }),
    };
  }

  /**
   * GRV-23: para quem é o convite pessoal. Pelo id público a pessoa precisa existir; pelo email, a conta pode não
   * existir ainda. Quem já participa e não subiria com o convite não pode ser convidado.
   */
  async function resolveTarget(
    groupId: StoredGroup['id'],
    input: CreateGroupInviteInput,
  ): Promise<{ target?: InviteTarget; accountId?: UserId }> {
    const wanted = input.target;
    if (!wanted) return {};
    const byPublicId =
      'publicId' in wanted ? (await deps.users.resolve([wanted.publicId])).get(wanted.publicId) : undefined;
    if ('publicId' in wanted && byPublicId === undefined) throw appError('USER_NOT_FOUND');
    const email = 'email' in wanted ? normalizeEmail(wanted.email) : undefined;
    const accountId = byPublicId ?? (email !== undefined ? await deps.emails.userIdOf(email) : undefined);
    if (accountId !== undefined) {
      const current = await deps.groups.getMembership(groupId, accountId);
      if (current && !(current.tier === 'reserve' && input.tier === 'member')) {
        throw appError('VALIDATION_ERROR', {
          issues: [{ code: 'custom', path: ['target'], message: 'This person already participates' }],
        });
      }
    }
    const target: InviteTarget =
      byPublicId !== undefined ? { userId: byPublicId } : { email: email as string };
    return { target, ...(accountId !== undefined && { accountId }) };
  }

  /** GRV-23: o convite é da pessoa? Pelo id da conta ou pelo email dela. Convite aberto é de todos. */
  async function isForUser(invite: StoredInvite, userId: UserId): Promise<boolean> {
    const target = invite.target;
    if (!target) return true;
    if ('userId' in target) return target.userId === userId;
    return (await deps.emails.emailOf(userId)) === target.email;
  }

  /**
   * GRV-19, 20, 43: o convite é do próprio ou de quem está abaixo. Quem criou e saiu do grupo conta como o Todos
   * (`creator` sem participação).
   */
  function canManageInvite(
    userId: UserId,
    membership: StoredMembership,
    roles: GroupRoles,
    invite: StoredInvite,
    creator: StoredMembership | undefined,
  ): boolean {
    if (invite.createdBy === userId) return true;
    return isBelow(membership, creator ?? { role: 'everyone' }, roles);
  }

  /** GRV-18: cria o convite do grupo. */
  async function createInvite(
    userId: UserId,
    publicId: PublicGroupId,
    input: CreateGroupInviteInput,
  ): Promise<GroupInvite> {
    const { id, group, membership, roles } = await access(userId, publicId);
    requirePermission(membership, roles, 'members.invite');
    const { target, accountId } = await resolveTarget(id, input);
    const at = now();
    const existing = await deps.groups.listInvites(id);
    const active = existing.filter((i) => inviteStatus(i, at) === 'active').length;
    if (active >= GROUP_INVITE_MAX_ACTIVE) {
      throw appError('GROUP_INVITE_LIMIT', { limit: GROUP_INVITE_MAX_ACTIVE });
    }
    const expiresAt =
      input.validityDays === null ? undefined : new Date(at.getTime() + input.validityDays * DAY_MS);
    const entity = newEntity<Omit<StoredInvite, 'updatedAt'>>(
      {
        groupId: id,
        token: newToken(),
        createdBy: userId,
        tier: input.tier,
        ...(expiresAt && { expiresAt: expiresAt.toISOString(), ttl: graceTtl(expiresAt) }),
        ...(target ? { target, maxUses: 1 } : input.maxUses !== null && { maxUses: input.maxUses }),
        uses: 0,
        version: 1,
      },
      at,
    );
    const invite: StoredInvite = { ...entity, updatedAt: entity.createdAt };
    await deps.groups.createInvite(invite);
    if (accountId !== undefined) {
      await deps.notifications.notify(accountId, {
        type: 'group_invited',
        title: 'Convite para um grupo',
        body: `Você foi convidado para ${group.name}.`,
        link: `/join/${invite.token}`,
      });
    }
    const people = await profiles([userId, ...(accountId !== undefined ? [accountId] : [])]);
    return inviteView(invite, people, [], at, true);
  }

  /** GRV-19: os convites do grupo, do mais novo para o mais antigo. */
  async function listInvites(userId: UserId, publicId: PublicGroupId): Promise<GroupInvite[]> {
    const { id, membership, roles } = await access(userId, publicId);
    requirePermission(membership, roles, 'members.invite');
    const at = now();
    const [all, uses, participants] = await Promise.all([
      deps.groups.listInvites(id),
      deps.groups.listInviteUses(id),
      deps.groups.listMembers(id),
    ]);
    const invites = all.filter((i) => !isGone(i, at)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const usedBy = (inviteId: string) =>
      uses
        .filter((u) => u.inviteId === inviteId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((u) => u.userId);
    const people = await profiles([
      ...invites.map((i) => i.createdBy),
      ...invites.flatMap((i) => (i.target && 'userId' in i.target ? [i.target.userId] : [])),
      ...uses.map((u) => u.userId),
    ]);
    const holders = new Map(participants.map((m) => [m.userId, m]));
    return invites.map((i) =>
      inviteView(
        i,
        people,
        usedBy(i.id),
        at,
        canManageInvite(userId, membership, roles, i, holders.get(i.createdBy)),
      ),
    );
  }

  /** GRV-20: cancela o convite; o que já não vale não muda. */
  async function revokeInvite(userId: UserId, publicId: PublicGroupId, inviteId: string): Promise<void> {
    const { id, membership, roles } = await access(userId, publicId);
    requirePermission(membership, roles, 'members.invite');
    const invite = await deps.groups.getInvite(id, inviteId);
    if (!invite || isGone(invite, now())) throw appError('GROUP_INVITE_INVALID', { reason: 'not_found' });
    const creator = await deps.groups.getMembership(id, invite.createdBy);
    if (!canManageInvite(userId, membership, roles, invite, creator)) throw appError('GROUP_ROLE_TOO_HIGH');
    if (inviteStatus(invite, now()) !== 'active') return;
    await deps.groups.revokeInvite(invite, now());
  }

  /** O convite do token e o grupo dele; se não vale, `GROUP_INVITE_INVALID` com o motivo (GRV-21). */
  async function validInvite(token: string, consistent = false) {
    const invalid = (reason: GroupInviteInvalidReason) => appError('GROUP_INVITE_INVALID', { reason });
    const pointer = await deps.groups.resolveToken(token);
    if (!pointer) throw invalid('not_found');
    const [invite, group] = await Promise.all([
      deps.groups.getInvite(pointer.groupId, pointer.inviteId, { consistent }),
      deps.groups.get(pointer.groupId),
    ]);
    if (!invite || !group || isGone(invite, now())) throw invalid('not_found');
    const status = inviteStatus(invite, now());
    if (status !== 'active') throw invalid(status);
    return { invite, group };
  }

  /** GRV-21: a apresentação do grupo para quem abre o convite. */
  async function previewInvite(userId: UserId, token: string): Promise<GroupInvitePreview> {
    const { invite, group } = await validInvite(token);
    if (!(await isForUser(invite, userId))) throw appError('GROUP_INVITE_NOT_FOR_YOU');
    const [participants, membership] = await Promise.all([
      deps.groups.countParticipants(group.id),
      deps.groups.getMembership(group.id, userId),
    ]);
    return {
      groupId: group.publicId,
      name: group.name,
      ...(group.logoMediaId !== undefined && { logoUrl: urlOf('group.logo', group.logoMediaId) }),
      ...(group.coverMediaId !== undefined && { coverUrl: urlOf('group.cover', group.coverMediaId) }),
      participants,
      tier: invite.tier,
      ...(membership && { myTier: membership.tier }),
    };
  }

  /** Com limite, cada uso que entra antes faz reler (a condição é `uses` igual ao lido). */
  const JOIN_ATTEMPTS = 5;

  /** GRV-22: entra, sobe de reserva para membro, ou não muda nada. */
  async function joinByInvite(userId: UserId, token: string, attempt = 1): Promise<Group> {
    // Depois de a gravação falhar, a releitura é forte: a condição `uses` igual ao lido precisa do valor atual.
    const { invite, group } = await validInvite(token, attempt > 1);
    if (!(await isForUser(invite, userId))) throw appError('GROUP_INVITE_NOT_FOR_YOU');
    const current = await deps.groups.getMembership(group.id, userId, { consistent: attempt > 1 });
    // Só a reserva com convite de membro muda de situação; os outros casos de quem já participa não mudam nada.
    if (current && !(current.tier === 'reserve' && invite.tier === 'member')) {
      return forViewer(group, current, await deps.groups.getRoles(group.id), deps.media?.urlOf);
    }
    const action: JoinAction = current ? 'promote' : 'join';
    const result = await deps.groups.joinByInvite({ invite, userId, action, now: now() });
    if (result === 'ok') {
      const tier = action === 'join' ? invite.tier : 'member';
      const roles = await deps.groups.getRoles(group.id);
      return forViewer(group, { role: current?.role ?? 'everyone', tier }, roles, deps.media?.urlOf);
    }
    // O convite ou a participação mudaram desde a leitura: relê (o convite sem uso sobrando responde o motivo).
    if (attempt >= JOIN_ATTEMPTS) throw new Error('Group join kept conflicting with other writes');
    return joinByInvite(userId, token, attempt + 1);
  }

  /** GRV-24: os convites pessoais que valem para a pessoa, pelo id público ou pelo email, do mais novo para o mais antigo. */
  async function myInvites(userId: UserId): Promise<MyGroupInvite[]> {
    const email = await deps.emails.emailOf(userId);
    const pointers = (
      await Promise.all([
        deps.groups.listInvitesFor({ userId }),
        email !== undefined ? deps.groups.listInvitesFor({ email }) : [],
      ])
    ).flat();
    const unique = [...new Map(pointers.map((p) => [p.inviteId, p])).values()];
    const at = now();
    const rows = await Promise.all(
      unique.map(async ({ groupId, inviteId }) => {
        const [invite, group, current] = await Promise.all([
          deps.groups.getInvite(groupId, inviteId),
          deps.groups.get(groupId),
          deps.groups.getMembership(groupId, userId),
        ]);
        if (!invite || !group || isGone(invite, at) || inviteStatus(invite, at) !== 'active') return [];
        if (current && !(current.tier === 'reserve' && invite.tier === 'member')) return [];
        return [{ invite, group, current }];
      }),
    );
    const valid = rows.flat().sort((a, b) => b.invite.createdAt.localeCompare(a.invite.createdAt));
    const people = await profiles(valid.map((r) => r.invite.createdBy));
    return Promise.all(
      valid.map(async ({ invite, group, current }) => ({
        id: invite.id,
        token: invite.token,
        groupId: group.publicId,
        name: group.name,
        ...(group.logoMediaId !== undefined && { logoUrl: urlOf('group.logo', group.logoMediaId) }),
        ...(group.coverMediaId !== undefined && { coverUrl: urlOf('group.cover', group.coverMediaId) }),
        participants: await deps.groups.countParticipants(group.id),
        tier: invite.tier,
        ...(current && { myTier: current.tier }),
        invitedBy: profileOf(people, invite.createdBy),
        createdAt: invite.createdAt,
      })),
    );
  }

  /** GRV-24: a pessoa recusa o convite que é para ela; sem aviso para quem convidou. */
  async function declineInvite(userId: UserId, inviteId: string): Promise<void> {
    const pointer = await deps.groups.resolveInviteId(inviteId);
    const invite = pointer && (await deps.groups.getInvite(pointer.groupId, pointer.inviteId));
    if (!invite || isGone(invite, now())) throw appError('GROUP_INVITE_INVALID', { reason: 'not_found' });
    if (!(await isForUser(invite, userId))) throw appError('GROUP_INVITE_NOT_FOR_YOU');
    if (inviteStatus(invite, now()) !== 'active') return;
    await deps.groups.declineInvite(invite, now());
  }

  /** GRV-29: os participantes, o dono primeiro, depois os membros e as reservas, por data de entrada. */
  async function members(userId: UserId, publicId: PublicGroupId): Promise<GroupMember[]> {
    const { id, membership, roles } = await access(userId, publicId);
    // GRV-29, 37: o convite da participação só sai para quem administra os convites.
    const showInvite = permissionsOf(membership, roles).includes('members.invite');
    const list = await deps.groups.listMembers(id);
    const people = await profiles([
      ...list.map((m) => m.userId),
      ...list.flatMap((m) => (m.invitedBy !== undefined ? [m.invitedBy] : [])),
    ]);
    const rank = (m: StoredMembership) => (m.role === 'owner' ? 0 : m.tier === 'member' ? 1 : 2);
    return [...list]
      .sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt))
      .map((m) => {
        const inviter = m.invitedBy;
        return {
          user: profileOf(people, m.userId),
          tier: m.tier,
          role: roleRefOf(m, roles),
          manageable: isBelow(membership, m, roles),
          joinedAt: m.createdAt,
          ...(inviter !== undefined && people.has(inviter) && { invitedBy: profileOf(people, inviter) }),
          ...(showInvite && m.inviteId !== undefined && { inviteId: m.inviteId }),
        };
      });
  }

  /** GRV-30: a pessoa sai; o dono não. */
  async function leave(userId: UserId, publicId: PublicGroupId): Promise<void> {
    const { id, membership } = await access(userId, publicId);
    if (membership.role === 'owner') throw appError('GROUP_OWNER_NOT_REMOVABLE');
    await deps.groups.removeMembership(id, userId);
  }

  /** GRV-31: quem tem `members.remove` remove outra pessoa. */
  async function removeMember(
    userId: UserId,
    publicId: PublicGroupId,
    targetPublicId: PublicUserId,
  ): Promise<void> {
    const { id, membership, roles } = await access(userId, publicId);
    requirePermission(membership, roles, 'members.remove');
    const targetId = (await deps.users.resolve([targetPublicId])).get(targetPublicId);
    const target = targetId && (await deps.groups.getMembership(id, targetId));
    if (targetId === userId) {
      if (membership.role === 'owner') throw appError('GROUP_OWNER_NOT_REMOVABLE');
      throw appError('VALIDATION_ERROR', {
        issues: [{ code: 'custom', path: ['userId'], message: 'Use leave to remove yourself' }],
      });
    }
    if (!targetId || !target) throw appError('GROUP_MEMBER_NOT_FOUND');
    requireBelow(membership, target, roles);
    if (!(await deps.groups.removeMembership(id, targetId))) throw appError('GROUP_MEMBER_NOT_FOUND');
  }

  // ---- Grupo aberto e pedidos (GRV-25–28) ----

  /** GRV-25: quem tem `group.edit` muda o modo de entrada, com a `version` conferida (ADR 0016). */
  async function setJoinMode(
    userId: UserId,
    publicId: PublicGroupId,
    input: SetGroupJoinModeInput,
  ): Promise<Group> {
    const { id, membership, roles } = await access(userId, publicId);
    requirePermission(membership, roles, 'group.edit');
    await deps.groups.setJoinMode(id, input.mode, input.expectedVersion, now());
    const group = await deps.groups.get(id, { consistent: true });
    if (!group) throw appError('GROUP_NOT_FOUND');
    return forViewer(group, membership, roles, deps.media?.urlOf);
  }

  /** O grupo aberto pelo código; o de convite, ou um código que não existe, é `GROUP_NOT_FOUND` (GRV-26, 27). */
  async function openGroup(publicId: PublicGroupId): Promise<StoredGroup> {
    const id = await deps.groups.resolve(publicId);
    const group = id === undefined ? undefined : await deps.groups.get(id);
    if (group?.joinMode !== 'open') throw appError('GROUP_NOT_FOUND');
    return group;
  }

  async function previewOf(
    group: StoredGroup,
    membership: StoredMembership | undefined,
    request: StoredJoinRequest | undefined,
  ): Promise<GroupPreview> {
    return {
      groupId: group.publicId,
      name: group.name,
      ...(group.logoMediaId !== undefined && { logoUrl: urlOf('group.logo', group.logoMediaId) }),
      ...(group.coverMediaId !== undefined && { coverUrl: urlOf('group.cover', group.coverMediaId) }),
      participants: await deps.groups.countParticipants(group.id),
      ...(membership && { myTier: membership.tier }),
      ...(request && { requestedAt: request.createdAt }),
    };
  }

  /** GRV-26: a apresentação do grupo aberto, com a participação ou o pedido de quem pede. */
  async function preview(userId: UserId, publicId: PublicGroupId): Promise<GroupPreview> {
    const group = await openGroup(publicId);
    const [membership, request] = await Promise.all([
      deps.groups.getMembership(group.id, userId),
      deps.groups.getRequest(group.id, userId),
    ]);
    return previewOf(group, membership, request);
  }

  /** GRV-27: pede para entrar; pedir de novo não muda nada nem avisa de novo. */
  async function request(userId: UserId, publicId: PublicGroupId): Promise<GroupPreview> {
    const group = await openGroup(publicId);
    const [membership, existing] = await Promise.all([
      deps.groups.getMembership(group.id, userId),
      deps.groups.getRequest(group.id, userId),
    ]);
    if (membership) {
      throw appError('VALIDATION_ERROR', {
        issues: [{ code: 'custom', path: [], message: 'You already participate in this group' }],
      });
    }
    if (existing) return previewOf(group, undefined, existing);
    const created: StoredJoinRequest = { groupId: group.id, userId, createdAt: now().toISOString() };
    if (!(await deps.groups.putRequest(created))) {
      // Outro pedido da mesma pessoa entrou antes: vale o dele, e quem avisou foi ele.
      const current = await deps.groups.getRequest(group.id, userId, { consistent: true });
      return previewOf(group, undefined, current ?? created);
    }
    await notifyRequest(group, userId);
    return previewOf(group, undefined, created);
  }

  /** GRV-27: o aviso vai para quem pode aceitar (`members.invite`, GRV-15). */
  async function notifyRequest(group: StoredGroup, requesterId: UserId): Promise<void> {
    const [list, people, roles] = await Promise.all([
      deps.groups.listMembers(group.id),
      profiles([requesterId]),
      deps.groups.getRoles(group.id),
    ]);
    const nickname = people.get(requesterId)?.nickname;
    const admins = list.filter((m) => permissionsOf(m, roles).includes('members.invite'));
    await Promise.all(
      admins.map((m) =>
        deps.notifications.notify(m.userId, {
          type: 'group_join_requested',
          title: 'Pedido para entrar',
          body: `${nickname ?? 'Alguém'} pediu para entrar em ${group.name}.`,
          link: `/groups/${group.publicId}/members`,
        }),
      ),
    );
  }

  /** GRV-27: a pessoa cancela o próprio pedido, em qualquer modo; sem pedido, nada muda. */
  async function cancelRequest(userId: UserId, publicId: PublicGroupId): Promise<void> {
    const id = await deps.groups.resolve(publicId);
    if (id === undefined) throw appError('GROUP_NOT_FOUND');
    await deps.groups.deleteRequest(id, userId);
  }

  /** GRV-28: os pedidos do grupo, do mais antigo para o mais novo, com o perfil. */
  async function listRequests(userId: UserId, publicId: PublicGroupId): Promise<GroupJoinRequest[]> {
    const { id, membership, roles } = await access(userId, publicId);
    requirePermission(membership, roles, 'members.invite');
    const list = (await deps.groups.listRequests(id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const people = await profiles(list.map((r) => r.userId));
    // Uma conta que sumiu (AUTH-16) não tem perfil: o pedido dela não aparece.
    return list.flatMap((r) => {
      const user = people.get(r.userId);
      return user ? [{ user, createdAt: r.createdAt }] : [];
    });
  }

  /** Quem administra e o uuid da pessoa do pedido; id público desconhecido → `GROUP_REQUEST_NOT_FOUND` (GRV-28). */
  async function requestTarget(userId: UserId, publicId: PublicGroupId, targetPublicId: PublicUserId) {
    const { id, group, membership, roles } = await access(userId, publicId);
    requirePermission(membership, roles, 'members.invite');
    const targetId = (await deps.users.resolve([targetPublicId])).get(targetPublicId);
    if (targetId === undefined) throw appError('GROUP_REQUEST_NOT_FOUND');
    return { id, group, targetId };
  }

  /** GRV-28: aceita como membro ou reserva; quem já participa (entrou por convite) não muda nem é avisado. */
  async function approveRequest(
    userId: UserId,
    publicId: PublicGroupId,
    targetPublicId: PublicUserId,
    input: ApproveGroupRequestInput,
  ): Promise<void> {
    const { id, group, targetId } = await requestTarget(userId, publicId, targetPublicId);
    const result = await deps.groups.approveRequest({
      groupId: id,
      userId: targetId,
      tier: input.tier,
      now: now(),
    });
    if (result === 'request_gone') throw appError('GROUP_REQUEST_NOT_FOUND');
    if (result === 'already_member') return;
    await deps.notifications.notify(targetId, {
      type: 'group_join_approved',
      title: 'Pedido aceito',
      body: `Você entrou em ${group.name}.`,
      link: `/groups/${group.publicId}`,
    });
  }

  /** GRV-28: recusa sem aviso; a pessoa pode pedir de novo. */
  async function declineRequest(
    userId: UserId,
    publicId: PublicGroupId,
    targetPublicId: PublicUserId,
  ): Promise<void> {
    const { id, targetId } = await requestTarget(userId, publicId, targetPublicId);
    if (!(await deps.groups.deleteRequest(id, targetId, { mustExist: true }))) {
      throw appError('GROUP_REQUEST_NOT_FOUND');
    }
  }

  // ---- Cargos (GRV-40–48) ----

  const validation = (path: string, message: string) =>
    appError('VALIDATION_ERROR', { issues: [{ code: 'custom', path: [path], message }] });

  /** O cargo criado da lista; um id que não está nela é `GROUP_ROLE_NOT_FOUND` (404). */
  function findRole(stored: GroupRoles, roleId: string): StoredRole {
    const found = stored.roles.find((r) => r.id === roleId);
    if (!found) throw appError('GROUP_ROLE_NOT_FOUND');
    return found;
  }

  /** GRV-44: o nome não repete (sem maiúsculas e acentos) nem toma o de um cargo fixo. `except`: o cargo editado. */
  function checkRoleName(stored: GroupRoles, name: string, except?: string): void {
    const wanted = normalizeRoleName(name);
    const taken =
      RESERVED_ROLE_NAMES.includes(wanted) ||
      stored.roles.some((r) => r.id !== except && normalizeRoleName(r.name) === wanted);
    if (taken) throw appError('GROUP_ROLE_NAME_TAKEN');
  }

  /** GRV-44, 45: quem edita só dá e tira as permissões que tem; as outras ficam como estão. */
  function checkGranted(
    membership: StoredMembership,
    stored: GroupRoles,
    before: readonly GroupPermission[],
    after: readonly GroupPermission[],
  ): void {
    const mine = permissionsOf(membership, stored);
    const changed = [
      ...before.filter((p) => !after.includes(p)),
      ...after.filter((p) => !before.includes(p)),
    ];
    const missing = changed.find((p) => !mine.includes(p));
    if (missing) throw appError('GROUP_PERMISSION_DENIED', { permission: missing });
  }

  /** GRV-42: Dono, os criados na ordem e o Todos, com a contagem de pessoas e o que quem pede pode mexer. */
  async function rolesView(
    id: StoredGroup['id'],
    membership: StoredMembership,
    consistent: boolean,
  ): Promise<GroupRolesView> {
    const [stored, list] = await Promise.all([
      deps.groups.getRoles(id, { consistent }),
      deps.groups.listMembers(id),
    ]);
    const count = (roleId: string) => list.filter((m) => roleRefOf(m, stored).id === roleId).length;
    const mine = rankOf(membership, stored);
    const items: GroupRoleItem[] = [
      {
        id: 'owner',
        permissions: permissionsOf({ role: 'owner' }, stored),
        members: count('owner'),
        manageable: false,
        fixed: 'owner',
      },
      ...stored.roles.map((r) => ({
        id: r.id,
        name: r.name,
        permissions: r.permissions,
        members: count(r.id),
        manageable: mine > rankOf({ role: r.id }, stored),
      })),
      {
        id: 'everyone',
        permissions: stored.everyonePermissions,
        members: count('everyone'),
        manageable: mine > 0,
        fixed: 'everyone',
      },
    ];
    return { version: stored.version, roles: items };
  }

  /** GRV-42: quem tem `roles.manage` vê os cargos. */
  async function listRoles(userId: UserId, publicId: PublicGroupId): Promise<GroupRolesView> {
    const { id, membership, roles } = await access(userId, publicId);
    requirePermission(membership, roles, 'roles.manage');
    return rolesView(id, membership, false);
  }

  /** O que as edições dos cargos têm em comum: quem pode, e os cargos lidos com força (a `version` confere na gravação). */
  async function editAccess(userId: UserId, publicId: PublicGroupId) {
    const { id, membership, roles } = await access(userId, publicId);
    requirePermission(membership, roles, 'roles.manage');
    return { id, membership, stored: await deps.groups.getRoles(id, { consistent: true }) };
  }

  /** GRV-44: cria o cargo, logo acima do Todos. */
  async function createRole(
    userId: UserId,
    publicId: PublicGroupId,
    input: CreateGroupRoleInput,
  ): Promise<GroupRolesView> {
    const { id, membership, stored } = await editAccess(userId, publicId);
    checkRoleName(stored, input.name);
    checkGranted(membership, stored, [], input.permissions);
    if (stored.roles.length >= GROUP_ROLE_MAX) throw appError('GROUP_ROLE_LIMIT', { limit: GROUP_ROLE_MAX });
    const role: StoredRole = {
      id: randomUUID(),
      name: input.name,
      permissions: [...new Set(input.permissions)],
    };
    await deps.groups.saveRoles(
      id,
      { roles: [...stored.roles, role], everyonePermissions: stored.everyonePermissions },
      input.expectedVersion,
      now(),
    );
    return rolesView(id, membership, true);
  }

  /** GRV-45: edita um cargo abaixo do seu; no Todos, só as permissões (o nome é ignorado). */
  async function updateRole(
    userId: UserId,
    publicId: PublicGroupId,
    roleId: string,
    input: UpdateGroupRoleInput,
  ): Promise<GroupRolesView> {
    const { id, membership, stored } = await editAccess(userId, publicId);
    const permissions = [...new Set(input.permissions)];
    if (roleId === 'everyone') {
      if (permissions.some((p) => NOT_FOR_EVERYONE.includes(p))) {
        throw validation('permissions', 'Everyone cannot have this permission');
      }
      checkGranted(membership, stored, stored.everyonePermissions, permissions);
      await deps.groups.saveRoles(
        id,
        { roles: stored.roles, everyonePermissions: permissions },
        input.expectedVersion,
        now(),
      );
      return rolesView(id, membership, true);
    }
    // O Dono ('owner') nunca está abaixo de ninguém; um id que não existe é 404.
    if (roleId !== 'owner') findRole(stored, roleId);
    requireBelow(membership, { role: roleId }, stored);
    const role = findRole(stored, roleId);
    checkRoleName(stored, input.name, roleId);
    checkGranted(membership, stored, role.permissions, permissions);
    await deps.groups.saveRoles(
      id,
      {
        roles: stored.roles.map((r) => (r.id === roleId ? { ...r, name: input.name, permissions } : r)),
        everyonePermissions: stored.everyonePermissions,
      },
      input.expectedVersion,
      now(),
    );
    return rolesView(id, membership, true);
  }

  /**
   * GRV-46: a lista nova dos cargos criados. O próprio cargo de quem ordena e os de cima precisam ficar onde estavam
   * (senão `GROUP_ROLE_TOO_HIGH`); o resto muda entre si.
   */
  async function orderRoles(
    userId: UserId,
    publicId: PublicGroupId,
    input: OrderGroupRolesInput,
  ): Promise<GroupRolesView> {
    const { id, membership, stored } = await editAccess(userId, publicId);
    const wanted = input.roleIds;
    const same =
      wanted.length === stored.roles.length &&
      new Set(wanted).size === wanted.length &&
      stored.roles.every((r) => wanted.includes(r.id));
    if (!same) throw validation('roleIds', 'The list must have exactly the created roles');
    const mine = rankOf(membership, stored);
    const moved = stored.roles.some((r, i) => rankOf({ role: r.id }, stored) >= mine && wanted[i] !== r.id);
    if (moved) throw appError('GROUP_ROLE_TOO_HIGH');
    await deps.groups.saveRoles(
      id,
      {
        roles: wanted.map((roleId) => findRole(stored, roleId)),
        everyonePermissions: stored.everyonePermissions,
      },
      input.expectedVersion,
      now(),
    );
    return rolesView(id, membership, true);
  }

  /**
   * GRV-47: apaga um cargo abaixo do seu. As pessoas dele passam a valer o Todos na hora (o id que já não está na
   * lista é o Todos, GRV-41), sem reescrever cada participação.
   */
  async function deleteRole(
    userId: UserId,
    publicId: PublicGroupId,
    roleId: string,
    input: DeleteGroupRoleInput,
  ): Promise<GroupRolesView> {
    const { id, membership, stored } = await editAccess(userId, publicId);
    if (roleId === 'everyone') throw validation('roleId', 'The Everyone role cannot be deleted');
    if (roleId !== 'owner') findRole(stored, roleId);
    requireBelow(membership, { role: roleId }, stored);
    await deps.groups.saveRoles(
      id,
      {
        roles: stored.roles.filter((r) => r.id !== roleId),
        everyonePermissions: stored.everyonePermissions,
      },
      input.expectedVersion,
      now(),
    );
    return rolesView(id, membership, true);
  }

  /** GRV-48: muda o cargo de uma pessoa abaixo do seu para um cargo abaixo (ou o Todos). Sem `version`. */
  async function setMemberRole(
    userId: UserId,
    publicId: PublicGroupId,
    targetPublicId: PublicUserId,
    input: SetMemberRoleInput,
  ): Promise<void> {
    const { id, group, membership, roles } = await access(userId, publicId);
    requirePermission(membership, roles, 'roles.manage');
    const targetId = (await deps.users.resolve([targetPublicId])).get(targetPublicId);
    if (targetId === userId) throw appError('GROUP_ROLE_TOO_HIGH');
    const target = targetId && (await deps.groups.getMembership(id, targetId));
    if (!targetId || !target) throw appError('GROUP_MEMBER_NOT_FOUND');
    requireBelow(membership, target, roles);
    const role = input.roleId === 'everyone' ? undefined : findRole(roles, input.roleId);
    requireBelow(membership, { role: input.roleId }, roles);
    if (roleRefOf(target, roles).id === input.roleId) return;
    if (!(await deps.groups.setMemberRole(id, targetId, input.roleId))) {
      throw appError('GROUP_MEMBER_NOT_FOUND');
    }
    if (role) {
      await deps.notifications.notify(targetId, {
        type: 'group_role_granted',
        title: 'Novo cargo',
        body: `Você agora é ${role.name} em ${group.name}.`,
        link: `/groups/${group.publicId}`,
      });
    }
  }

  /**
   * GRV-49: o Dono passa o grupo para um membro; o dono antigo fica com o cargo que o novo tinha. Se uma participação
   * mudou entre a leitura e a gravação, relê e decide de novo.
   */
  async function transfer(
    userId: UserId,
    publicId: PublicGroupId,
    input: TransferGroupInput,
    attempt = 0,
  ): Promise<void> {
    const { id, group, membership } = await access(userId, publicId);
    if (membership.role !== 'owner') throw appError('GROUP_OWNER_ONLY');
    const targetId = (await deps.users.resolve([input.userPublicId])).get(input.userPublicId);
    if (targetId === userId) throw validation('userPublicId', 'The group cannot be passed to yourself');
    const target = targetId && (await deps.groups.getMembership(id, targetId));
    if (!targetId || !target) throw appError('GROUP_MEMBER_NOT_FOUND');
    if (target.tier !== 'member')
      throw validation('userPublicId', 'The group can only be passed to a member');
    const result = await deps.groups.transferGroup({
      groupId: id,
      fromUserId: userId,
      toUserId: targetId,
      toRole: target.role,
      now: now(),
    });
    if (result === 'conflict') {
      if (attempt >= 2) throw new Error('Group transfer kept conflicting');
      return transfer(userId, publicId, input, attempt + 1);
    }
    await deps.notifications.notify(targetId, {
      type: 'group_transferred',
      title: 'Você recebeu o grupo',
      body: `Você agora é o dono de ${group.name}.`,
      link: `/groups/${group.publicId}`,
    });
  }

  return {
    transfer,
    roles: listRoles,
    createRole,
    updateRole,
    orderRoles,
    deleteRole,
    setMemberRole,
    create,
    get,
    mine,
    createInvite,
    listInvites,
    revokeInvite,
    previewInvite,
    joinByInvite,
    myInvites,
    declineInvite,
    members,
    leave,
    removeMember,
    setJoinMode,
    preview,
    request,
    cancelRequest,
    listRequests,
    approveRequest,
    declineRequest,
  };
}
