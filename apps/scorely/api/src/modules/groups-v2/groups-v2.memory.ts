import { asUserId } from '@scorely/api/src/lib/ids';
import {
  type GroupV2Repository,
  graceTtl,
  type StoredGroupV2,
  type StoredInviteUseV2,
  type StoredInviteV2,
  type StoredMembershipV2,
} from '@scorely/api/src/modules/groups-v2/group-v2.repository';
import type { GroupsV2Deps } from '@scorely/api/src/modules/groups-v2/group-v2.service';
import type { PublicGroupId } from '@scorely/contracts';

export const ANA = asUserId('11111111-1111-4111-8111-111111111111');
export const BIA = asUserId('22222222-2222-4222-8222-222222222222');

/** Fakes das deps que o teste não usa: nenhuma conta tem email (GRV-23) e nenhum aviso sai. */
export const noEmails: GroupsV2Deps['emails'] = {
  emailOf: async () => undefined,
  userIdOf: async () => undefined,
};
export const noNotifications: GroupsV2Deps['notifications'] = { notify: async () => undefined };

export function pid(code: string): PublicGroupId {
  return code as PublicGroupId;
}

/** Repositório em memória: grava como a transação (a posse do código público é única; o resto vem junto). */
export function memoryGroupsV2() {
  const groups = new Map<string, StoredGroupV2>();
  const lookup = new Map<string, StoredGroupV2['id']>();
  const members = new Map<string, StoredMembershipV2>();
  const invites = new Map<string, StoredInviteV2>();
  const tokens = new Map<string, { groupId: StoredGroupV2['id']; inviteId: string }>();
  const uses = new Map<string, StoredInviteUseV2>();
  const calls = { create: 0 };
  const inviteKey = (groupId: string, inviteId: string) => `${groupId}#${inviteId}`;
  const repo: GroupV2Repository = {
    async create(group, ownerId) {
      calls.create += 1;
      if (lookup.has(group.publicId)) return 'public_id_taken';
      groups.set(group.id, { ...group });
      lookup.set(group.publicId, group.id);
      members.set(`${group.id}#${ownerId}`, {
        groupId: group.id,
        userId: ownerId,
        tier: 'member',
        role: 'owner',
        createdAt: group.createdAt,
      });
      return 'created';
    },
    async resolve(publicId) {
      return lookup.get(publicId);
    },
    async get(id) {
      return groups.get(id);
    },
    async getMembership(id, userId) {
      return members.get(`${id}#${userId}`);
    },
    async listMine(userId) {
      return [...members.values()]
        .filter((m) => m.userId === userId)
        .flatMap((membership) => {
          const group = groups.get(membership.groupId);
          return group ? [{ group, membership }] : [];
        });
    },
    async createInvite(invite) {
      invites.set(inviteKey(invite.groupId, invite.id), { ...invite });
      tokens.set(invite.token, { groupId: invite.groupId, inviteId: invite.id });
    },
    async listInvites(groupId) {
      return [...invites.values()].filter((i) => i.groupId === groupId).map((i) => ({ ...i }));
    },
    async getInvite(groupId, inviteId) {
      const invite = invites.get(inviteKey(groupId, inviteId));
      return invite && { ...invite };
    },
    async resolveToken(token) {
      return tokens.get(token);
    },
    async revokeInvite({ groupId, id: inviteId }, at) {
      const invite = invites.get(inviteKey(groupId, inviteId));
      if (!invite || invite.revokedAt !== undefined) return;
      invites.set(inviteKey(groupId, inviteId), {
        ...invite,
        revokedAt: at.toISOString(),
        ttl: graceTtl(at),
        updatedAt: at.toISOString(),
        version: invite.version + 1,
      });
    },
    async listInvitesFor(target) {
      return [...invites.values()]
        .filter((i) => {
          const t = i.target;
          if (!t) return false;
          return 'userId' in target
            ? 'userId' in t && t.userId === target.userId
            : 'email' in t && t.email === target.email;
        })
        .map((i) => ({ groupId: i.groupId, inviteId: i.id }));
    },
    async resolveInviteId(inviteId) {
      const found = [...invites.values()].find((i) => i.id === inviteId && i.target !== undefined);
      return found && { groupId: found.groupId, inviteId: found.id };
    },
    async declineInvite({ groupId, id: inviteId }, at) {
      const invite = invites.get(inviteKey(groupId, inviteId));
      if (!invite || invite.declinedAt !== undefined) return;
      invites.set(inviteKey(groupId, inviteId), {
        ...invite,
        declinedAt: at.toISOString(),
        ttl: graceTtl(at),
        updatedAt: at.toISOString(),
        version: invite.version + 1,
      });
    },
    async listInviteUses(groupId) {
      return [...uses.values()].filter((u) => u.groupId === groupId);
    },
    async joinByInvite({ invite, userId, action, now }) {
      const stored = invites.get(inviteKey(invite.groupId, invite.id));
      const valid =
        stored !== undefined &&
        stored.revokedAt === undefined &&
        stored.declinedAt === undefined &&
        (stored.expiresAt === undefined || stored.expiresAt > now.toISOString()) &&
        (stored.maxUses === undefined || stored.uses < stored.maxUses);
      if (!valid) return 'invite_stale';
      const memberKey = `${invite.groupId}#${userId}`;
      const current = members.get(memberKey);
      if (action === 'join' ? current !== undefined : current?.tier !== 'reserve') return 'membership_stale';
      const lastUse = stored.maxUses !== undefined && stored.uses + 1 >= stored.maxUses;
      invites.set(inviteKey(invite.groupId, invite.id), {
        ...stored,
        uses: stored.uses + 1,
        ...(lastUse && { ttl: graceTtl(now) }),
        updatedAt: now.toISOString(),
        version: stored.version + 1,
      });
      members.set(
        memberKey,
        action === 'join'
          ? {
              groupId: invite.groupId,
              userId,
              tier: invite.tier,
              role: 'member',
              createdAt: now.toISOString(),
              inviteId: invite.id,
              invitedBy: invite.createdBy,
            }
          : {
              ...(current as StoredMembershipV2),
              tier: 'member',
              inviteId: invite.id,
              invitedBy: invite.createdBy,
            },
      );
      uses.set(`${inviteKey(invite.groupId, invite.id)}#${userId}`, {
        groupId: invite.groupId,
        inviteId: invite.id,
        userId,
        createdAt: now.toISOString(),
      });
      return 'ok';
    },
    async listMembers(groupId) {
      return [...members.values()].filter((m) => m.groupId === groupId);
    },
    async countParticipants(groupId) {
      return [...members.values()].filter((m) => m.groupId === groupId).length;
    },
    async removeMembership(groupId, userId) {
      return members.delete(`${groupId}#${userId}`);
    },
  };
  return { repo, groups, lookup, members, invites, tokens, uses, calls };
}
