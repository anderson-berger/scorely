import { newEntity } from '@scorely/api/src/lib/entity';
import type { UserId } from '@scorely/api/src/lib/ids';
import {
  type GroupsDeps,
  publicPlace,
  requireActive,
  requireMember,
  requirePermission,
} from '@scorely/api/src/modules/groups/groups.deps';
import type { StoredPlace } from '@scorely/api/src/modules/groups/place.repository';
import {
  type Place,
  type PlaceInput,
  PlaceInputSchema,
  type UpdatePlaceInput,
  UpdatePlaceInputSchema,
  type VersionInput,
} from '@scorely/contracts';

/**
 * Lugares do grupo (GRP-60–63). A ordem dos erros é a da GRP-52: quem não participa, a permissão (`settings.edit`),
 * o grupo arquivado (GRP-32) e só então os do lugar.
 */
export function createPlaceService(deps: Pick<GroupsDeps, 'groups' | 'places' | 'now'>) {
  const now = deps.now ?? (() => new Date());

  /** Quem muda os lugares: `settings.edit`, com o grupo ativo. */
  async function manager(userId: UserId, groupId: string) {
    const { group } = await requirePermission(deps, userId, groupId, 'settings.edit');
    requireActive(group);
    return group;
  }

  return {
    /** GRP-63: membros e reservas veem todos, os arquivados também (inclusive com o grupo arquivado). */
    async list(userId: UserId, groupId: string): Promise<Place[]> {
      await requireMember(deps, userId, groupId);
      return (await deps.places.list(groupId)).map(publicPlace);
    },

    /** GRP-60: cadastra, até 10 ativos (o contador confere na gravação). */
    async create(userId: UserId, groupId: string, input: PlaceInput): Promise<Place> {
      await manager(userId, groupId);
      const data = PlaceInputSchema.parse(input);
      const at = now();
      const place = newEntity<Omit<StoredPlace, 'version'>>(
        { ...data, groupId, updatedAt: at.toISOString() },
        at,
      );
      await deps.places.create(place);
      return publicPlace({ ...place, version: 1 });
    },

    /** GRP-60: edita na versão que a tela mostrou (ADR 0016). */
    async update(userId: UserId, groupId: string, placeId: string, input: UpdatePlaceInput): Promise<Place> {
      await manager(userId, groupId);
      const { version, ...data } = UpdatePlaceInputSchema.parse(input);
      return publicPlace(await deps.places.update(groupId, placeId, data, version));
    },

    /** GRP-61: arquiva; o padrão não (PLACE_IS_DEFAULT). */
    async archive(
      userId: UserId,
      groupId: string,
      placeId: string,
      { version }: VersionInput,
    ): Promise<Place> {
      await manager(userId, groupId);
      return publicPlace(await deps.places.archive(groupId, placeId, version, now().toISOString()));
    },

    /** GRP-61: volta para a escolha, se houver espaço. */
    async unarchive(
      userId: UserId,
      groupId: string,
      placeId: string,
      { version }: VersionInput,
    ): Promise<Place> {
      await manager(userId, groupId);
      return publicPlace(await deps.places.unarchive(groupId, placeId, version));
    },
  };
}
export type PlaceService = ReturnType<typeof createPlaceService>;
