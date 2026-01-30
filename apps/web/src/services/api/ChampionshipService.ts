import api from 'src/services/api/api';

// TODO: Importar do backend quando o módulo championship for implementado
export interface Championship {
  id: number;
  name: string;
  description?: string;
  avatar?: string;
  sport?: string;
  status?: string;
}

export interface NewChampionship {
  name: string;
  description?: string;
  sport?: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

class ChampionshipService {
  async list(page = 1, limit = 10): Promise<PaginatedResponse<Championship>> {
    const response = await api.get<PaginatedResponse<Championship>>('/championships', {
      params: { page, limit },
    });
    return response.data;
  }

  async getById(id: string): Promise<Championship> {
    const response = await api.get<Championship>(`/championships/${id}`);
    return response.data;
  }

  async create(data: NewChampionship): Promise<Championship> {
    const response = await api.post<Championship>('/championships', data);
    return response.data;
  }
}

export default new ChampionshipService();
