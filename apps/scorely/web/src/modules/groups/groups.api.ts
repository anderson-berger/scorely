import {
  type CreateGroupInput,
  GameSchema,
  GroupSchema,
  InviteSchema,
  MemberSchema,
  MyGroupSchema,
} from '@scorely/contracts';
import { request, send } from '@/lib/http';

const game = (groupId: string, date: string) => `/groups/${groupId}/games/${date}`;

export const groupsApi = {
  create: (input: CreateGroupInput) => request({ url: '/groups', method: 'POST', data: input }, GroupSchema),
  mine: () => request({ url: '/me/groups' }, MyGroupSchema.array()),
  get: (id: string) => request({ url: `/groups/${id}` }, GroupSchema),
  rotateInvite: (id: string) => request({ url: `/groups/${id}/invite`, method: 'POST' }, InviteSchema),
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
};
