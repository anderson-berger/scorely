import http from 'src/core/api/httpClient';
import type { Match, NewMatch } from '@scorely/api/modules/match/match_types';
import type { MatchUser } from '@scorely/api/modules/match/member/user/match_user_types';
import type { PaginatedResult } from 'src/modules/match/types/match.ui.types';

export interface MatchWithMember {
  match: Match;
  member: MatchUser | null;
}

const matchService = {
  async getMyMatches(cursor?: string): Promise<PaginatedResult<Match>> {
    const { data } = await http.get<PaginatedResult<Match>>('/matches/my', {
      params: { cursor, limit: 20 },
    });
    return data;
  },

  async getById(id: Match['id']): Promise<MatchWithMember> {
    const { data } = await http.get<MatchWithMember>(`/matches/${id}`);
    return data;
  },

  async create(input: NewMatch): Promise<MatchWithMember> {
    const { data } = await http.post<MatchWithMember>('/matches', input);
    return data;
  },

  async remove(id: Match['id']): Promise<void> {
    await http.delete(`/matches/${id}`);
  },

  async getMembers(id: Match['id'], cursor?: string): Promise<PaginatedResult<MatchUser>> {
    const { data } = await http.get<PaginatedResult<MatchUser>>(`/matches/${id}/members`, {
      params: { cursor, limit: 20 },
    });
    return data;
  },

  async addMember(matchId: Match['id'], userId: string): Promise<MatchUser> {
    const { data } = await http.post<MatchUser>(`/matches/${matchId}/members`, { userId });
    return data;
  },

  async updateMemberRole(
    matchId: Match['id'],
    memberId: MatchUser['id'],
    role: MatchUser['role'],
  ): Promise<MatchUser> {
    const { data } = await http.patch<MatchUser>(`/matches/${matchId}/members/${memberId}`, {
      role,
    });
    return data;
  },

  async removeMember(matchId: Match['id'], memberId: MatchUser['id']): Promise<void> {
    await http.delete(`/matches/${matchId}/members/${memberId}`);
  },
};

export default matchService;
