import {
  PlayerSchema,
  type SaveTeamsInput,
  TeamSettingsSchema,
  TeamsResponseSchema,
  type UpdatePlayerInput,
  type UpdateTeamSettingsInput,
  type VersionInput,
} from '@scorely/contracts';
import { request, send } from '@scorely/web/src/lib/http';

const teamsUrl = (groupId: string, gameId: string) => `/groups/${groupId}/games/${gameId}/teams`;

/** Posições de cada pessoa no grupo (TIM-01–04) e times do jogo atual (TIM-06–13). */
export const teamsApi = {
  players: (groupId: string) => request({ url: `/groups/${groupId}/players` }, PlayerSchema.array()),
  updatePlayer: (groupId: string, userId: string, input: UpdatePlayerInput) =>
    request({ url: `/groups/${groupId}/players/${userId}`, method: 'PUT', data: input }, PlayerSchema),

  teams: (groupId: string, gameId: string) =>
    request({ url: teamsUrl(groupId, gameId) }, TeamsResponseSchema),
  saveTeams: (groupId: string, gameId: string, input: SaveTeamsInput) =>
    request({ url: teamsUrl(groupId, gameId), method: 'PUT', data: input }, TeamsResponseSchema),
  /** TIM-25: as ações mandam a versão dos times que a tela mostrou (0 = sem times). */
  publishTeams: (groupId: string, gameId: string, input: VersionInput) =>
    request(
      { url: `${teamsUrl(groupId, gameId)}/publish`, method: 'POST', data: input },
      TeamsResponseSchema,
    ),
  /** Sorteia (TIM-15); com os times publicados, eles voltam para rascunho. */
  drawTeams: (groupId: string, gameId: string, input: VersionInput) =>
    request({ url: `${teamsUrl(groupId, gameId)}/draw`, method: 'POST', data: input }, TeamsResponseSchema),
  unpublishTeams: (groupId: string, gameId: string, input: VersionInput) =>
    request(
      { url: `${teamsUrl(groupId, gameId)}/unpublish`, method: 'POST', data: input },
      TeamsResponseSchema,
    ),
  discardTeams: (groupId: string, gameId: string, input: VersionInput) =>
    send({ url: teamsUrl(groupId, gameId), method: 'DELETE', data: input }),
  /** Configuração de times do grupo (TIM-17): quantidade padrão, regras e "permitir publicar fora". Só o dono. */
  settings: (groupId: string) => request({ url: `/groups/${groupId}/team-settings` }, TeamSettingsSchema),
  updateSettings: (groupId: string, input: UpdateTeamSettingsInput) =>
    request({ url: `/groups/${groupId}/team-settings`, method: 'PUT', data: input }, TeamSettingsSchema),

  /** Pelo link do jogo: só os times publicados (GRP-09). */
  guestTeams: (token: string, gameId: string) =>
    request({ url: `/play/${token}/games/${gameId}/teams` }, TeamsResponseSchema),
};
