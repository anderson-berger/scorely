import { PlayerSchema, type UpdatePlayerInput } from '@scorely/contracts';
import { request } from '@/lib/http';

/** Posições de cada pessoa no grupo (TIM-01–04): todos do grupo veem, só o dono muda. */
export const teamsApi = {
  players: (groupId: string) => request({ url: `/groups/${groupId}/players` }, PlayerSchema.array()),
  updatePlayer: (groupId: string, userId: string, input: UpdatePlayerInput) =>
    request({ url: `/groups/${groupId}/players/${userId}`, method: 'PUT', data: input }, PlayerSchema),
};
