import { authRoute } from '@scorely/api/src/lib/auth';
import { created, type HttpEvent, parseBody, pathParam } from '@scorely/api/src/lib/http';
import { asPublicUserId } from '@scorely/api/src/lib/ids';
import { dynamoGameRepository } from '@scorely/api/src/modules/groups/game.repository';
import { createGameService } from '@scorely/api/src/modules/groups/game.service';
import { createGroupImages } from '@scorely/api/src/modules/groups/group.images';
import { dynamoGroupRepository } from '@scorely/api/src/modules/groups/group.repository';
import { createGroupService } from '@scorely/api/src/modules/groups/group.service';
import type { GroupsDeps, SportsDep } from '@scorely/api/src/modules/groups/groups.deps';
import { dynamoPlaceRepository } from '@scorely/api/src/modules/groups/place.repository';
import { createPlaceService } from '@scorely/api/src/modules/groups/place.service';
import { dynamoScheduleRepository } from '@scorely/api/src/modules/groups/schedule.repository';
import { createScheduleService } from '@scorely/api/src/modules/groups/schedule.service';
import { mediaService } from '@scorely/api/src/modules/media/media.service';
import { dynamoNotificationRepository } from '@scorely/api/src/modules/notifications/notification.repository';
import { createNotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import { sportService } from '@scorely/api/src/modules/sports/sport.service';
import { dynamoUserDirectory } from '@scorely/api/src/modules/users/user.repository';
import {
  AttachMediaInputSchema,
  CreateGameInputSchema,
  CreateGroupInputSchema,
  GroupImageSlotSchema,
  MediaUploadInputSchema,
  PlaceInputSchema,
  RescheduleGameInputSchema,
  RotateInviteInputSchema,
  ScheduleInputSchema,
  SetRoleInputSchema,
  TransferGroupInputSchema,
  UpdateGameInputSchema,
  UpdateGroupInputSchema,
  UpdateGroupNameInputSchema,
  UpdatePlaceInputSchema,
  UpdateScheduleInputSchema,
  VersionInputSchema,
} from '@scorely/contracts';

const deps: GroupsDeps & SportsDep = {
  groups: dynamoGroupRepository,
  games: dynamoGameRepository,
  places: dynamoPlaceRepository,
  schedules: dynamoScheduleRepository,
  users: dynamoUserDirectory,
  notifications: createNotificationService(dynamoNotificationRepository),
  sports: sportService,
};
const groups = createGroupService(deps);
const places = createPlaceService(deps);
const schedules = createScheduleService(deps);
const games = createGameService(deps);
const images = createGroupImages({ ...deps, media: mediaService });

/** `slot` da rota das imagens (GRP-35): `logo` ou `cover`; outro valor → 422. */
const slotOf = (event: HttpEvent) => GroupImageSlotSchema.parse(pathParam(event, 'slot'));

export async function create(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return created(await groups.create(auth.userId, parseBody(event, CreateGroupInputSchema)));
  });
}

export async function myGroups(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.myGroups(auth.userId);
  });
}

export async function archivedGroups(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.archivedGroups(auth.userId);
  });
}

export async function archive(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.archive(auth.userId, pathParam(event, 'id'));
  });
}

export async function unarchive(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.unarchive(auth.userId, pathParam(event, 'id'));
  });
}

export async function get(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.get(auth.userId, pathParam(event, 'id'));
  });
}

export async function update(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.update(auth.userId, pathParam(event, 'id'), parseBody(event, UpdateGroupInputSchema));
  });
}

export async function rotateInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const { kind } = parseBody(event, RotateInviteInputSchema);
    return groups.rotateInvite(auth.userId, pathParam(event, 'id'), kind);
  });
}

export async function requestImageUpload(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, MediaUploadInputSchema);
    return images.requestUpload(auth.userId, pathParam(event, 'id'), slotOf(event), input);
  });
}

export async function attachImage(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, AttachMediaInputSchema);
    return images.attach(auth.userId, pathParam(event, 'id'), slotOf(event), input);
  });
}

export async function detachImage(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return images.detach(auth.userId, pathParam(event, 'id'), slotOf(event));
  });
}

export async function acceptInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.acceptInvite(auth.userId, pathParam(event, 'token'));
  });
}

export async function members(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.members(auth.userId, pathParam(event, 'id'));
  });
}

export async function removeMember(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.removeMember(
      auth.userId,
      pathParam(event, 'id'),
      asPublicUserId(pathParam(event, 'userId')),
    );
  });
}

/** GRP-51: o dono dá o cargo. */
export async function setStaffRole(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const { roleId } = parseBody(event, SetRoleInputSchema);
    await groups.setStaffRole(
      auth.userId,
      pathParam(event, 'id'),
      asPublicUserId(pathParam(event, 'userId')),
      roleId,
    );
  });
}

/** GRP-51: o dono tira o cargo. */
export async function clearStaffRole(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.clearStaffRole(
      auth.userId,
      pathParam(event, 'id'),
      asPublicUserId(pathParam(event, 'userId')),
    );
  });
}

/** GRP-54: o dono passa o grupo para um membro. */
export async function transferGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const { userId } = parseBody(event, TransferGroupInputSchema);
    return groups.transfer(auth.userId, pathParam(event, 'id'), userId);
  });
}

export async function inviteToMember(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.inviteToMember(
      auth.userId,
      pathParam(event, 'id'),
      asPublicUserId(pathParam(event, 'userId')),
    );
  });
}

export async function cancelMemberInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.cancelMemberInvite(
      auth.userId,
      pathParam(event, 'id'),
      asPublicUserId(pathParam(event, 'userId')),
    );
  });
}

export async function acceptMemberInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return groups.acceptMemberInvite(auth.userId, pathParam(event, 'id'));
  });
}

export async function declineMemberInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.declineMemberInvite(auth.userId, pathParam(event, 'id'));
  });
}

export async function leaveGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await groups.leave(auth.userId, pathParam(event, 'id'));
  });
}

/** GRP-11: os próximos jogos do grupo. */
export async function upcomingGames(event: HttpEvent) {
  return authRoute(event, async (auth) => games.upcoming(auth.userId, pathParam(event, 'id')));
}

export async function confirm(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return games.confirm(auth.userId, pathParam(event, 'id'), pathParam(event, 'gameId'));
  });
}

export async function leave(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await games.leave(auth.userId, pathParam(event, 'id'), pathParam(event, 'gameId'));
  });
}

export async function cancel(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return games.cancel(auth.userId, pathParam(event, 'id'), pathParam(event, 'gameId'));
  });
}

export async function reopen(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return games.reopen(auth.userId, pathParam(event, 'id'), pathParam(event, 'gameId'));
  });
}

export async function updateGame(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const patch = parseBody(event, UpdateGameInputSchema);
    return games.updateGame(auth.userId, pathParam(event, 'id'), pathParam(event, 'gameId'), patch);
  });
}

/** GRP-68: marca um jogo extra (`game.manage`). */
export async function createExtraGame(event: HttpEvent) {
  return authRoute(event, async (auth) =>
    created(
      await games.createExtra(auth.userId, pathParam(event, 'id'), parseBody(event, CreateGameInputSchema)),
    ),
  );
}

/** GRP-69: remarca um jogo, com a versão (`game.manage`). */
export async function rescheduleGame(event: HttpEvent) {
  return authRoute(event, async (auth) =>
    games.reschedule(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'gameId'),
      parseBody(event, RescheduleGameInputSchema),
    ),
  );
}

/** GRP-71: muda o nome do grupo, com a versão da identidade (`settings.edit`). */
export async function renameGroup(event: HttpEvent) {
  return authRoute(event, async (auth) =>
    groups.rename(auth.userId, pathParam(event, 'id'), parseBody(event, UpdateGroupNameInputSchema)),
  );
}

export async function playView(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return games.guestView(auth.userId, pathParam(event, 'token'));
  });
}

export async function playConfirm(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return games.guestConfirm(auth.userId, pathParam(event, 'token'), pathParam(event, 'gameId'));
  });
}

export async function playLeave(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await games.guestLeave(auth.userId, pathParam(event, 'token'), pathParam(event, 'gameId'));
  });
}

/** GRP-63: os lugares do grupo, para membros e reservas. */
export async function listPlaces(event: HttpEvent) {
  return authRoute(event, async (auth) => places.list(auth.userId, pathParam(event, 'id')));
}

/** GRP-60: cadastra um lugar (`settings.edit`). */
export async function createPlace(event: HttpEvent) {
  return authRoute(event, async (auth) =>
    created(await places.create(auth.userId, pathParam(event, 'id'), parseBody(event, PlaceInputSchema))),
  );
}

/** GRP-60: edita o lugar, com a versão (ADR 0016). */
export async function updatePlace(event: HttpEvent) {
  return authRoute(event, async (auth) =>
    places.update(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'placeId'),
      parseBody(event, UpdatePlaceInputSchema),
    ),
  );
}

/** GRP-61: arquiva o lugar. */
export async function archivePlace(event: HttpEvent) {
  return authRoute(event, async (auth) =>
    places.archive(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'placeId'),
      parseBody(event, VersionInputSchema),
    ),
  );
}

/** GRP-61: desarquiva o lugar. */
export async function unarchivePlace(event: HttpEvent) {
  return authRoute(event, async (auth) =>
    places.unarchive(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'placeId'),
      parseBody(event, VersionInputSchema),
    ),
  );
}

/** GRP-64: os horários do grupo, para membros e reservas. */
export async function listSchedules(event: HttpEvent) {
  return authRoute(event, async (auth) => schedules.list(auth.userId, pathParam(event, 'id')));
}

/** GRP-64, 65: cria um horário (`settings.edit`). */
export async function createSchedule(event: HttpEvent) {
  return authRoute(event, async (auth) =>
    created(
      await schedules.create(auth.userId, pathParam(event, 'id'), parseBody(event, ScheduleInputSchema)),
    ),
  );
}

/** GRP-66, 67: edita o horário inteiro, com a versão (ADR 0016). */
export async function updateSchedule(event: HttpEvent) {
  return authRoute(event, async (auth) =>
    schedules.update(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'scheduleId'),
      parseBody(event, UpdateScheduleInputSchema),
    ),
  );
}

/** GRP-67: arquiva o horário (e cancela o próximo jogo dele). */
export async function archiveSchedule(event: HttpEvent) {
  return authRoute(event, async (auth) =>
    schedules.archive(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'scheduleId'),
      parseBody(event, VersionInputSchema),
    ),
  );
}

/** GRP-67: desarquiva o horário. */
export async function unarchiveSchedule(event: HttpEvent) {
  return authRoute(event, async (auth) =>
    schedules.unarchive(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'scheduleId'),
      parseBody(event, VersionInputSchema),
    ),
  );
}
