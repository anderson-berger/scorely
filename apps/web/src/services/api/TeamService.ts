import type { NewTeam, TeamWithMember } from '@scorely/api/modules/team/team/team.schemas';
import type { PaginatedResult } from '@scorely/api/utils/pagination/pagination';
import api from 'src/services/api/api';

class TeamService {
  async getMyTeams(): Promise<TeamWithMember[]> {
    const { data } = await api.get<PaginatedResult<TeamWithMember>>('/teams/my');
    return data.items;
  }

  async create(input?: NewTeam): Promise<TeamWithMember> {
    const { data } = await api.post<TeamWithMember>('/teams', input);
    return data;
  }
}

export default new TeamService();
