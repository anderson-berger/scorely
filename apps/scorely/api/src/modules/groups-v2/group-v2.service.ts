import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import type {
  GroupV2Repository,
  StoredGroupV2,
  StoredMembershipV2,
} from '@scorely/api/src/modules/groups-v2/group-v2.repository';
import { newPublicGroupId } from '@scorely/api/src/modules/groups-v2/public-id';
import { type MediaService, mediaService } from '@scorely/api/src/modules/media/media.service';
import type { CreateGroupV2Input, GroupV2, PublicGroupId } from '@scorely/contracts';

/** MID-12: monta a URL pública pela finalidade e o id da mídia. */
export type UrlOf = MediaService['urlOf'];
const productionUrlOf: UrlOf = (purpose, mediaId) => mediaService.urlOf(purpose, mediaId);

/** GRV-08: um código em uso (chance desprezível) sorteia outro, até 3 vezes (como o id público do usuário). */
const PUBLIC_ID_ATTEMPTS = 3;

/** GRV-05: ordem de nome sem diferenciar maiúsculas e acentos. */
const byName = new Intl.Collator('pt-BR', { sensitivity: 'base' });

export interface GroupsV2Deps {
  groups: GroupV2Repository;
  /** MID-12: só o `urlOf` da mídia. Sem ele, a mídia de produção. */
  media?: Pick<MediaService, 'urlOf'>;
  now?: () => Date;
  newPublicId?: () => PublicGroupId;
}

/** O grupo para quem pede: o id público no lugar do uuid (GRV-08), o papel (GRV-04) e as URLs das imagens (GRV-10). */
export function forViewer(
  group: StoredGroupV2,
  membership: Pick<StoredMembershipV2, 'role'>,
  urlOf: UrlOf = productionUrlOf,
): GroupV2 {
  return {
    id: group.publicId,
    createdAt: group.createdAt,
    version: group.version,
    name: group.name,
    myRole: membership.role,
    ...(group.logoMediaId !== undefined && { logoUrl: urlOf('group.logo', group.logoMediaId) }),
    ...(group.coverMediaId !== undefined && { coverUrl: urlOf('group.cover', group.coverMediaId) }),
  };
}

export function createGroupV2Service(deps: GroupsV2Deps) {
  const now = deps.now ?? (() => new Date());
  const newPublicId = deps.newPublicId ?? newPublicGroupId;

  /** GRV-01, 02, 03, 08: o nome já vem validado pelo contrato; quem cria é o dono. */
  async function create(userId: UserId, input: CreateGroupV2Input, attempt = 1): Promise<GroupV2> {
    // `newEntity` gera o id do sistema (uuid) e o `createdAt`; o `updatedAt` nasce igual (ADR 0013).
    const entity = newEntity<Omit<StoredGroupV2, 'updatedAt'>>(
      { publicId: newPublicId(), name: input.name, version: 1 },
      now(),
    );
    const group: StoredGroupV2 = { ...entity, updatedAt: entity.createdAt };
    const result = await deps.groups.create(group, userId);
    if (result === 'public_id_taken') {
      if (attempt >= PUBLIC_ID_ATTEMPTS) throw new Error('Could not allocate a group public id');
      return create(userId, input, attempt + 1);
    }
    return forViewer(group, { role: 'owner' }, deps.media?.urlOf);
  }

  /** GRV-04: quem não participa, ou um código que não existe, recebe `GROUP_NOT_FOUND`. */
  async function get(userId: UserId, publicId: PublicGroupId): Promise<GroupV2> {
    const id = await deps.groups.resolve(publicId);
    if (id === undefined) throw appError('GROUP_NOT_FOUND');
    const [group, membership] = await Promise.all([
      deps.groups.get(id),
      deps.groups.getMembership(id, userId),
    ]);
    if (!group || !membership) throw appError('GROUP_NOT_FOUND');
    return forViewer(group, membership, deps.media?.urlOf);
  }

  /** GRV-05: os grupos de que a pessoa participa, por nome. */
  async function mine(userId: UserId): Promise<GroupV2[]> {
    const rows = await deps.groups.listMine(userId);
    return rows
      .map(({ group, membership }) => forViewer(group, membership, deps.media?.urlOf))
      .sort((a, b) => byName.compare(a.name, b.name));
  }

  return { create, get, mine };
}
