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
    const result = await groups.myGroups(auth.userId);
    return result;
  });
}

export async function archivedGroups(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await groups.archivedGroups(auth.userId);
    return result;
  });
}

export async function archive(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await groups.archive(auth.userId, pathParam(event, 'id'));
    return result;
  });
}

export async function unarchive(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await groups.unarchive(auth.userId, pathParam(event, 'id'));
    return result;
  });
}

export async function get(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await groups.get(auth.userId, pathParam(event, 'id'));
    return result;
  });
}

export async function update(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await groups.update(
      auth.userId,
      pathParam(event, 'id'),
      parseBody(event, UpdateGroupInputSchema),
    );
    return result;
  });
}

export async function rotateInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const { kind } = parseBody(event, RotateInviteInputSchema);
    const result = await groups.rotateInvite(auth.userId, pathParam(event, 'id'), kind);
    return result;
  });
}

export async function requestImageUpload(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, MediaUploadInputSchema);
    const result = await images.requestUpload(auth.userId, pathParam(event, 'id'), slotOf(event), input);
    return result;
  });
}

export async function attachImage(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, AttachMediaInputSchema);
    const result = await images.attach(auth.userId, pathParam(event, 'id'), slotOf(event), input);
    return result;
  });
}

export async function detachImage(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await images.detach(auth.userId, pathParam(event, 'id'), slotOf(event));
    return result;
  });
}

export async function acceptInvite(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await groups.acceptInvite(auth.userId, pathParam(event, 'token'));
    return result;
  });
}

export async function members(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await groups.members(auth.userId, pathParam(event, 'id'));
    return result;
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
    const result = await groups.transfer(auth.userId, pathParam(event, 'id'), userId);
    return result;
  });
}

export async function inviteToMember(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await groups.inviteToMember(
      auth.userId,
      pathParam(event, 'id'),
      asPublicUserId(pathParam(event, 'userId')),
    );
    return result;
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
    const result = await groups.acceptMemberInvite(auth.userId, pathParam(event, 'id'));
    return result;
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
  return authRoute(event, async (auth) => {
    const result = await games.upcoming(auth.userId, pathParam(event, 'id'));
    return result;
  });
}

export async function confirm(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await games.confirm(auth.userId, pathParam(event, 'id'), pathParam(event, 'gameId'));
    return result;
  });
}

export async function leave(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await games.leave(auth.userId, pathParam(event, 'id'), pathParam(event, 'gameId'));
  });
}

export async function cancel(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await games.cancel(auth.userId, pathParam(event, 'id'), pathParam(event, 'gameId'));
    return result;
  });
}

export async function reopen(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await games.reopen(auth.userId, pathParam(event, 'id'), pathParam(event, 'gameId'));
    return result;
  });
}

export async function updateGame(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const patch = parseBody(event, UpdateGameInputSchema);
    const result = await games.updateGame(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'gameId'),
      patch,
    );
    return result;
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
  return authRoute(event, async (auth) => {
    const result = await games.reschedule(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'gameId'),
      parseBody(event, RescheduleGameInputSchema),
    );
    return result;
  });
}

/** GRP-71: muda o nome do grupo, com a versão da identidade (`settings.edit`). */
export async function renameGroup(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await groups.rename(
      auth.userId,
      pathParam(event, 'id'),
      parseBody(event, UpdateGroupNameInputSchema),
    );
    return result;
  });
}

export async function playView(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await games.guestView(auth.userId, pathParam(event, 'token'));
    return result;
  });
}

export async function playConfirm(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await games.guestConfirm(
      auth.userId,
      pathParam(event, 'token'),
      pathParam(event, 'gameId'),
    );
    return result;
  });
}

export async function playLeave(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    await games.guestLeave(auth.userId, pathParam(event, 'token'), pathParam(event, 'gameId'));
  });
}

/** GRP-63: os lugares do grupo, para membros e reservas. */
export async function listPlaces(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await places.list(auth.userId, pathParam(event, 'id'));
    return result;
  });
}

/** GRP-60: cadastra um lugar (`settings.edit`). */
export async function createPlace(event: HttpEvent) {
  return authRoute(event, async (auth) =>
    created(await places.create(auth.userId, pathParam(event, 'id'), parseBody(event, PlaceInputSchema))),
  );
}

/** GRP-60: edita o lugar, com a versão (ADR 0016). */
export async function updatePlace(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await places.update(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'placeId'),
      parseBody(event, UpdatePlaceInputSchema),
    );
    return result;
  });
}

/** GRP-61: arquiva o lugar. */
export async function archivePlace(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await places.archive(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'placeId'),
      parseBody(event, VersionInputSchema),
    );
    return result;
  });
}

/** GRP-61: desarquiva o lugar. */
export async function unarchivePlace(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await places.unarchive(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'placeId'),
      parseBody(event, VersionInputSchema),
    );
    return result;
  });
}

/** GRP-64: os horários do grupo, para membros e reservas. */
export async function listSchedules(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await schedules.list(auth.userId, pathParam(event, 'id'));
    return result;
  });
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
  return authRoute(event, async (auth) => {
    const result = await schedules.update(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'scheduleId'),
      parseBody(event, UpdateScheduleInputSchema),
    );
    return result;
  });
}

/** GRP-67: arquiva o horário (e cancela o próximo jogo dele). */
export async function archiveSchedule(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await schedules.archive(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'scheduleId'),
      parseBody(event, VersionInputSchema),
    );
    return result;
  });
}

/** GRP-67: desarquiva o horário. */
export async function unarchiveSchedule(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const result = await schedules.unarchive(
      auth.userId,
      pathParam(event, 'id'),
      pathParam(event, 'scheduleId'),
      parseBody(event, VersionInputSchema),
    );
    return result;
  });
}
