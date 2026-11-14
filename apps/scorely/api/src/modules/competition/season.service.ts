import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import { localDate } from '@scorely/api/src/lib/zoned';
import type { CompetitionRepository } from '@scorely/api/src/modules/competition/competition.repository';
import { competitionStatus } from '@scorely/api/src/modules/competition/competition.status';
import type { MatchRepository } from '@scorely/api/src/modules/competition/match.repository';
import { createRankingService } from '@scorely/api/src/modules/competition/ranking.service';
import type { ResultRepository } from '@scorely/api/src/modules/competition/result.repository';
import type {
  SeasonPatch,
  SeasonRepository,
  StoredSeason,
} from '@scorely/api/src/modules/competition/season.repository';
import { checkSeasonDates, graceUntil, seasonState } from '@scorely/api/src/modules/competition/seasons';
import type { TrophyRepository } from '@scorely/api/src/modules/competition/trophy.repository';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import { requireActive, requireMember, requirePermission } from '@scorely/api/src/modules/groups/groups.deps';
import type { NotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import type { UserDirectory } from '@scorely/api/src/modules/users/user.repository';
import type { Season, SeasonInput, SeasonUpdateInput } from '@scorely/contracts';

export interface SeasonDeps {
  groups: GroupRepository;
  competitions: CompetitionRepository;
  seasons: SeasonRepository;
  results: ResultRepository;
  matches: MatchRepository;
  users: Pick<UserDirectory, 'getMany' | 'resolve'>;
  /** Os avisos de fim de temporada e de troféu, quando ela trava ao ser lida (CMP-38, 39). */
  notifications?: Pick<NotificationService, 'notify'>;
  trophies?: TrophyRepository;
  now?: () => Date;
}

export function createSeasonService(deps: SeasonDeps) {
  const now = deps.now ?? (() => new Date());
  const ranking = createRankingService({ ...deps, now });

  /** CMP-34: a temporada para quem vê; o pódio só nas travadas (o ranking final, CMP-32, 33). */
  async function view(group: StoredGroup, season: StoredSeason): Promise<Season> {
    const state = seasonState(season, now(), group.timeZone);
    const podium = state === 'closed' ? await ranking.podium(group, season) : undefined;
    const highlights = state === 'closed' ? await ranking.highlights(group, season) : undefined;
    return {
      id: season.id,
      number: season.number,
      ...(season.name !== undefined && { name: season.name }),
      startDate: season.startDate,
      endDate: season.endDate,
      state,
      rules: season.rules,
      ...(season.closedAt !== undefined && { closedAt: season.closedAt }),
      graceUntil: graceUntil(season, group.timeZone),
      ...(podium && { podium }),
      ...(highlights && { highlights }),
    };
  }

  /** CMP-30, 32: `seasons.manage`, o grupo ativo e a competição ativa, nesta ordem. */
  async function manager(userId: UserId, groupId: string) {
    const { group } = await requirePermission(deps, userId, groupId, 'seasons.manage');
    requireActive(group);
    const competition = await deps.competitions.get(groupId);
    if (!competition || competitionStatus(competition, now()) !== 'active')
      throw appError('COMPETITION_INACTIVE');
    return { group, competition };
  }

  async function seasonIn(groupId: string, seasonId: string): Promise<StoredSeason> {
    const season = await deps.seasons.get(seasonId);
    if (!season || season.groupId !== groupId) throw appError('SEASON_NOT_FOUND');
    return season;
  }

  const today = (group: StoredGroup) => localDate(now(), group.timeZone);

  return {
    /** CMP-34: da mais recente para a mais antiga (pela data de início), também vencida ou com o grupo arquivado. */
    async list(userId: UserId, groupId: string): Promise<Season[]> {
      const { group } = await requireMember(deps, userId, groupId);
      const seasons = await deps.seasons.list(groupId);
      const ordered = [...seasons].sort((a, b) => b.startDate.localeCompare(a.startDate));
      return Promise.all(ordered.map((s) => view(group, s)));
    },

    /** CMP-29, 30: abre (início hoje) ou programa, com a cópia do regulamento do grupo de agora. */
    async create(userId: UserId, groupId: string, input: SeasonInput): Promise<Season> {
      const { group, competition } = await manager(userId, groupId);
      const others = await deps.seasons.list(groupId);
      checkSeasonDates(input, today(group), others);
      const at = now();
      const number = Math.max(0, ...others.map((s) => s.number)) + 1;
      const season = newEntity<StoredSeason>(
        {
          groupId,
          number,
          ...(input.name !== undefined && { name: input.name }),
          startDate: input.startDate,
          endDate: input.endDate,
          rules: competition.rules,
          updatedAt: at.toISOString(),
        },
        at,
      );
      await deps.seasons.create(season);
      return view(group, season);
    },

    /** CMP-30: a programada muda tudo; depois de começar, só o nome (`SEASON_INVALID started`). */
    async update(
      userId: UserId,
      groupId: string,
      seasonId: string,
      input: SeasonUpdateInput,
    ): Promise<Season> {
      const { group, competition } = await manager(userId, groupId);
      const season = await seasonIn(groupId, seasonId);
      const scheduled = seasonState(season, now(), group.timeZone) === 'scheduled';
      const changesMore =
        input.startDate !== undefined || input.endDate !== undefined || input.copyRules === true;
      if (changesMore && !scheduled) throw appError('SEASON_INVALID', { reason: 'started' });

      const startDate = input.startDate ?? season.startDate;
      const endDate = input.endDate ?? season.endDate;
      if (changesMore) {
        const others = (await deps.seasons.list(groupId)).filter((s) => s.id !== season.id);
        checkSeasonDates({ startDate, endDate }, today(group), others);
      }
      const patch: SeasonPatch = {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.startDate !== undefined && { startDate }),
        ...(input.endDate !== undefined && { endDate }),
        ...(input.copyRules === true && { rules: competition.rules }),
        updatedAt: now().toISOString(),
      };
      const moved = input.startDate !== undefined && input.startDate !== season.startDate;
      await deps.seasons.update(season.id, patch, moved ? season.startDate : undefined);
      return view(group, { ...season, ...patch });
    },

    /** CMP-30: só a programada é cancelada (apagada). */
    async remove(userId: UserId, groupId: string, seasonId: string): Promise<void> {
      const { group } = await manager(userId, groupId);
      const season = await seasonIn(groupId, seasonId);
      if (seasonState(season, now(), group.timeZone) !== 'scheduled') {
        throw appError('SEASON_INVALID', { reason: 'started' });
      }
      await deps.seasons.delete(season);
    },

    /** CMP-32: encerrar antes da data passa o fim para hoje e trava na hora, sem prazo. */
    async close(userId: UserId, groupId: string, seasonId: string): Promise<Season> {
      const { group } = await manager(userId, groupId);
      const season = await seasonIn(groupId, seasonId);
      const state = seasonState(season, now(), group.timeZone);
      if (state === 'closed') return view(group, season);
      if (state === 'scheduled') throw appError('SEASON_INVALID', { reason: 'started' });
      const at = now().toISOString();
      // No prazo, o fim já passou: encerrar não alonga a temporada.
      const endDate = [today(group), season.endDate].sort()[0] ?? season.endDate;
      const patch: SeasonPatch = { endDate, closedAt: at, updatedAt: at };
      await deps.seasons.update(season.id, patch);
      return view(group, { ...season, ...patch });
    },
  };
}
