import {
  type CompetitionCut,
  CompetitionListSchema,
  CompetitionSchema,
  type CreateCompetitionInput,
  MatchSchema,
  type SetMatchCompetitionsInput,
  type UpdateCompetitionInput,
} from '@scorely/contracts';
import { request } from '@scorely/web/src/lib/http';

/** Competição (docs/modules/competicao.md): toda ação responde a competição inteira. */
const base = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/competitions`;
const one = (groupId: string, id: string) => `${base(groupId)}/${encodeURIComponent(id)}`;

export const competitionsApi = {
  list: (groupId: string) => request({ url: base(groupId) }, CompetitionListSchema),
  get: (groupId: string, id: string, cut: CompetitionCut = 'all') =>
    request({ url: one(groupId, id), params: { cut } }, CompetitionSchema),
  create: (groupId: string, input: CreateCompetitionInput) =>
    request({ url: base(groupId), method: 'POST', data: input }, CompetitionSchema),
  update: (groupId: string, id: string, input: UpdateCompetitionInput) =>
    request({ url: one(groupId, id), method: 'PUT', data: input }, CompetitionSchema),
  close: (groupId: string, id: string) =>
    request({ url: `${one(groupId, id)}/close`, method: 'POST' }, CompetitionSchema),

  /** PAR-40: o "Vale para" da partida; responde a partida. */
  setMatchCompetitions: (groupId: string, matchId: string, input: SetMatchCompetitionsInput) =>
    request(
      {
        url: `/groups/${encodeURIComponent(groupId)}/matches/${encodeURIComponent(matchId)}/competitions`,
        method: 'PUT',
        data: input,
      },
      MatchSchema,
    ),
};
