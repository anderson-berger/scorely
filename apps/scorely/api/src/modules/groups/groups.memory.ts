import { appError } from '@scorely/api/src/lib/errors';
import { asUserId } from '@scorely/api/src/lib/ids';
import {
  type GroupRepository,
  graceTtl,
  type StoredGroup,
  type StoredInvite,
  type StoredInviteUse,
  type StoredJoinRequest,
  type StoredMembership,
  type StoredRoles,
} from '@scorely/api/src/modules/groups/group.repository';
import type { GroupsDeps } from '@scorely/api/src/modules/groups/group.service';
import { GROUP_PARTICIPANT_MAX, type PublicGroupId } from '@scorely/contracts';

export const ANA = asUserId('11111111-1111-4111-8111-111111111111');
export const BIA = asUserId('22222222-2222-4222-8222-222222222222');

/** Fakes das deps que o teste não usa: nenhuma conta tem email (GRV-23) e nenhum aviso sai. */
export const noEmails: GroupsDeps['emails'] = {
  emailOf: async () => undefined,
  userIdOf: async () => undefined,
};
export const noNotifications: GroupsDeps['notifications'] = { notify: async () => undefined };

export function pid(code: string): PublicGroupId {
  return code as PublicGroupId;
}

/** Repositório em memória: grava como a transação (a posse do código público é única; o resto vem junto). */
export function memoryGroups() {
  const groups = new Map<string, StoredGroup>();
  const lookup = new Map<string, StoredGroup['id']>();
  const members = new Map<string, StoredMembership>();
  const invites = new Map<string, StoredInvite>();
  const tokens = new Map<string, { groupId: StoredGroup['id']; inviteId: string }>();
  const uses = new Map<string, StoredInviteUse>();
  const requests = new Map<string, StoredJoinRequest>();
  const rolesByGroup = new Map<string, StoredRoles>();
  const calls = { create: 0 };
  const inviteKey = (groupId: string, inviteId: string) => `${groupId}#${inviteId}`;
  const participantsOf = (groupId: string) =>
    [...members.values()].filter((m) => m.groupId === groupId).length;
  const repo: GroupRepository = {
    async create(group, ownerId) {
      calls.create += 1;
      if (lookup.has(group.publicId)) return 'public_id_taken';
      groups.set(group.id, { ...group });
      rolesByGroup.set(group.id, {
        roles: [],
        everyonePermissions: [],
        createdAt: group.createdAt,
        updatedAt: group.createdAt,
        version: 1,
      });
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
      // Igual ao Dynamo: o lookup do token tem `attribute_not_exists`, e nada é gravado.
      if (tokens.has(invite.token)) throw new Error('Invite create failed');
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
    async findPersonalInvite(inviteId, who) {
      // Como os dois lookups: o da conta e, sem ele, o do email.
      const found = [...invites.values()].find((i) => {
        const t = i.target;
        if (i.id !== inviteId || !t) return false;
        return 'userId' in t ? t.userId === who.userId : who.email !== undefined && t.email === who.email;
      });
      return found && { groupId: found.groupId, inviteId: found.id };
    },
    async declineInvite({ groupId, id: inviteId }, at) {
      const invite = invites.get(inviteKey(groupId, inviteId));
      if (!invite || invite.declinedAt !== undefined || invite.revokedAt !== undefined) return;
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
        // Com limite, `uses` igual ao lido e abaixo do limite, como a condição do Dynamo.
        (stored.maxUses === undefined || (stored.uses === invite.uses && stored.uses < stored.maxUses));
      if (!valid) return 'invite_stale';
      const memberKey = `${invite.groupId}#${userId}`;
      const current = members.get(memberKey);
      if (action === 'join' ? current !== undefined : current?.tier !== 'reserve') return 'membership_stale';
      // GRV-54: só quem entra conta; nada muda com o grupo cheio, nem o uso do convite.
      if (action === 'join' && participantsOf(invite.groupId) >= GROUP_PARTICIPANT_MAX) return 'group_full';
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
              role: 'everyone',
              createdAt: now.toISOString(),
              inviteId: invite.id,
              invitedBy: invite.createdBy,
            }
          : {
              ...(current as StoredMembership),
              tier: 'member',
              inviteId: invite.id,
              invitedBy: invite.createdBy,
            },
      );
      requests.delete(memberKey); // GRV-22: o pedido some na mesma operação
      uses.set(`${inviteKey(invite.groupId, invite.id)}#${userId}`, {
        groupId: invite.groupId,
        inviteId: invite.id,
        userId,
        createdAt: now.toISOString(),
      });
      return 'ok';
    },
    async getRoles(groupId) {
      const stored = rolesByGroup.get(groupId);
      return stored
        ? { ...stored, roles: stored.roles.map((r) => ({ ...r })) }
        : { roles: [], everyonePermissions: [], createdAt: '', updatedAt: '', version: 0 };
    },
    async saveRoles(groupId, data, expectedVersion, at) {
      const stored = rolesByGroup.get(groupId);
      if (!stored || stored.version !== expectedVersion) {
        throw appError('VERSION_CONFLICT', { currentVersion: stored?.version ?? 0 });
      }
      rolesByGroup.set(groupId, {
        ...stored,
        roles: data.roles.map((r) => ({ ...r })),
        everyonePermissions: [...data.everyonePermissions],
        updatedAt: at.toISOString(),
        version: stored.version + 1,
      });
    },
    async setMemberRole(groupId, userId, role) {
      const key = `${groupId}#${userId}`;
      const current = members.get(key);
      if (!current) return false;
      members.set(key, { ...current, role });
      return true;
    },
    async transferGroup({ groupId, fromUserId, toUserId, toRole }) {
      const from = members.get(`${groupId}#${fromUserId}`);
      const to = members.get(`${groupId}#${toUserId}`);
      if (!from || !to || from.role !== 'owner' || to.role !== toRole || to.tier !== 'member')
        return 'conflict';
      members.set(`${groupId}#${toUserId}`, { ...to, role: 'owner' });
      members.set(`${groupId}#${fromUserId}`, { ...from, role: toRole });
      return 'ok';
    },
    async listMembers(groupId) {
      return [...members.values()].filter((m) => m.groupId === groupId);
    },
    async countParticipants(groupId) {
      return participantsOf(groupId);
    },
    async removeMembership(groupId, userId) {
      return members.delete(`${groupId}#${userId}`);
    },
    async setJoinMode(groupId, mode, expectedVersion, at) {
      const group = groups.get(groupId);
      if (!group || group.version !== expectedVersion) {
        throw appError('VERSION_CONFLICT', { currentVersion: group?.version ?? 0 });
      }
      groups.set(groupId, {
        ...group,
        joinMode: mode,
        version: group.version + 1,
        updatedAt: at.toISOString(),
      });
    },
    async setModality(groupId, modality, expectedVersion, at) {
      const group = groups.get(groupId);
      if (!group || group.version !== expectedVersion) {
        throw appError('VERSION_CONFLICT', { currentVersion: group?.version ?? 0 });
      }
      groups.set(groupId, {
        ...group,
        modality,
        version: group.version + 1,
        updatedAt: at.toISOString(),
      });
    },
    async getRequest(groupId, userId) {
      return requests.get(`${groupId}#${userId}`);
    },
    async putRequest(request) {
      const key = `${request.groupId}#${request.userId}`;
      // GRV-27: o vencido é regravado, como a condição do Dynamo.
      const current = requests.get(key);
      if (current && current.expiresAt > request.createdAt) return false;
      requests.set(key, { ...request });
      return true;
    },
    async deleteRequest(groupId, userId, opts) {
      const existed = requests.delete(`${groupId}#${userId}`);
      return existed || !opts?.mustExist;
    },
    async listRequests(groupId) {
      return [...requests.values()].filter((r) => r.groupId === groupId);
    },
    async approveRequest({ groupId, userId, tier, now }) {
      const key = `${groupId}#${userId}`;
      const pending = requests.get(key);
      if (!pending || pending.expiresAt <= now.toISOString()) return 'request_gone';
      if (members.has(key)) {
        requests.delete(key);
        return 'already_member';
      }
      // GRV-54: com o grupo cheio nada muda; o pedido fica.
      if (participantsOf(groupId) >= GROUP_PARTICIPANT_MAX) return 'group_full';
      requests.delete(key);
      members.set(key, { groupId, userId, tier, role: 'everyone', createdAt: now.toISOString() });
      return 'ok';
    },
  };
  return { repo, groups, lookup, rolesByGroup, members, invites, tokens, uses, requests, calls };
}
