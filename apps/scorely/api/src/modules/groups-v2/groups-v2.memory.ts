import { asUserId } from '@scorely/api/src/lib/ids';
import type {
  GroupV2Repository,
  StoredGroupV2,
  StoredMembershipV2,
} from '@scorely/api/src/modules/groups-v2/group-v2.repository';
import type { PublicGroupId } from '@scorely/contracts';

export const ANA = asUserId('11111111-1111-4111-8111-111111111111');
export const BIA = asUserId('22222222-2222-4222-8222-222222222222');

export function pid(code: string): PublicGroupId {
  return code as PublicGroupId;
}

/** Repositório em memória: grava como a transação (a posse do código público é única; o resto vem junto). */
export function memoryGroupsV2() {
  const groups = new Map<string, StoredGroupV2>();
  const lookup = new Map<string, StoredGroupV2['id']>();
  const members = new Map<string, StoredMembershipV2>();
  const calls = { create: 0 };
  const repo: GroupV2Repository = {
    async create(group, ownerId) {
      calls.create += 1;
      if (lookup.has(group.publicId)) return 'public_id_taken';
      groups.set(group.id, { ...group });
      lookup.set(group.publicId, group.id);
      members.set(`${group.id}#${ownerId}`, {
        groupId: group.id,
        userId: ownerId,
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
  };
  return { repo, groups, lookup, members, calls };
}
