import {
  PlayerSchema,
  type SaveTeamsInput,
  TeamsResponseSchema,
  type UpdatePlayerInput,
} from '@scorely/contracts';
import { request, send } from '@/lib/http';

const teamsUrl = (groupId: string, date: string) => `/groups/${groupId}/games/${date}/teams`;

/** Posições de cada pessoa no grupo (TIM-01–04) e times do jogo atual (TIM-06–13). */
export const teamsApi = {
  players: (groupId: string) => request({ url: `/groups/${groupId}/players` }, PlayerSchema.array()),
  updatePlayer: (groupId: string, userId: string, input: UpdatePlayerInput) =>
    request({ url: `/groups/${groupId}/players/${userId}`, method: 'PUT', data: input }, PlayerSchema),

  teams: (groupId: string, date: string) => request({ url: teamsUrl(groupId, date) }, TeamsResponseSchema),
  saveTeams: (groupId: string, date: string, input: SaveTeamsInput) =>
    request({ url: teamsUrl(groupId, date), method: 'PUT', data: input }, TeamsResponseSchema),
  publishTeams: (groupId: string, date: string) =>
    request({ url: `${teamsUrl(groupId, date)}/publish`, method: 'POST' }, TeamsResponseSchema),
  /** Sorteia (TIM-15); com os times publicados, eles voltam para rascunho. */
  drawTeams: (groupId: string, date: string) =>
    request({ url: `${teamsUrl(groupId, date)}/draw`, method: 'POST' }, TeamsResponseSchema),
  unpublishTeams: (groupId: string, date: string) =>
    request({ url: `${teamsUrl(groupId, date)}/unpublish`, method: 'POST' }, TeamsResponseSchema),
  discardTeams: (groupId: string, date: string) => send({ url: teamsUrl(groupId, date), method: 'DELETE' }),
  /** Pelo link do jogo: só os times publicados (GRP-09). */
  guestTeams: (token: string) => request({ url: `/play/${token}/teams` }, TeamsResponseSchema),
};
