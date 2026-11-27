import { authRoute } from '@scorely/api/src/lib/auth';
import { created, type HttpEvent, parseBody, pathParam } from '@scorely/api/src/lib/http';
import { asPublicGroupId } from '@scorely/api/src/lib/ids';
import { dynamoCompetitionRepository } from '@scorely/api/src/modules/groups/competitions/data/competitions.repository';
import { dynamoGroupRepository } from '@scorely/api/src/modules/groups/data/groups.repository';
import { createGroupAccess } from '@scorely/api/src/modules/groups/groups.access';
import { dynamoMatchRepository } from '@scorely/api/src/modules/groups/matches/data/matches.repository';
import { createMatchService } from '@scorely/api/src/modules/groups/matches/matches.service';
import { mediaService } from '@scorely/api/src/modules/media/media.service';
import { dynamoNotificationRepository } from '@scorely/api/src/modules/notifications/data/notifications.repository';
import { createNotificationService } from '@scorely/api/src/modules/notifications/notifications.service';
import { dynamoUserDirectory } from '@scorely/api/src/modules/users/data/users.repository';
import {
  type AdvanceMatchInput,
  AdvanceMatchInputSchema,
  type CreateMatchInput,
  CreateMatchInputSchema,
  type Match,
  type MatchHistoryPage,
  type MatchSeries,
  type MatchSummary,
  type RequestMatchGuestInput,
  RequestMatchGuestInputSchema,
  type SaveMatchResultInput,
  SaveMatchResultInputSchema,
  type SaveMatchTeamsInput,
  SaveMatchTeamsInputSchema,
  type SetAttendanceInput,
  SetAttendanceInputSchema,
  type SetMatchCompetitionsInput,
  SetMatchCompetitionsInputSchema,
  type UpdateMatchInput,
  UpdateMatchInputSchema,
  type UpdateMatchSeriesInput,
  UpdateMatchSeriesInputSchema,
} from '@scorely/contracts';

const matches = createMatchService({
  matches: dynamoMatchRepository,
  groups: createGroupAccess(dynamoGroupRepository),
  users: dynamoUserDirectory,
  media: mediaService,
  competitions: dynamoCompetitionRepository,
  notifications: createNotificationService(dynamoNotificationRepository),
});

const groupOf = (event: HttpEvent) => asPublicGroupId(pathParam(event, 'publicId'));
const matchOf = (event: HttpEvent) => pathParam(event, 'matchId');
const guestOf = (event: HttpEvent) => pathParam(event, 'guestId');
const seriesOf = (event: HttpEvent) => pathParam(event, 'seriesId');

export async function createMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: CreateMatchInput = parseBody(event, CreateMatchInputSchema);
    const publicId = groupOf(event);
    const match: Match = await matches.create(auth.userId, publicId, input);
    return created(match);
  });
}

export async function listMatches(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = groupOf(event);
    const list: MatchSummary[] = await matches.list(auth.userId, publicId);
    return list;
  });
}

export async function getMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = groupOf(event);
    const matchId = matchOf(event);
    const match: Match = await matches.get(auth.userId, publicId, matchId);
    return match;
  });
}

export async function updateMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: UpdateMatchInput = parseBody(event, UpdateMatchInputSchema);
    const publicId = groupOf(event);
    const matchId = matchOf(event);
    const match: Match = await matches.update(auth.userId, publicId, matchId, input);
    return match;
  });
}

export async function advanceMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: AdvanceMatchInput = parseBody(event, AdvanceMatchInputSchema);
    const publicId = groupOf(event);
    const matchId = matchOf(event);
    const match: Match = await matches.advance(auth.userId, publicId, matchId, input);
    return match;
  });
}

export async function cancelMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = groupOf(event);
    const matchId = matchOf(event);
    const match: Match = await matches.cancel(auth.userId, publicId, matchId);
    return match;
  });
}

export async function startMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = groupOf(event);
    const matchId = matchOf(event);
    const match: Match = await matches.start(auth.userId, publicId, matchId);
    return match;
  });
}

export async function unstartMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = groupOf(event);
    const matchId = matchOf(event);
    const match: Match = await matches.unstart(auth.userId, publicId, matchId);
    return match;
  });
}

export async function finishMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = groupOf(event);
    const matchId = matchOf(event);
    const match: Match = await matches.finish(auth.userId, publicId, matchId);
    return match;
  });
}

export async function setAttendance(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: SetAttendanceInput = parseBody(event, SetAttendanceInputSchema);
    const publicId = groupOf(event);
    const matchId = matchOf(event);
    const match: Match = await matches.setAttendance(auth.userId, publicId, matchId, input);
    return match;
  });
}

export async function requestGuest(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: RequestMatchGuestInput = parseBody(event, RequestMatchGuestInputSchema);
    const publicId = groupOf(event);
    const matchId = matchOf(event);
    const match: Match = await matches.requestGuest(auth.userId, publicId, matchId, input);
    return created(match);
  });
}

export async function approveGuest(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = groupOf(event);
    const matchId = matchOf(event);
    const guestId = guestOf(event);
    const match: Match = await matches.approveGuest(auth.userId, publicId, matchId, guestId);
    return match;
  });
}

export async function declineGuest(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = groupOf(event);
    const matchId = matchOf(event);
    const guestId = guestOf(event);
    const match: Match = await matches.declineGuest(auth.userId, publicId, matchId, guestId);
    return match;
  });
}

export async function removeGuest(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = groupOf(event);
    const matchId = matchOf(event);
    const guestId = guestOf(event);
    const match: Match = await matches.removeGuest(auth.userId, publicId, matchId, guestId);
    return match;
  });
}

export async function saveMatchTeams(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: SaveMatchTeamsInput = parseBody(event, SaveMatchTeamsInputSchema);
    const publicId = groupOf(event);
    const matchId = matchOf(event);
    const match: Match = await matches.saveTeams(auth.userId, publicId, matchId, input);
    return match;
  });
}

export async function saveMatchResult(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: SaveMatchResultInput = parseBody(event, SaveMatchResultInputSchema);
    const publicId = groupOf(event);
    const matchId = matchOf(event);
    const match: Match = await matches.saveResult(auth.userId, publicId, matchId, input);
    return match;
  });
}

export async function setMatchCompetitions(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: SetMatchCompetitionsInput = parseBody(event, SetMatchCompetitionsInputSchema);
    const publicId = groupOf(event);
    const matchId = matchOf(event);
    const match: Match = await matches.setCompetitions(auth.userId, publicId, matchId, input);
    return match;
  });
}

export async function matchHistory(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = groupOf(event);
    const cursor = event.queryStringParameters?.cursor;
    const page: MatchHistoryPage = await matches.history(auth.userId, publicId, cursor);
    return page;
  });
}

export async function updateMatchSeries(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: UpdateMatchSeriesInput = parseBody(event, UpdateMatchSeriesInputSchema);
    const publicId = groupOf(event);
    const seriesId = seriesOf(event);
    const series: MatchSeries = await matches.updateSeries(auth.userId, publicId, seriesId, input);
    return series;
  });
}

export async function endMatchSeries(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = groupOf(event);
    const seriesId = seriesOf(event);
    const series: MatchSeries = await matches.endSeries(auth.userId, publicId, seriesId);
    return series;
  });
}

/** A rotina `matchesAgenda` (evento `schedule`, PAR-21, 24, ADR 0012): não é rota. */
export async function matchesAgenda() {
  await matches.runAgenda();
}
