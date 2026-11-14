import type { UserId } from '@scorely/api/src/lib/ids';
import type { SeasonRepository, StoredSeason } from '@scorely/api/src/modules/competition/season.repository';
import type { StoredTrophy, TrophyRepository } from '@scorely/api/src/modules/competition/trophy.repository';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import type { Trophy } from '@scorely/contracts';

export interface TrophyDeps {
  trophies: TrophyRepository;
  groups: Pick<GroupRepository, 'get'>;
  seasons: Pick<SeasonRepository, 'get'>;
}

/** CMP-37: os troféus para a tela, do mais recente para o mais antigo, com o nome do grupo e da temporada de agora. */
export async function trophyViews(deps: TrophyDeps, stored: readonly StoredTrophy[]): Promise<Trophy[]> {
  const groupIds = [...new Set(stored.map((t) => t.groupId))];
  const seasonIds = [...new Set(stored.map((t) => t.seasonId))];
  const [groups, seasons] = await Promise.all([
    Promise.all(groupIds.map((id) => deps.groups.get(id))),
    Promise.all(seasonIds.map((id) => deps.seasons.get(id))),
  ]);
  const groupOf = new Map(groups.flatMap((g): [string, StoredGroup][] => (g ? [[g.id, g]] : [])));
  const seasonOf = new Map(seasons.flatMap((s): [string, StoredSeason][] => (s ? [[s.id, s]] : [])));
  return [...stored]
    .sort((a, b) => b.awardedAt.localeCompare(a.awardedAt))
    .flatMap((t) => {
      const group = groupOf.get(t.groupId);
      const season = seasonOf.get(t.seasonId);
      if (!group || !season) return [];
      return [
        {
          kind: t.kind,
          groupId: t.groupId,
          groupName: group.name,
          seasonId: t.seasonId,
          ...(season.name !== undefined && { seasonName: season.name }),
          seasonNumber: season.number,
          awardedAt: t.awardedAt,
        },
      ];
    });
}

export function createTrophyService(deps: TrophyDeps) {
  return {
    /** CMP-37: a sala de troféus de quem pede, de todos os grupos (também vencida ou com o grupo arquivado). */
    async mine(userId: UserId): Promise<Trophy[]> {
      return trophyViews(deps, await deps.trophies.listByUser(userId));
    },
  };
}
