import {
  type CreateGroupInput,
  GameSchema,
  type GrantableRoleId,
  type Group,
  type GroupImageSlot,
  GroupSchema,
  GuestGameSchema,
  type InviteKind,
  InviteSchema,
  MediaUploadSchema,
  MemberInviteSchema,
  MemberSchema,
  MyGroupSchema,
  type PlaceInput,
  PlaceSchema,
  type ScheduleInput,
  ScheduleSchema,
  type UpdateGameInput,
  type UpdateGroupInput,
  type UpdatePlaceInput,
  type UpdateScheduleInput,
  type VersionInput,
} from '@scorely/contracts';
import { request, send } from '@scorely/web/src/lib/http';
import { contentTypeOf, uploadMedia } from '@scorely/web/src/lib/media';

const game = (groupId: string, gameId: string) => `/groups/${groupId}/games/${gameId}`;
const play = (token: string) => `/play/${encodeURIComponent(token)}`;

export const groupsApi = {
  create: (input: CreateGroupInput) => request({ url: '/groups', method: 'POST', data: input }, GroupSchema),
  mine: () => request({ url: '/me/groups' }, MyGroupSchema.array()),
  archived: () => request({ url: '/me/groups/archived' }, GroupSchema.array()),
  archive: (id: string) => request({ url: `/groups/${id}/archive`, method: 'POST' }, GroupSchema),
  unarchive: (id: string) => request({ url: `/groups/${id}/unarchive`, method: 'POST' }, GroupSchema),
  get: (id: string) => request({ url: `/groups/${id}` }, GroupSchema),
  update: (id: string, patch: UpdateGroupInput) =>
    request({ url: `/groups/${id}`, method: 'PATCH', data: patch }, GroupSchema),
  /** Horários do grupo (GRP-64–67). */
  schedules: (id: string) => request({ url: `/groups/${id}/schedules` }, ScheduleSchema.array()),
  createSchedule: (id: string, input: ScheduleInput) =>
    request({ url: `/groups/${id}/schedules`, method: 'POST', data: input }, ScheduleSchema),
  updateSchedule: (id: string, scheduleId: string, input: UpdateScheduleInput) =>
    request({ url: `/groups/${id}/schedules/${scheduleId}`, method: 'PUT', data: input }, ScheduleSchema),
  archiveSchedule: (id: string, scheduleId: string, input: VersionInput) =>
    request(
      { url: `/groups/${id}/schedules/${scheduleId}/archive`, method: 'POST', data: input },
      ScheduleSchema,
    ),
  unarchiveSchedule: (id: string, scheduleId: string, input: VersionInput) =>
    request(
      { url: `/groups/${id}/schedules/${scheduleId}/unarchive`, method: 'POST', data: input },
      ScheduleSchema,
    ),
  /** Lugares do grupo (GRP-60–63). */
  places: (id: string) => request({ url: `/groups/${id}/places` }, PlaceSchema.array()),
  createPlace: (id: string, input: PlaceInput) =>
    request({ url: `/groups/${id}/places`, method: 'POST', data: input }, PlaceSchema),
  updatePlace: (id: string, placeId: string, input: UpdatePlaceInput) =>
    request({ url: `/groups/${id}/places/${placeId}`, method: 'PUT', data: input }, PlaceSchema),
  archivePlace: (id: string, placeId: string, input: VersionInput) =>
    request({ url: `/groups/${id}/places/${placeId}/archive`, method: 'POST', data: input }, PlaceSchema),
  unarchivePlace: (id: string, placeId: string, input: VersionInput) =>
    request({ url: `/groups/${id}/places/${placeId}/unarchive`, method: 'POST', data: input }, PlaceSchema),
  /** Vagas e mínimo só do jogo atual (GRP-45, 46); `null` = volta ao padrão do grupo. */
  updateGame: (id: string, gameId: string, patch: UpdateGameInput) =>
    request({ url: `/groups/${id}/games/${gameId}`, method: 'PATCH', data: patch }, GameSchema),
  rotateInvite: (id: string, kind: InviteKind) =>
    request({ url: `/groups/${id}/invite`, method: 'POST', data: { kind } }, InviteSchema),
  acceptInvite: (token: string) =>
    request({ url: `/invites/${encodeURIComponent(token)}/accept`, method: 'POST' }, GroupSchema),
  members: (id: string) => request({ url: `/groups/${id}/members` }, MemberSchema.array()),
  removeMember: (id: string, userId: string) =>
    send({ url: `/groups/${id}/members/${userId}`, method: 'DELETE' }),
  /** Convite para membro (GRP-40, 41) e sair do grupo (GRP-42). */
  inviteToMember: (id: string, userId: string) =>
    request({ url: `/groups/${id}/members/${userId}/member-invite`, method: 'POST' }, MemberInviteSchema),
  cancelMemberInvite: (id: string, userId: string) =>
    send({ url: `/groups/${id}/members/${userId}/member-invite`, method: 'DELETE' }),
  acceptMemberInvite: (id: string) =>
    request({ url: `/groups/${id}/member-invite/accept`, method: 'POST' }, GroupSchema),
  declineMemberInvite: (id: string) => send({ url: `/groups/${id}/member-invite/decline`, method: 'POST' }),
  leaveGroup: (id: string) => send({ url: `/groups/${id}/leave`, method: 'POST' }),
  /** Cargos (GRP-51) e passar o grupo (GRP-54): só o dono. */
  setStaffRole: (id: string, userId: string, roleId: GrantableRoleId) =>
    send({ url: `/groups/${id}/members/${userId}/staff-role`, method: 'PUT', data: { roleId } }),
  clearStaffRole: (id: string, userId: string) =>
    send({ url: `/groups/${id}/members/${userId}/staff-role`, method: 'DELETE' }),
  transfer: (id: string, userId: string) =>
    request({ url: `/groups/${id}/transfer`, method: 'POST', data: { userId } }, GroupSchema),
  /** GRP-11: os próximos jogos do grupo, em ordem de início. */
  games: (id: string) => request({ url: `/groups/${id}/games` }, GameSchema.array()),
  confirm: (id: string, gameId: string) =>
    request({ url: `${game(id, gameId)}/attendance`, method: 'POST' }, GameSchema),
  leave: (id: string, gameId: string) => send({ url: `${game(id, gameId)}/attendance`, method: 'DELETE' }),
  cancel: (id: string, gameId: string) =>
    request({ url: `${game(id, gameId)}/cancel`, method: 'POST' }, GameSchema),
  reopen: (id: string, gameId: string) =>
    request({ url: `${game(id, gameId)}/reopen`, method: 'POST' }, GameSchema),
  play: (token: string) => request({ url: play(token) }, GuestGameSchema),
  playConfirm: (token: string, gameId: string) =>
    request({ url: `${play(token)}/games/${gameId}/attendance`, method: 'POST' }, GameSchema),
  playLeave: (token: string, gameId: string) =>
    send({ url: `${play(token)}/games/${gameId}/attendance`, method: 'DELETE' }),
};

/** Logo e capa do grupo (GRP-35): pede o envio → envia ao S3 → confirma (MID-04, MID-05). */
export async function uploadGroupImage(id: string, slot: GroupImageSlot, blob: Blob): Promise<Group> {
  const base = `/groups/${id}/images/${slot}`;
  const upload = await request(
    { url: `${base}/upload`, method: 'POST', data: { contentType: contentTypeOf(blob) } },
    MediaUploadSchema,
  );
  await uploadMedia(upload, blob);
  return request({ url: base, method: 'PUT', data: { mediaId: upload.mediaId } }, GroupSchema);
}

export const removeGroupImage = (id: string, slot: GroupImageSlot) =>
  request({ url: `/groups/${id}/images/${slot}`, method: 'DELETE' }, GroupSchema);
