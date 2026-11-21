import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import type { GroupV2Repository } from '@scorely/api/src/modules/groups-v2/group-v2.repository';
import { forViewer } from '@scorely/api/src/modules/groups-v2/group-v2.service';
import { groupV2Key } from '@scorely/api/src/modules/groups-v2/group-v2.table';
import type { MediaService } from '@scorely/api/src/modules/media/media.service';
import type { MediaTarget } from '@scorely/api/src/modules/media/media.table';
import type {
  AttachMediaInput,
  GroupImageSlot,
  GroupV2,
  MediaPurpose,
  MediaUpload,
  MediaUploadInput,
  PublicGroupId,
} from '@scorely/contracts';

/** Cada imagem do grupo é uma finalidade da mídia (GRV-09, MID-02). */
const PURPOSES: Record<GroupImageSlot, MediaPurpose> = { logo: 'group.logo', cover: 'group.cover' };

export interface GroupV2ImagesDeps {
  groups: GroupV2Repository;
  media: MediaService;
  now?: () => Date;
}

/**
 * Logo e capa do grupo v2 (GRV-09). Só o dono troca, conferido em cada passo (MID-01); a mídia cuida do arquivo.
 * Os métodos recebem o id público e traduzem para o uuid aqui, na entrada.
 */
export function createGroupV2Images(deps: GroupV2ImagesDeps) {
  /** GRV-09: sem participação (ou código inexistente) → `GROUP_NOT_FOUND`; participante que não é dono → `GROUP_NOT_OWNER`. */
  async function requireOwner(userId: UserId, publicId: PublicGroupId) {
    const id = await deps.groups.resolve(publicId);
    if (id === undefined) throw appError('GROUP_NOT_FOUND');
    const membership = await deps.groups.getMembership(id, userId);
    if (!membership) throw appError('GROUP_NOT_FOUND');
    if (membership.role !== 'owner') throw appError('GROUP_NOT_OWNER');
    return { id, membership };
  }

  /** Onde a imagem fica ligada (MID-08): só o `<slot>MediaId` no META do grupo (MID-12). */
  function target(id: Parameters<GroupV2Repository['get']>[0], slot: GroupImageSlot): MediaTarget {
    return {
      key: groupV2Key(id),
      field: slot,
      async readCurrent() {
        const group = await deps.groups.get(id, { consistent: true });
        return slot === 'logo' ? group?.logoMediaId : group?.coverMediaId;
      },
    };
  }

  /** O grupo depois da troca, como o dono vê (GRV-10). */
  async function fresh(
    id: Parameters<GroupV2Repository['get']>[0],
    membership: Parameters<typeof forViewer>[1],
  ): Promise<GroupV2> {
    const group = await deps.groups.get(id, { consistent: true });
    if (!group) throw appError('GROUP_NOT_FOUND');
    return forViewer(group, membership, deps.media.urlOf);
  }

  return {
    async requestUpload(
      userId: UserId,
      publicId: PublicGroupId,
      slot: GroupImageSlot,
      input: MediaUploadInput,
    ): Promise<MediaUpload> {
      const { id } = await requireOwner(userId, publicId);
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
    ): Promise<GroupV2> {
      const { id, membership } = await requireOwner(userId, publicId);
      await deps.media.attach({
        mediaId: input.mediaId,
        purpose: PURPOSES[slot],
        ownerId: id,
        target: target(id, slot),
      });
      const group = await fresh(id, membership);
      return group;
    },

    async detach(userId: UserId, publicId: PublicGroupId, slot: GroupImageSlot): Promise<GroupV2> {
      const { id, membership } = await requireOwner(userId, publicId);
      await deps.media.detach({ purpose: PURPOSES[slot], ownerId: id, target: target(id, slot) });
      const group = await fresh(id, membership);
      return group;
    },
  };
}
export type GroupV2Images = ReturnType<typeof createGroupV2Images>;
