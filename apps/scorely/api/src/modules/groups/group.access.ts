import { appError } from '@scorely/api/src/lib/errors';
import type { GroupId, UserId } from '@scorely/api/src/lib/ids';
import { permissionsOf } from '@scorely/api/src/modules/groups/group.permissions';
import type { GroupRepository } from '@scorely/api/src/modules/groups/group.repository';
import type { GroupPermission, GroupTier, PublicGroupId } from '@scorely/contracts';

/**
 * O que os outros módulos (partidas) perguntam ao grupo: quem participa, como, e se a pessoa tem uma permissão
 * (GRV-15, 17). O grupo não sabe nada de quem pergunta (partidas.md, seção 3).
 */
export interface GroupAccess {
  /** GRV-04, 15: quem participa, como, e as permissões; quem não participa (ou código que não existe) → `GROUP_NOT_FOUND`. */
  access(
    userId: UserId,
    publicId: PublicGroupId,
  ): Promise<{
    groupId: GroupId;
    publicId: PublicGroupId;
    name: string;
    tier: GroupTier;
    permissions: GroupPermission[];
  }>;
  /** PAR-10, 16: quem participa hoje, com a participação. */
  participants(groupId: GroupId): Promise<Map<UserId, GroupTier>>;
  /** PAR-12: quem tem a permissão. */
  holders(groupId: GroupId, permission: GroupPermission): Promise<UserId[]>;
}

export function createGroupAccess(repo: GroupRepository): GroupAccess {
  return {
    async access(userId, publicId) {
      const id = await repo.resolve(publicId);
      if (id === undefined) throw appError('GROUP_NOT_FOUND');
      const [group, membership, roles] = await Promise.all([
        repo.get(id),
        repo.getMembership(id, userId),
        repo.getRoles(id),
      ]);
      if (!group || !membership) throw appError('GROUP_NOT_FOUND');
      return {
        groupId: id,
        publicId: group.publicId,
        name: group.name,
        tier: membership.tier,
        permissions: permissionsOf(membership, roles),
      };
    },
    async participants(groupId) {
      const members = await repo.listMembers(groupId);
      return new Map(members.map((m) => [m.userId, m.tier]));
    },
    async holders(groupId, permission) {
      const [members, roles] = await Promise.all([repo.listMembers(groupId), repo.getRoles(groupId)]);
      return members.filter((m) => permissionsOf(m, roles).includes(permission)).map((m) => m.userId);
    },
  };
}
