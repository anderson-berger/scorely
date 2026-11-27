// Convites: criar, listar, cancelar, abrir e entrar, e os convites pessoais (GRV-18–24).
import { randomBytes } from 'node:crypto';
import { normalizeEmail } from '@scorely/api/src/lib/email';
import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import {
  graceTtl,
  type InviteTarget,
  type JoinAction,
  type StoredGroup,
  type StoredInvite,
  type StoredMembership,
} from '@scorely/api/src/modules/groups/data/groups.repository';
import { forViewer, type GroupContext } from '@scorely/api/src/modules/groups/rules/groups';
import {
  type GroupRoles,
  isBelow,
  requirePermission,
} from '@scorely/api/src/modules/groups/rules/permissions';
import {
  type CreateGroupInviteInput,
  GROUP_INVITE_MAX_ACTIVE,
  GROUP_PARTICIPANT_MAX,
  type Group,
  type GroupInvite,
  type GroupInviteInvalidReason,
  type GroupInvitePreview,
  type GroupInviteStatus,
  type MyGroupInvite,
  type PublicGroupId,
  type User,
} from '@scorely/contracts';

const DAY_MS = 24 * 60 * 60 * 1000;
const newInviteToken = () => randomBytes(32).toString('base64url');

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

export function inviteRules(ctx: GroupContext) {
  const { deps, now, urlOf, access, profiles, profileOf } = ctx;
  const newToken = deps.newToken ?? newInviteToken;

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
    // GRV-23: o convite para uma pessoa tem prazo (o contrato já recusa; aqui vale para quem chama o service direto).
    if (input.validityDays === null) {
      throw appError('VALIDATION_ERROR', {
        issues: [{ code: 'custom', path: ['validityDays'], message: 'A personal invite must expire' }],
      });
    }
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
    if (result === 'group_full') throw appError('GROUP_FULL', { limit: GROUP_PARTICIPANT_MAX });
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

  /**
   * GRV-24: a pessoa recusa o convite que é para ela; sem aviso para quem convidou. Só os lookups dela (a conta e o
   * email) acham o convite: o de outra pessoa é `not_found`.
   */
  async function declineInvite(userId: UserId, inviteId: string): Promise<void> {
    const email = await deps.emails.emailOf(userId);
    const pointer = await deps.groups.findPersonalInvite(inviteId, { userId, email });
    const invite = pointer && (await deps.groups.getInvite(pointer.groupId, pointer.inviteId));
    if (!invite || isGone(invite, now())) throw appError('GROUP_INVITE_INVALID', { reason: 'not_found' });
    if (inviteStatus(invite, now()) !== 'active') return;
    await deps.groups.declineInvite(invite, now());
  }

  return {
    createInvite,
    listInvites,
    revokeInvite,
    previewInvite,
    joinByInvite,
    myInvites,
    declineInvite,
  };
}
