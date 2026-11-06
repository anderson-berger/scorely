import {
  type CreateGroupInput,
  GameSchema,
  GroupSchema,
  GuestGameSchema,
  type InviteKind,
  InviteSchema,
  MemberSchema,
  MyGroupSchema,
  type UpdateGroupInput,
} from '@scorely/contracts';
import { request, send } from '@/lib/http';

const game = (groupId: string, date: string) => `/groups/${groupId}/games/${date}`;
const play = (token: string) => `/play/${encodeURIComponent(token)}`;

export const groupsApi = {
  create: (input: CreateGroupInput) => request({ url: '/groups', method: 'POST', data: input }, GroupSchema),
  mine: () => request({ url: '/me/groups' }, MyGroupSchema.array()),
  get: (id: string) => request({ url: `/groups/${id}` }, GroupSchema),
  update: (id: string, patch: UpdateGroupInput) =>
    request({ url: `/groups/${id}`, method: 'PATCH', data: patch }, GroupSchema),
  rotateInvite: (id: string, kind: InviteKind) =>
    request({ url: `/groups/${id}/invite`, method: 'POST', data: { kind } }, InviteSchema),
  acceptInvite: (token: string) =>
    request({ url: `/invites/${encodeURIComponent(token)}/accept`, method: 'POST' }, GroupSchema),
  members: (id: string) => request({ url: `/groups/${id}/members` }, MemberSchema.array()),
  removeMember: (id: string, userId: string) =>
    send({ url: `/groups/${id}/members/${userId}`, method: 'DELETE' }),
  currentGame: (id: string) => request({ url: `/groups/${id}/games/current` }, GameSchema),
  confirm: (id: string, date: string) =>
    request({ url: `${game(id, date)}/attendance`, method: 'POST' }, GameSchema),
  leave: (id: string, date: string) => send({ url: `${game(id, date)}/attendance`, method: 'DELETE' }),
  cancel: (id: string, date: string) =>
    request({ url: `${game(id, date)}/cancel`, method: 'POST' }, GameSchema),
  play: (token: string) => request({ url: play(token) }, GuestGameSchema),
  playConfirm: (token: string, date: string) =>
    request({ url: `${play(token)}/games/${date}/attendance`, method: 'POST' }, GameSchema),
  playLeave: (token: string, date: string) =>
    send({ url: `${play(token)}/games/${date}/attendance`, method: 'DELETE' }),
};
