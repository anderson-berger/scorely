// Participação: os participantes, sair e remover (GRV-29–31).
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import type { StoredMembership } from '@scorely/api/src/modules/groups/data/groups.repository';
import type { GroupsDeps } from '@scorely/api/src/modules/groups/groups.service';
import { loadProfiles, profileOf, requireMembership } from '@scorely/api/src/modules/groups/rules/groups';
import {
  isBelow,
  permissionsOf,
  requireBelow,
  requirePermission,
  roleRefOf,
} from '@scorely/api/src/modules/groups/rules/permissions';
import type { GroupMember, PublicGroupId, PublicUserId } from '@scorely/contracts';

/** GRV-29: os participantes, o dono primeiro, depois os membros e as reservas, por data de entrada. */
export async function members(
  deps: GroupsDeps,
  userId: UserId,
  publicId: PublicGroupId,
): Promise<GroupMember[]> {
  const { id, membership, roles } = await requireMembership(deps, userId, publicId);
  // GRV-29, 37: o convite da participação só sai para quem administra os convites.
  const showInvite = permissionsOf(membership, roles).includes('members.invite');
  const list = await deps.groups.listMembers(id);
  const people = await loadProfiles(deps, [
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
export async function leave(deps: GroupsDeps, userId: UserId, publicId: PublicGroupId): Promise<void> {
  const { id, membership } = await requireMembership(deps, userId, publicId);
  if (membership.role === 'owner') throw appError('GROUP_OWNER_NOT_REMOVABLE');
  await deps.groups.removeMembership(id, userId);
}

/** GRV-31: quem tem `members.remove` remove outra pessoa. */
export async function removeMember(
  deps: GroupsDeps,
  userId: UserId,
  publicId: PublicGroupId,
  targetPublicId: PublicUserId,
): Promise<void> {
  const { id, membership, roles } = await requireMembership(deps, userId, publicId);
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
