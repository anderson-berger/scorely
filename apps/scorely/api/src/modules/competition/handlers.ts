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
import { dynamoNotificationRepository } from '@scorely/api/src/modules/notifications/notification.repository';
import { createNotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import { dynamoTeamsRepository } from '@scorely/api/src/modules/teams/teams.repository';
import { dynamoUserDirectory } from '@scorely/api/src/modules/users/user.repository';

const notifications = createNotificationService(dynamoNotificationRepository);

import {
  CloseGameInputSchema,
  CompetitionRulesSchema,
  MatchInputSchema,
  RankingQuerySchema,
  SeasonInputSchema,
  SeasonUpdateInputSchema,
} from '@scorely/contracts';

const competition = createCompetitionService({
  groups: dynamoGroupRepository,
  competitions: dynamoCompetitionRepository,
});
const results = createResultService({
  groups: dynamoGroupRepository,
  games: dynamoGameRepository,
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
  teams: dynamoTeamsRepository,
  competitions: dynamoCompetitionRepository,
  results: dynamoResultRepository,
  matches: dynamoMatchRepository,
  users: dynamoUserDirectory,
  seasons: dynamoSeasonRepository,
  notifications,
  detail: (userId, groupId, date) => results.get(userId, groupId, date),
});

export async function getCompetition(event: HttpEvent) {
  return authRoute(event, async (auth) => competition.get(auth.userId, pathParam(event, 'id')));
}

export async function startCompetitionTrial(event: HttpEvent) {
  return authRoute(event, async (auth) => competition.startTrial(auth.userId, pathParam(event, 'id')));
}

export async function updateCompetitionRules(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const rules = parseBody(event, CompetitionRulesSchema);
    return competition.updateRules(auth.userId, pathParam(event, 'id'), rules);
  });
}

export async function listCompetitionGames(event: HttpEvent) {
  return authRoute(event, async (auth) => results.list(auth.userId, pathParam(event, 'id')));
}

export async function getCompetitionGame(event: HttpEvent) {
  return authRoute(event, async (auth) =>
    results.get(auth.userId, pathParam(event, 'id'), pathParam(event, 'date')),
  );
}

export async function closeCompetitionGame(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, CloseGameInputSchema);
    return results.close(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'), input);
  });
}

export async function createCompetitionMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, MatchInputSchema);
    return matches.create(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'), input);
  });
}

export async function updateCompetitionMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, MatchInputSchema);
    return matches.update(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'date'),
      pathParam(event, 'matchId'),
      input,
    );
  });
}

export async function deleteCompetitionMatch(event: HttpEvent) {
  return authRoute(event, async (auth) =>
    matches.remove(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'date'),
      pathParam(event, 'matchId'),
    ),
  );
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
    return ranking.ranking(auth.userId, pathParam(event, 'id'), query.gender, query.season);
  });
}

export async function getCompetitionPerson(event: HttpEvent) {
  return authRoute(event, async (auth) =>
    ranking.person(auth.userId, pathParam(event, 'id'), asPublicUserId(pathParam(event, 'userId'))),
  );
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
  return authRoute(event, async (auth) => seasons.list(auth.userId, pathParam(event, 'id')));
}

export async function createCompetitionSeason(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, SeasonInputSchema);
    return seasons.create(auth.userId, pathParam(event, 'id'), input);
  });
}

export async function updateCompetitionSeason(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, SeasonUpdateInputSchema);
    return seasons.update(auth.userId, pathParam(event, 'id'), pathParam(event, 'seasonId'), input);
  });
}

export async function deleteCompetitionSeason(event: HttpEvent) {
  return authRoute(event, async (auth) =>
    seasons.remove(auth.userId, pathParam(event, 'id'), pathParam(event, 'seasonId')),
  );
}

export async function closeCompetitionSeason(event: HttpEvent) {
  return authRoute(event, async (auth) =>
    seasons.close(auth.userId, pathParam(event, 'id'), pathParam(event, 'seasonId')),
  );
}

const trophies = createTrophyService({
  trophies: dynamoTrophyRepository,
  groups: dynamoGroupRepository,
  seasons: dynamoSeasonRepository,
});

export async function myTrophies(event: HttpEvent) {
  return authRoute(event, async (auth) => trophies.mine(auth.userId));
}
