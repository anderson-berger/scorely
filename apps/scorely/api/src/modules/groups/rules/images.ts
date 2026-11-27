// Logo e capa do grupo (GRV-09). Só quem tem `group.edit` troca, conferido em cada passo (MID-01); a mídia cuida do
// arquivo. As funções recebem o id público e traduzem para o uuid aqui, na entrada.
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import type { GroupRepository } from '@scorely/api/src/modules/groups/data/groups.repository';
import { groupKey } from '@scorely/api/src/modules/groups/data/groups.table';
import type { GroupImagesDeps } from '@scorely/api/src/modules/groups/groups.service';
import { toGroup } from '@scorely/api/src/modules/groups/rules/groups';
import { requirePermission } from '@scorely/api/src/modules/groups/rules/permissions';
import type { MediaTarget } from '@scorely/api/src/modules/media/media.access';
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

/** GRV-09: sem participação (ou código inexistente) → `GROUP_NOT_FOUND`; sem `group.edit` → `GROUP_PERMISSION_DENIED`. */
async function requireEditor(deps: GroupImagesDeps, userId: UserId, publicId: PublicGroupId) {
  const id = await deps.groups.resolve(publicId);
  if (id === undefined) throw appError('GROUP_NOT_FOUND');
  const membership = await deps.groups.getMembership(id, userId);
  if (!membership) throw appError('GROUP_NOT_FOUND');
  const roles = await deps.groups.getRoles(id);
  requirePermission(membership, roles, 'group.edit');
  return { id, membership, roles };
}

/** Onde a imagem fica ligada (MID-08): só o `<slot>MediaId` no META do grupo (MID-12). */
function target(
  deps: GroupImagesDeps,
  id: Parameters<GroupRepository['get']>[0],
  slot: GroupImageSlot,
): MediaTarget {
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
  deps: GroupImagesDeps,
  id: Parameters<GroupRepository['get']>[0],
  membership: Parameters<typeof toGroup>[2],
  roles: Parameters<typeof toGroup>[3],
): Promise<Group> {
  const group = await deps.groups.get(id, { consistent: true });
  if (!group) throw appError('GROUP_NOT_FOUND');
  return toGroup(deps, group, membership, roles);
}

export async function requestUpload(
  deps: GroupImagesDeps,
  userId: UserId,
  publicId: PublicGroupId,
  slot: GroupImageSlot,
  input: MediaUploadInput,
): Promise<MediaUpload> {
  const { id } = await requireEditor(deps, userId, publicId);
  const upload = await deps.media.requestUpload({
    purpose: PURPOSES[slot],
    ownerId: id,
    uploadedBy: userId,
    contentType: input.contentType,
  });
  return upload;
}

export async function attach(
  deps: GroupImagesDeps,
  userId: UserId,
  publicId: PublicGroupId,
  slot: GroupImageSlot,
  input: AttachMediaInput,
): Promise<Group> {
  const { id, membership, roles } = await requireEditor(deps, userId, publicId);
  await deps.media.attach({
    mediaId: input.mediaId,
    purpose: PURPOSES[slot],
    ownerId: id,
    target: target(deps, id, slot),
  });
  const group = await fresh(deps, id, membership, roles);
  return group;
}

export async function detach(
  deps: GroupImagesDeps,
  userId: UserId,
  publicId: PublicGroupId,
  slot: GroupImageSlot,
): Promise<Group> {
  const { id, membership, roles } = await requireEditor(deps, userId, publicId);
  await deps.media.detach({ purpose: PURPOSES[slot], ownerId: id, target: target(deps, id, slot) });
  const group = await fresh(deps, id, membership, roles);
  return group;
}
