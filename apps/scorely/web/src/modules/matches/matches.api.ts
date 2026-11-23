import {
  type AdvanceMatchInput,
  type CreateMatchInput,
  MatchSchema,
  MatchSummarySchema,
  type RequestMatchGuestInput,
  type SetAttendanceInput,
  type UpdateMatchInput,
} from '@scorely/contracts';
import { request } from '@scorely/web/src/lib/http';

/** Partida (docs/modules/partidas.md): toda ação responde a partida inteira. */
const base = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/matches`;
const one = (groupId: string, matchId: string) => `${base(groupId)}/${encodeURIComponent(matchId)}`;
const guest = (groupId: string, matchId: string, guestId: string) =>
  `${one(groupId, matchId)}/guests/${encodeURIComponent(guestId)}`;

export const matchesApi = {
  list: (groupId: string) => request({ url: base(groupId) }, MatchSummarySchema.array()),
  get: (groupId: string, matchId: string) => request({ url: one(groupId, matchId) }, MatchSchema),
  create: (groupId: string, input: CreateMatchInput) =>
    request({ url: base(groupId), method: 'POST', data: input }, MatchSchema),
  update: (groupId: string, matchId: string, input: UpdateMatchInput) =>
    request({ url: one(groupId, matchId), method: 'PUT', data: input }, MatchSchema),
  advance: (groupId: string, matchId: string, input: AdvanceMatchInput) =>
    request({ url: `${one(groupId, matchId)}/advance`, method: 'POST', data: input }, MatchSchema),
  cancel: (groupId: string, matchId: string) =>
    request({ url: `${one(groupId, matchId)}/cancel`, method: 'POST' }, MatchSchema),
  setAttendance: (groupId: string, matchId: string, input: SetAttendanceInput) =>
    request({ url: `${one(groupId, matchId)}/attendance`, method: 'PUT', data: input }, MatchSchema),

  // Convidados (PAR-11–14)
  requestGuest: (groupId: string, matchId: string, input: RequestMatchGuestInput) =>
    request({ url: `${one(groupId, matchId)}/guests`, method: 'POST', data: input }, MatchSchema),
  approveGuest: (groupId: string, matchId: string, guestId: string) =>
    request({ url: `${guest(groupId, matchId, guestId)}/approve`, method: 'POST' }, MatchSchema),
  declineGuest: (groupId: string, matchId: string, guestId: string) =>
    request({ url: `${guest(groupId, matchId, guestId)}/decline`, method: 'POST' }, MatchSchema),
  removeGuest: (groupId: string, matchId: string, guestId: string) =>
    request({ url: guest(groupId, matchId, guestId), method: 'DELETE' }, MatchSchema),
};
