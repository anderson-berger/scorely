import { authRoute } from '@scorely/api/src/lib/auth';
import { type HttpEvent, parseBody, pathParam } from '@scorely/api/src/lib/http';
import { asPublicUserId } from '@scorely/api/src/lib/ids';
import { dynamoGameRepository } from '@scorely/api/src/modules/groups/game.repository';
import { createGameService } from '@scorely/api/src/modules/groups/game.service';
import { dynamoGroupRepository } from '@scorely/api/src/modules/groups/group.repository';
import { createGroupService } from '@scorely/api/src/modules/groups/group.service';
import type { GroupsDeps, SportsDep } from '@scorely/api/src/modules/groups/groups.deps';
import { dynamoPlaceRepository } from '@scorely/api/src/modules/groups/place.repository';
import { dynamoNotificationRepository } from '@scorely/api/src/modules/notifications/notification.repository';
import { createNotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import { sportService } from '@scorely/api/src/modules/sports/sport.service';
import { dynamoPlayerRepository } from '@scorely/api/src/modules/teams/player.repository';
import { createPlayerService } from '@scorely/api/src/modules/teams/player.service';
import { dynamoTeamSettingsRepository } from '@scorely/api/src/modules/teams/settings.repository';
import { createTeamSettingsService } from '@scorely/api/src/modules/teams/settings.service';
import { dynamoTeamsRepository } from '@scorely/api/src/modules/teams/teams.repository';
import { createTeamsService } from '@scorely/api/src/modules/teams/teams.service';
import { dynamoUserDirectory } from '@scorely/api/src/modules/users/user.repository';
import {
  SaveTeamsInputSchema,
  UpdatePlayerInputSchema,
  UpdateTeamSettingsInputSchema,
  VersionInputSchema,
} from '@scorely/contracts';

const groupsDeps: GroupsDeps & SportsDep = {
  groups: dynamoGroupRepository,
  games: dynamoGameRepository,
  places: dynamoPlaceRepository,
  users: dynamoUserDirectory,
  notifications: createNotificationService(dynamoNotificationRepository),
  sports: sportService,
};
const groups = createGroupService(groupsDeps);
const games = createGameService(groupsDeps);
const players = createPlayerService({
  groups: dynamoGroupRepository,
  roster: { members: groups.memberRecords, currentGame: games.currentRoster },
  players: dynamoPlayerRepository,
  users: dynamoUserDirectory,
  sports: sportService,
});
const teams = createTeamsService({
  groups: dynamoGroupRepository,
  roster: { currentGame: games.currentRoster, guestView: games.guestRoster },
  players: dynamoPlayerRepository,
  users: dynamoUserDirectory,
  notifications: groupsDeps.notifications,
  teams: dynamoTeamsRepository,
  settings: dynamoTeamSettingsRepository,
  sports: sportService,
});
const teamSettings = createTeamSettingsService({
  groups: dynamoGroupRepository,
  roster: { members: groups.memberRecords, currentGame: games.currentRoster },
  users: dynamoUserDirectory,
  settings: dynamoTeamSettingsRepository,
  sports: sportService,
});

export async function listPlayers(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return players.list(auth.userId, pathParam(event, 'id'));
  });
}

export async function updatePlayer(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, UpdatePlayerInputSchema);
    return players.update(
      auth.userId,
      pathParam(event, 'id'),
      asPublicUserId(pathParam(event, 'userId')),
      input,
    );
  });
}

export async function getTeamSettings(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return teamSettings.get(auth.userId, pathParam(event, 'id'));
  });
}

export async function updateTeamSettings(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, UpdateTeamSettingsInputSchema);
    return teamSettings.update(auth.userId, pathParam(event, 'id'), input);
  });
}

export async function getTeams(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return teams.get(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'));
  });
}

export async function saveTeams(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, SaveTeamsInputSchema);
    return teams.save(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'), input);
  });
}

export async function publishTeams(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    // TIM-25: a versão dos times que a tela mostrou.
    const input = parseBody(event, VersionInputSchema);
    return teams.publish(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'), input);
  });
}

export async function drawTeams(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    // TIM-25: a versão dos times que a tela mostrou.
    const input = parseBody(event, VersionInputSchema);
    return teams.draw(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'), input);
  });
}

export async function unpublishTeams(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    // TIM-25: a versão dos times que a tela mostrou.
    const input = parseBody(event, VersionInputSchema);
    return teams.unpublish(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'), input);
  });
}

export async function discardTeams(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, VersionInputSchema);
    await teams.discard(auth.userId, pathParam(event, 'id'), pathParam(event, 'date'), input);
  });
}

export async function guestTeams(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return teams.guestGet(auth.userId, pathParam(event, 'token'));
  });
}
