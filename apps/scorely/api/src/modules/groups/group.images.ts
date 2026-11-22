import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import { requirePermission } from '@scorely/api/src/modules/groups/group.permissions';
import type { GroupRepository } from '@scorely/api/src/modules/groups/group.repository';
import { forViewer } from '@scorely/api/src/modules/groups/group.service';
import { groupKey } from '@scorely/api/src/modules/groups/group.table';
import type { MediaService } from '@scorely/api/src/modules/media/media.service';
import type { MediaTarget } from '@scorely/api/src/modules/media/media.table';
import type {
  AttachMediaInput,
  Group,
  GroupImageSlot,
  MediaPurpose,
  MediaUpload,
  MediaUploadInput,
  PublicGroupId,
} from '@scorely/contracts';

/** Cada imagem do grupo é uma finalidade da mídia (GRV-09, MID-02). */
const PURPOSES: Record<GroupImageSlot, MediaPurpose> = { logo: 'group.logo', cover: 'group.cover' };

export interface GroupImagesDeps {
  groups: GroupRepository;
  media: MediaService;
  now?: () => Date;
}

/**
 * Logo e capa do grupo (GRV-09). Só quem tem `group.edit` troca, conferido em cada passo (MID-01); a mídia cuida do arquivo.
 * Os métodos recebem o id público e traduzem para o uuid aqui, na entrada.
 */
export function createGroupImages(deps: GroupImagesDeps) {
  /** GRV-09: sem participação (ou código inexistente) → `GROUP_NOT_FOUND`; sem `group.edit` → `GROUP_PERMISSION_DENIED`. */
  async function requireEditor(userId: UserId, publicId: PublicGroupId) {
    const id = await deps.groups.resolve(publicId);
    if (id === undefined) throw appError('GROUP_NOT_FOUND');
    const membership = await deps.groups.getMembership(id, userId);
    if (!membership) throw appError('GROUP_NOT_FOUND');
    const roles = await deps.groups.getRoles(id);
    requirePermission(membership, roles, 'group.edit');
    return { id, membership, roles };
  }

  /** Onde a imagem fica ligada (MID-08): só o `<slot>MediaId` no META do grupo (MID-12). */
  function target(id: Parameters<GroupRepository['get']>[0], slot: GroupImageSlot): MediaTarget {
    return {
      key: groupKey(id),
      field: slot,
      async readCurrent() {
        const group = await deps.groups.get(id, { consistent: true });
        return slot === 'logo' ? group?.logoMediaId : group?.coverMediaId;
      },
    };
  }

  /** O grupo depois da troca, como o dono vê (GRV-10). */
  async function fresh(
    id: Parameters<GroupRepository['get']>[0],
    membership: Parameters<typeof forViewer>[1],
    roles: Parameters<typeof forViewer>[2],
  ): Promise<Group> {
    const group = await deps.groups.get(id, { consistent: true });
    if (!group) throw appError('GROUP_NOT_FOUND');
    return forViewer(group, membership, roles, deps.media.urlOf);
  }

  return {
    async requestUpload(
      userId: UserId,
      publicId: PublicGroupId,
      slot: GroupImageSlot,
      input: MediaUploadInput,
    ): Promise<MediaUpload> {
      const { id } = await requireEditor(userId, publicId);
      const upload = await deps.media.requestUpload({
        purpose: PURPOSES[slot],
        ownerId: id,
        uploadedBy: userId,
        contentType: input.contentType,
      });
      return upload;
    },

    async attach(
      userId: UserId,
      publicId: PublicGroupId,
      slot: GroupImageSlot,
      input: AttachMediaInput,
    ): Promise<Group> {
      const { id, membership, roles } = await requireEditor(userId, publicId);
      await deps.media.attach({
        mediaId: input.mediaId,
        purpose: PURPOSES[slot],
        ownerId: id,
        target: target(id, slot),
      });
      const group = await fresh(id, membership, roles);
      return group;
    },

    async detach(userId: UserId, publicId: PublicGroupId, slot: GroupImageSlot): Promise<Group> {
      const { id, membership, roles } = await requireEditor(userId, publicId);
      await deps.media.detach({ purpose: PURPOSES[slot], ownerId: id, target: target(id, slot) });
      const group = await fresh(id, membership, roles);
      return group;
    },
  };
}
export type GroupImages = ReturnType<typeof createGroupImages>;
