import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import { groupKey } from '@scorely/api/src/modules/groups/group.table';
import {
  forViewer,
  type GroupImageIds,
  type GroupsDeps,
  requireActive,
  requireOwner,
} from '@scorely/api/src/modules/groups/groups.deps';
import type { MediaService } from '@scorely/api/src/modules/media/media.service';
import type { MediaTarget } from '@scorely/api/src/modules/media/media.table';
import type {
  AttachMediaInput,
  Group,
  GroupImageSlot,
  MediaPurpose,
  MediaUpload,
  MediaUploadInput,
} from '@scorely/contracts';

/** Cada imagem do grupo é uma finalidade da mídia (GRP-35, MID-02). */
const PURPOSES: Record<GroupImageSlot, MediaPurpose> = { logo: 'group.logo', cover: 'group.cover' };

/**
 * Logo e capa do grupo (GRP-35). O grupo decide quem pode (o dono, num grupo ativo) e a mídia cuida do
 * arquivo (MID-01). A permissão é conferida em cada passo, então quem perdeu o papel no meio é barrado.
 */
export function createGroupImages(deps: GroupsDeps & { media: MediaService }) {
  async function requireActiveOwner(userId: UserId, groupId: string) {
    const group = await requireOwner(deps, userId, groupId);
    requireActive(group);
    return group;
  }

  /** Onde a imagem fica ligada (MID-08): `<slot>MediaId`/`<slot>Url` no item do grupo. */
  function target(groupId: string, slot: GroupImageSlot): MediaTarget {
    return {
      key: groupKey(groupId),
      field: slot,
      async readCurrent() {
        const group = (await deps.groups.get(groupId, { consistent: true })) as GroupImageIds | undefined;
        return slot === 'logo' ? group?.logoMediaId : group?.coverMediaId;
      },
    };
  }

  /** O grupo depois da troca, como o dono vê. */
  async function fresh(userId: UserId, groupId: string): Promise<Group> {
    const group = await deps.groups.get(groupId, { consistent: true });
    if (!group) throw appError('GROUP_NOT_FOUND');
    return forViewer(group, userId, 'member');
  }

  return {
    async requestUpload(
      userId: UserId,
      groupId: string,
      slot: GroupImageSlot,
      input: MediaUploadInput,
    ): Promise<MediaUpload> {
      await requireActiveOwner(userId, groupId);
      return deps.media.requestUpload({
        purpose: PURPOSES[slot],
        ownerId: groupId,
        uploadedBy: userId,
        contentType: input.contentType,
      });
    },

    async attach(
      userId: UserId,
      groupId: string,
      slot: GroupImageSlot,
      input: AttachMediaInput,
    ): Promise<Group> {
      await requireActiveOwner(userId, groupId);
      await deps.media.attach({
        mediaId: input.mediaId,
        purpose: PURPOSES[slot],
        ownerId: groupId,
        target: target(groupId, slot),
      });
      return fresh(userId, groupId);
    },

    async detach(userId: UserId, groupId: string, slot: GroupImageSlot): Promise<Group> {
      await requireActiveOwner(userId, groupId);
      await deps.media.detach({ purpose: PURPOSES[slot], ownerId: groupId, target: target(groupId, slot) });
      return fresh(userId, groupId);
    },
  };
}
export type GroupImages = ReturnType<typeof createGroupImages>;
