import type { Match } from '@scorely/api/modules/match/match_types';
import api from 'src/services/api/api';

class MatchService {
  async create(): Promise<Match> {
    const { data } = await api.post<Match>('/matches');
    return data;
  }
}

export default new MatchService();
