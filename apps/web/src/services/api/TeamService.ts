import type { Team, NewTeam } from '@scorely/shared/schemas/team';
import api from 'src/services/api/api';

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

class TeamService {
  async list(page = 1, limit = 10): Promise<PaginatedResponse<Team>> {
    const response = await api.get<PaginatedResponse<Team>>('/teams', {
      params: { page, limit },
    });
    return response.data;
  }

  async getById(id: string): Promise<Team> {
    const response = await api.get<Team>(`/teams/${id}`);
    return response.data;
  }

  async create(data: NewTeam): Promise<Team> {
    const response = await api.post<Team>('/teams', data);
    return response.data;
  }
}

export default new TeamService();
