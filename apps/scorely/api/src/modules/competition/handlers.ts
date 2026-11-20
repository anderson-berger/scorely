import { authRoute } from '@scorely/api/src/lib/auth';
import { type HttpEvent, parseBody, pathParam } from '@scorely/api/src/lib/http';
import { asPublicUserId } from '@scorely/api/src/lib/ids';
import { dynamoCompetitionRepository } from '@scorely/api/src/modules/competition/competition.repository';
import { createCompetitionService } from '@scorely/api/src/modules/competition/competition.service';
import { dynamoMatchRepository } from '@scorely/api/src/modules/competition/match.repository';
import { createMatchService } from '@scorely/api/src/modules/competition/match.service';
import { createRankingService } from '@scorely/api/src/modules/competition/ranking.service';
import { dynamoResultRepository } from '@scorely/api/src/modules/competition/result.repository';
import { createResultService } from '@scorely/api/src/modules/competition/result.service';
import { dynamoSeasonRepository } from '@scorely/api/src/modules/competition/season.repository';
import { createSeasonService } from '@scorely/api/src/modules/competition/season.service';
import { dynamoTrophyRepository } from '@scorely/api/src/modules/competition/trophy.repository';
import { createTrophyService } from '@scorely/api/src/modules/competition/trophy.service';
import { dynamoGameRepository } from '@scorely/api/src/modules/groups/game.repository';
import { dynamoGroupRepository } from '@scorely/api/src/modules/groups/group.repository';
import { dynamoScheduleRepository } from '@scorely/api/src/modules/groups/schedule.repository';
import { dynamoNotificationRepository } from '@scorely/api/src/modules/notifications/notification.repository';
import { createNotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import { dynamoTeamsRepository } from '@scorely/api/src/modules/teams/teams.repository';
import { dynamoUserDirectory } from '@scorely/api/src/modules/users/user.repository';

const notifications = createNotificationService(dynamoNotificationRepository);

import {
  CloseGameInputSchema,
  MatchInputSchema,
  RankingQuerySchema,
  SeasonInputSchema,
  SeasonUpdateInputSchema,
  UpdateCompetitionRulesInputSchema,
  UpdateMatchInputSchema,
  VersionInputSchema,
} from '@scorely/contracts';

const competition = createCompetitionService({
  groups: dynamoGroupRepository,
  competitions: dynamoCompetitionRepository,
});
const results = createResultService({
  groups: dynamoGroupRepository,
  games: dynamoGameRepository,
  groupSchedules: dynamoScheduleRepository,
  teams: dynamoTeamsRepository,
  competitions: dynamoCompetitionRepository,
  results: dynamoResultRepository,
  matches: dynamoMatchRepository,
  users: dynamoUserDirectory,
  seasons: dynamoSeasonRepository,
  notifications,
});
const matches = createMatchService({
  groups: dynamoGroupRepository,
  games: dynamoGameRepository,
  groupSchedules: dynamoScheduleRepository,
  teams: dynamoTeamsRepository,
  competitions: dynamoCompetitionRepository,
  results: dynamoResultRepository,
  matches: dynamoMatchRepository,
  users: dynamoUserDirectory,
  seasons: dynamoSeasonRepository,
  notifications,
  detail: (userId, groupId, gameId) => results.get(userId, groupId, gameId),
});

export async function getCompetition(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await competition.get(auth.userId, pathParam(event, 'id'));
    return result;
  });
}

export async function startCompetitionTrial(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await competition.startTrial(auth.userId, pathParam(event, 'id'));
    return result;
  });
}

export async function updateCompetitionRules(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, UpdateCompetitionRulesInputSchema);
    const result = await competition.updateRules(auth.userId, pathParam(event, 'id'), input);
    return result;
  });
}

export async function listCompetitionGames(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await results.list(auth.userId, pathParam(event, 'id'));
    return result;
  });
}

export async function getCompetitionGame(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await results.get(auth.userId, pathParam(event, 'id'), pathParam(event, 'gameId'));
    return result;
  });
}

export async function closeCompetitionGame(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, CloseGameInputSchema);
    const result = await results.close(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'gameId'),
      input,
    );
    return result;
  });
}

export async function createCompetitionMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, MatchInputSchema);
    const result = await matches.create(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'gameId'),
      input,
    );
    return result;
  });
}

export async function updateCompetitionMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, UpdateMatchInputSchema);
    const result = await matches.update(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'gameId'),
      pathParam(event, 'matchId'),
      input,
    );
    return result;
  });
}

export async function deleteCompetitionMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await matches.remove(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'gameId'),
      pathParam(event, 'matchId'),
      parseBody(event, VersionInputSchema),
    );
    return result;
  });
}

const ranking = createRankingService({
  groups: dynamoGroupRepository,
  competitions: dynamoCompetitionRepository,
  results: dynamoResultRepository,
  matches: dynamoMatchRepository,
  users: dynamoUserDirectory,
  seasons: dynamoSeasonRepository,
  notifications,
  trophies: dynamoTrophyRepository,
});

export async function getCompetitionRanking(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const query = RankingQuerySchema.parse(event.queryStringParameters ?? {});
    const result = await ranking.ranking(auth.userId, pathParam(event, 'id'), query.gender, query.season);
    return result;
  });
}

export async function getCompetitionPerson(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await ranking.person(
      auth.userId,
      pathParam(event, 'id'),
      asPublicUserId(pathParam(event, 'userId')),
    );
    return result;
  });
}

const seasons = createSeasonService({
  groups: dynamoGroupRepository,
  competitions: dynamoCompetitionRepository,
  seasons: dynamoSeasonRepository,
  notifications,
  trophies: dynamoTrophyRepository,
  results: dynamoResultRepository,
  matches: dynamoMatchRepository,
  users: dynamoUserDirectory,
});

export async function listCompetitionSeasons(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await seasons.list(auth.userId, pathParam(event, 'id'));
    return result;
  });
}

export async function createCompetitionSeason(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, SeasonInputSchema);
    const result = await seasons.create(auth.userId, pathParam(event, 'id'), input);
    return result;
  });
}

export async function updateCompetitionSeason(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, SeasonUpdateInputSchema);
    const result = await seasons.update(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'seasonId'),
      input,
    );
    return result;
  });
}

export async function deleteCompetitionSeason(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await seasons.remove(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'seasonId'),
      parseBody(event, VersionInputSchema),
    );
    return result;
  });
}

export async function closeCompetitionSeason(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await seasons.close(auth.userId, pathParam(event, 'id'), pathParam(event, 'seasonId'));
    return result;
  });
}

const trophies = createTrophyService({
  trophies: dynamoTrophyRepository,
  groups: dynamoGroupRepository,
  seasons: dynamoSeasonRepository,
});

export async function myTrophies(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await trophies.mine(auth.userId);
    return result;
  });
}
