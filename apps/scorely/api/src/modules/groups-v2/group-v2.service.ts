import { randomBytes } from 'node:crypto';
import { normalizeEmail } from '@scorely/api/src/lib/email';
import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import { permissionsOf, requirePermission } from '@scorely/api/src/modules/groups-v2/group-v2.permissions';
import {
  type GroupV2Repository,
  graceTtl,
  type InviteTargetV2,
  type JoinActionV2,
  type StoredGroupV2,
  type StoredInviteV2,
  type StoredMembershipV2,
} from '@scorely/api/src/modules/groups-v2/group-v2.repository';
import { newPublicGroupId } from '@scorely/api/src/modules/groups-v2/public-id';
import { type MediaService, mediaService } from '@scorely/api/src/modules/media/media.service';
import type { NotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import type { UserDirectory, UserRecord } from '@scorely/api/src/modules/users/user.repository';
import {
  type CreateGroupInviteV2Input,
  type CreateGroupV2Input,
  GROUP_INVITE_MAX_ACTIVE,
  type GroupInviteInvalidReasonV2,
  type GroupInvitePreviewV2,
  type GroupInviteStatusV2,
  type GroupInviteV2,
  type GroupMemberV2,
  type GroupV2,
  type MyGroupInviteV2,
  type PublicGroupId,
  type PublicUserId,
  type User,
} from '@scorely/contracts';

/** MID-12: monta a URL pública pela finalidade e o id da mídia. */
export type UrlOf = MediaService['urlOf'];
const productionUrlOf: UrlOf = (purpose, mediaId) => mediaService.urlOf(purpose, mediaId);

/** GRV-08: um código em uso (chance desprezível) sorteia outro, até 3 vezes (como o id público do usuário). */
const PUBLIC_ID_ATTEMPTS = 3;

/** GRV-05: ordem de nome sem diferenciar maiúsculas e acentos. */
const byName = new Intl.Collator('pt-BR', { sensitivity: 'base' });

export interface GroupsV2Deps {
  groups: GroupV2Repository;
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
  /** GRV-23: o aviso `group_invited`. */
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
function inviteStatus(invite: StoredInviteV2, now: Date): GroupInviteStatusV2 {
  if (invite.revokedAt !== undefined) return 'revoked';
  if (invite.declinedAt !== undefined) return 'declined';
  if (invite.maxUses !== undefined && invite.uses >= invite.maxUses) return 'exhausted';
  if (invite.expiresAt !== undefined && invite.expiresAt <= now.toISOString()) return 'expired';
  return 'active';
}

/** GRV-19: o convite que deixou de valer há mais de 30 dias já não aparece (o `ttl` do banco atrasa até ~48 h). */
const isGone = (invite: StoredInviteV2, now: Date) =>
  invite.ttl !== undefined && invite.ttl * 1000 <= now.getTime();

/** O grupo para quem pede: o id público no lugar do uuid (GRV-08), o papel (GRV-04) e as URLs das imagens (GRV-10). */
export function forViewer(
  group: StoredGroupV2,
  membership: Pick<StoredMembershipV2, 'role' | 'tier'>,
  urlOf: UrlOf = productionUrlOf,
): GroupV2 {
  return {
    id: group.publicId,
    createdAt: group.createdAt,
    version: group.version,
    name: group.name,
    myTier: membership.tier,
    myRole: membership.role,
    myPermissions: permissionsOf(membership),
    ...(group.logoMediaId !== undefined && { logoUrl: urlOf('group.logo', group.logoMediaId) }),
    ...(group.coverMediaId !== undefined && { coverUrl: urlOf('group.cover', group.coverMediaId) }),
  };
}

export function createGroupV2Service(deps: GroupsV2Deps) {
  const now = deps.now ?? (() => new Date());
  const newPublicId = deps.newPublicId ?? newPublicGroupId;

  /** GRV-01, 02, 03, 08: o nome já vem validado pelo contrato; quem cria é o dono. */
  async function create(userId: UserId, input: CreateGroupV2Input, attempt = 1): Promise<GroupV2> {
    // `newEntity` gera o id do sistema (uuid) e o `createdAt`; o `updatedAt` nasce igual (ADR 0013).
    const entity = newEntity<Omit<StoredGroupV2, 'updatedAt'>>(
      { publicId: newPublicId(), name: input.name, joinMode: 'invite', version: 1 },
      now(),
    );
    const group: StoredGroupV2 = { ...entity, updatedAt: entity.createdAt };
    const result = await deps.groups.create(group, userId);
    if (result === 'public_id_taken') {
      if (attempt >= PUBLIC_ID_ATTEMPTS) throw new Error('Could not allocate a group public id');
      return create(userId, input, attempt + 1);
    }
    return forViewer(group, { role: 'owner', tier: 'member' }, deps.media?.urlOf);
  }

  /** GRV-04: quem não participa, ou um código que não existe, recebe `GROUP_NOT_FOUND`. */
  async function get(userId: UserId, publicId: PublicGroupId): Promise<GroupV2> {
    const id = await deps.groups.resolve(publicId);
    if (id === undefined) throw appError('GROUP_NOT_FOUND');
    const [group, membership] = await Promise.all([
      deps.groups.get(id),
      deps.groups.getMembership(id, userId),
    ]);
    if (!group || !membership) throw appError('GROUP_NOT_FOUND');
    return forViewer(group, membership, deps.media?.urlOf);
  }

  /** GRV-05: os grupos de que a pessoa participa, por nome. */
  async function mine(userId: UserId): Promise<GroupV2[]> {
    const rows = await deps.groups.listMine(userId);
    return rows
      .map(({ group, membership }) => forViewer(group, membership, deps.media?.urlOf))
      .sort((a, b) => byName.compare(a.name, b.name));
  }

  const urlOf: UrlOf = (purpose, mediaId) => (deps.media?.urlOf ?? productionUrlOf)(purpose, mediaId);
  const newToken = deps.newToken ?? newInviteToken;

  /** Quem participa e o grupo; senão `GROUP_NOT_FOUND` (GRV-04, 15). */
  async function access(userId: UserId, publicId: PublicGroupId) {
    const id = await deps.groups.resolve(publicId);
    if (id === undefined) throw appError('GROUP_NOT_FOUND');
    const [group, membership] = await Promise.all([
      deps.groups.get(id),
      deps.groups.getMembership(id, userId),
    ]);
    if (!group || !membership) throw appError('GROUP_NOT_FOUND');
    return { id, group, membership };
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
    invite: StoredInviteV2,
    people: Map<UserId, User>,
    usedBy: readonly UserId[],
    at: Date,
  ): GroupInviteV2 {
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
    groupId: StoredGroupV2['id'],
    input: CreateGroupInviteV2Input,
  ): Promise<{ target?: InviteTargetV2; accountId?: UserId }> {
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
    const target: InviteTargetV2 =
      byPublicId !== undefined ? { userId: byPublicId } : { email: email as string };
    return { target, ...(accountId !== undefined && { accountId }) };
  }

  /** GRV-23: o convite é da pessoa? Pelo id da conta ou pelo email dela. Convite aberto é de todos. */
  async function isForUser(invite: StoredInviteV2, userId: UserId): Promise<boolean> {
    const target = invite.target;
    if (!target) return true;
    if ('userId' in target) return target.userId === userId;
    return (await deps.emails.emailOf(userId)) === target.email;
  }

  /** GRV-18: cria o convite do grupo. */
  async function createInvite(
    userId: UserId,
    publicId: PublicGroupId,
    input: CreateGroupInviteV2Input,
  ): Promise<GroupInviteV2> {
    const { id, group, membership } = await access(userId, publicId);
    requirePermission(membership, 'members.invite');
    const { target, accountId } = await resolveTarget(id, input);
    const at = now();
    const existing = await deps.groups.listInvites(id);
    const active = existing.filter((i) => inviteStatus(i, at) === 'active').length;
    if (active >= GROUP_INVITE_MAX_ACTIVE) {
      throw appError('GROUP_INVITE_LIMIT', { limit: GROUP_INVITE_MAX_ACTIVE });
    }
    const expiresAt =
      input.validityDays === null ? undefined : new Date(at.getTime() + input.validityDays * DAY_MS);
    const entity = newEntity<Omit<StoredInviteV2, 'updatedAt'>>(
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
    const invite: StoredInviteV2 = { ...entity, updatedAt: entity.createdAt };
    await deps.groups.createInvite(invite);
    if (accountId !== undefined) {
      await deps.notifications.notify(accountId, {
        type: 'group_invited',
        title: 'Convite para um grupo',
        body: `Você foi convidado para ${group.name}.`,
        link: `/v2/join/${invite.token}`,
      });
    }
    const people = await profiles([userId, ...(accountId !== undefined ? [accountId] : [])]);
    return inviteView(invite, people, [], at);
  }

  /** GRV-19: os convites do grupo, do mais novo para o mais antigo. */
  async function listInvites(userId: UserId, publicId: PublicGroupId): Promise<GroupInviteV2[]> {
    const { id, membership } = await access(userId, publicId);
    requirePermission(membership, 'members.invite');
    const at = now();
    const [all, uses] = await Promise.all([deps.groups.listInvites(id), deps.groups.listInviteUses(id)]);
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
    return invites.map((i) => inviteView(i, people, usedBy(i.id), at));
  }

  /** GRV-20: cancela o convite; o que já não vale não muda. */
  async function revokeInvite(userId: UserId, publicId: PublicGroupId, inviteId: string): Promise<void> {
    const { id, membership } = await access(userId, publicId);
    requirePermission(membership, 'members.invite');
    const invite = await deps.groups.getInvite(id, inviteId);
    if (!invite || isGone(invite, now())) throw appError('GROUP_INVITE_INVALID', { reason: 'not_found' });
    if (inviteStatus(invite, now()) !== 'active') return;
    await deps.groups.revokeInvite(invite, now());
  }

  /** O convite do token e o grupo dele; se não vale, `GROUP_INVITE_INVALID` com o motivo (GRV-21). */
  async function validInvite(token: string, consistent = false) {
    const invalid = (reason: GroupInviteInvalidReasonV2) => appError('GROUP_INVITE_INVALID', { reason });
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
  async function previewInvite(userId: UserId, token: string): Promise<GroupInvitePreviewV2> {
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
  async function joinByInvite(userId: UserId, token: string, attempt = 1): Promise<GroupV2> {
    // Depois de a gravação falhar, a releitura é forte: a condição `uses` igual ao lido precisa do valor atual.
    const { invite, group } = await validInvite(token, attempt > 1);
    if (!(await isForUser(invite, userId))) throw appError('GROUP_INVITE_NOT_FOR_YOU');
    const current = await deps.groups.getMembership(group.id, userId, { consistent: attempt > 1 });
    // Só a reserva com convite de membro muda de situação; os outros casos de quem já participa não mudam nada.
    if (current && !(current.tier === 'reserve' && invite.tier === 'member')) {
      return forViewer(group, current, deps.media?.urlOf);
    }
    const action: JoinActionV2 = current ? 'promote' : 'join';
    const result = await deps.groups.joinByInvite({ invite, userId, action, now: now() });
    if (result === 'ok') {
      const tier = action === 'join' ? invite.tier : 'member';
      return forViewer(group, { role: current?.role ?? 'member', tier }, deps.media?.urlOf);
    }
    // O convite ou a participação mudaram desde a leitura: relê (o convite sem uso sobrando responde o motivo).
    if (attempt >= JOIN_ATTEMPTS) throw new Error('Group join kept conflicting with other writes');
    return joinByInvite(userId, token, attempt + 1);
  }

  /** GRV-24: os convites pessoais que valem para a pessoa, pelo id público ou pelo email, do mais novo para o mais antigo. */
  async function myInvites(userId: UserId): Promise<MyGroupInviteV2[]> {
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
  async function members(userId: UserId, publicId: PublicGroupId): Promise<GroupMemberV2[]> {
    const { id, membership } = await access(userId, publicId);
    // GRV-29, 37: o convite da participação só sai para quem administra os convites.
    const showInvite = permissionsOf(membership).includes('members.invite');
    const list = await deps.groups.listMembers(id);
    const people = await profiles([
      ...list.map((m) => m.userId),
      ...list.flatMap((m) => (m.invitedBy !== undefined ? [m.invitedBy] : [])),
    ]);
    const rank = (m: StoredMembershipV2) => (m.role === 'owner' ? 0 : m.tier === 'member' ? 1 : 2);
    return [...list]
      .sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt))
      .map((m) => {
        const inviter = m.invitedBy;
        return {
          user: profileOf(people, m.userId),
          tier: m.tier,
          role: m.role,
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
    const { id, membership } = await access(userId, publicId);
    requirePermission(membership, 'members.remove');
    const targetId = (await deps.users.resolve([targetPublicId])).get(targetPublicId);
    const target = targetId && (await deps.groups.getMembership(id, targetId));
    if (target && target.role === 'owner') throw appError('GROUP_OWNER_NOT_REMOVABLE');
    if (targetId === userId) {
      throw appError('VALIDATION_ERROR', {
        issues: [{ code: 'custom', path: ['userId'], message: 'Use leave to remove yourself' }],
      });
    }
    if (!targetId || !target) throw appError('GROUP_MEMBER_NOT_FOUND');
    if (!(await deps.groups.removeMembership(id, targetId))) throw appError('GROUP_MEMBER_NOT_FOUND');
  }

  return {
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
  };
}
