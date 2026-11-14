import { queryLookupRows } from '@scorely/api/src/lib/db';
import type { CompetitionRepository } from '@scorely/api/src/modules/competition/competition.repository';
import type { MatchRepository } from '@scorely/api/src/modules/competition/match.repository';
import { createRankingService } from '@scorely/api/src/modules/competition/ranking.service';
import type { ResultRepository } from '@scorely/api/src/modules/competition/result.repository';
import type { SeasonRepository } from '@scorely/api/src/modules/competition/season.repository';
import { SEASON_OPEN_PK } from '@scorely/api/src/modules/competition/season.table';
import { isLocked } from '@scorely/api/src/modules/competition/seasons';
import type { TrophyRepository } from '@scorely/api/src/modules/competition/trophy.repository';
import type { GroupRepository } from '@scorely/api/src/modules/groups/group.repository';
import type { NotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import type { UserDirectory } from '@scorely/api/src/modules/users/user.repository';

/** As temporadas que ainda vão travar (ADR 0012): sem Scan, pelo lookup `LOOKUP#SEASON#OPEN`. */
export interface SeasonLockRepository {
  /** Os ids das temporadas com o fim até `nowIso` (data UTC) e ainda sem o ranking final. */
  due(nowIso: string): Promise<string[]>;
}

export const dynamoSeasonLockRepository: SeasonLockRepository = {
  async due(nowIso) {
    const today = nowIso.slice(0, 10);
    const rows = await queryLookupRows(SEASON_OPEN_PK);
    // A SK começa pela data de fim: só as que já terminaram (o fuso e o prazo são conferidos depois, no job).
    return rows.filter((r) => r.SK.slice(0, 10) < today).map((r) => r.id);
  },
};

export interface SeasonLockDeps {
  groups: GroupRepository;
  competitions: CompetitionRepository;
  seasons: SeasonRepository;
  results: ResultRepository;
  matches: MatchRepository;
  users: Pick<UserDirectory, 'getMany' | 'resolve'>;
  notifications: Pick<NotificationService, 'notify'>;
  trophies?: TrophyRepository;
  locks: SeasonLockRepository;
  now?: () => Date;
}

/**
 * CMP-39 (ADR 0012): a rotina diária trava as temporadas cujo prazo passou, grava o ranking final com os troféus e
 * avisa. Idempotente: a que já tem final é pulada, e o `saveFinal` grava uma vez só.
 */
export function createSeasonLockJob(deps: SeasonLockDeps) {
  const now = deps.now ?? (() => new Date());
  const ranking = createRankingService({ ...deps, now });

  return {
    /** Quantas temporadas travou nesta execução. */
    async run(): Promise<number> {
      const ids = await deps.locks.due(now().toISOString());
      const locked = await Promise.all(
        ids.map(async (id) => {
          const season = await deps.seasons.get(id);
          if (!season || season.final) return 0;
          const group = await deps.groups.get(season.groupId);
          if (!group || !isLocked(season, now(), group.timeZone)) return 0;
          await ranking.podium(group, season);
          return 1;
        }),
      );
      return locked.reduce<number>((sum, n) => sum + n, 0);
    },
  };
}
