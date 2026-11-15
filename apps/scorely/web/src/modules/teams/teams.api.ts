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

const teamsUrl = (groupId: string, date: string) => `/groups/${groupId}/games/${date}/teams`;

/** Posições de cada pessoa no grupo (TIM-01–04) e times do jogo atual (TIM-06–13). */
export const teamsApi = {
  players: (groupId: string) => request({ url: `/groups/${groupId}/players` }, PlayerSchema.array()),
  updatePlayer: (groupId: string, userId: string, input: UpdatePlayerInput) =>
    request({ url: `/groups/${groupId}/players/${userId}`, method: 'PUT', data: input }, PlayerSchema),

  teams: (groupId: string, date: string) => request({ url: teamsUrl(groupId, date) }, TeamsResponseSchema),
  saveTeams: (groupId: string, date: string, input: SaveTeamsInput) =>
    request({ url: teamsUrl(groupId, date), method: 'PUT', data: input }, TeamsResponseSchema),
  /** TIM-25: as ações mandam a versão dos times que a tela mostrou (0 = sem times). */
  publishTeams: (groupId: string, date: string, input: VersionInput) =>
    request({ url: `${teamsUrl(groupId, date)}/publish`, method: 'POST', data: input }, TeamsResponseSchema),
  /** Sorteia (TIM-15); com os times publicados, eles voltam para rascunho. */
  drawTeams: (groupId: string, date: string, input: VersionInput) =>
    request({ url: `${teamsUrl(groupId, date)}/draw`, method: 'POST', data: input }, TeamsResponseSchema),
  unpublishTeams: (groupId: string, date: string, input: VersionInput) =>
    request(
      { url: `${teamsUrl(groupId, date)}/unpublish`, method: 'POST', data: input },
      TeamsResponseSchema,
    ),
  discardTeams: (groupId: string, date: string, input: VersionInput) =>
    send({ url: teamsUrl(groupId, date), method: 'DELETE', data: input }),
  /** Configuração de times do grupo (TIM-17): quantidade padrão, regras e "permitir publicar fora". Só o dono. */
  settings: (groupId: string) => request({ url: `/groups/${groupId}/team-settings` }, TeamSettingsSchema),
  updateSettings: (groupId: string, input: UpdateTeamSettingsInput) =>
    request({ url: `/groups/${groupId}/team-settings`, method: 'PUT', data: input }, TeamSettingsSchema),

  /** Pelo link do jogo: só os times publicados (GRP-09). */
  guestTeams: (token: string) => request({ url: `/play/${token}/teams` }, TeamsResponseSchema),
};
