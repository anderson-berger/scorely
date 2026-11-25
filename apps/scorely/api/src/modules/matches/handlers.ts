import { authRoute } from '@scorely/api/src/lib/auth';
import { created, type HttpEvent, parseBody, pathParam } from '@scorely/api/src/lib/http';
import { asPublicGroupId } from '@scorely/api/src/lib/ids';
import { dynamoCompetitionRepository } from '@scorely/api/src/modules/competitions/competition.repository';
import { createGroupAccess } from '@scorely/api/src/modules/groups/group.access';
import { dynamoGroupRepository } from '@scorely/api/src/modules/groups/group.repository';
import { dynamoMatchRepository } from '@scorely/api/src/modules/matches/match.repository';
import { createMatchService } from '@scorely/api/src/modules/matches/match.service';
import { mediaService } from '@scorely/api/src/modules/media/media.service';
import { dynamoNotificationRepository } from '@scorely/api/src/modules/notifications/notification.repository';
import { createNotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import { dynamoUserDirectory } from '@scorely/api/src/modules/users/user.repository';
import {
  AdvanceMatchInputSchema,
  CreateMatchInputSchema,
  RequestMatchGuestInputSchema,
  SaveMatchResultInputSchema,
  SaveMatchTeamsInputSchema,
  SetAttendanceInputSchema,
  SetMatchCompetitionsInputSchema,
  UpdateMatchInputSchema,
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
    const input = parseBody(event, CreateMatchInputSchema);
    return created(await matches.create(auth.userId, groupOf(event), input));
  });
}

export async function listMatches(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const list = await matches.list(auth.userId, groupOf(event));
    return list;
  });
}

export async function getMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const match = await matches.get(auth.userId, groupOf(event), matchOf(event));
    return match;
  });
}

export async function updateMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, UpdateMatchInputSchema);
    const match = await matches.update(auth.userId, groupOf(event), matchOf(event), input);
    return match;
  });
}

export async function advanceMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, AdvanceMatchInputSchema);
    const match = await matches.advance(auth.userId, groupOf(event), matchOf(event), input);
    return match;
  });
}

export async function cancelMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const match = await matches.cancel(auth.userId, groupOf(event), matchOf(event));
    return match;
  });
}

export async function startMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const match = await matches.start(auth.userId, groupOf(event), matchOf(event));
    return match;
  });
}

export async function unstartMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const match = await matches.unstart(auth.userId, groupOf(event), matchOf(event));
    return match;
  });
}

export async function finishMatch(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const match = await matches.finish(auth.userId, groupOf(event), matchOf(event));
    return match;
  });
}

export async function setAttendance(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, SetAttendanceInputSchema);
    const match = await matches.setAttendance(auth.userId, groupOf(event), matchOf(event), input);
    return match;
  });
}

export async function requestGuest(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, RequestMatchGuestInputSchema);
    const match = await matches.requestGuest(auth.userId, groupOf(event), matchOf(event), input);
    return created(match);
  });
}

export async function approveGuest(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const match = await matches.approveGuest(auth.userId, groupOf(event), matchOf(event), guestOf(event));
    return match;
  });
}

export async function declineGuest(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const match = await matches.declineGuest(auth.userId, groupOf(event), matchOf(event), guestOf(event));
    return match;
  });
}

export async function removeGuest(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const match = await matches.removeGuest(auth.userId, groupOf(event), matchOf(event), guestOf(event));
    return match;
  });
}

export async function saveMatchTeams(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, SaveMatchTeamsInputSchema);
    const match = await matches.saveTeams(auth.userId, groupOf(event), matchOf(event), input);
    return match;
  });
}

export async function saveMatchResult(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, SaveMatchResultInputSchema);
    const match = await matches.saveResult(auth.userId, groupOf(event), matchOf(event), input);
    return match;
  });
}

export async function setMatchCompetitions(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, SetMatchCompetitionsInputSchema);
    const match = await matches.setCompetitions(auth.userId, groupOf(event), matchOf(event), input);
    return match;
  });
}

export async function matchHistory(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const page = await matches.history(auth.userId, groupOf(event), event.queryStringParameters?.cursor);
    return page;
  });
}

export async function updateMatchSeries(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, UpdateMatchSeriesInputSchema);
    const series = await matches.updateSeries(auth.userId, groupOf(event), seriesOf(event), input);
    return series;
  });
}

export async function endMatchSeries(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const series = await matches.endSeries(auth.userId, groupOf(event), seriesOf(event));
    return series;
  });
}

/** A rotina `matchesAgenda` (evento `schedule`, PAR-21, 24, ADR 0012): não é rota. */
export async function matchesAgenda() {
  await matches.runAgenda();
}
