import type { User } from '@scorely/api/modules/user/user.schemas';
import api from 'src/services/api/api';

class UserService {
  async getMe(): Promise<User> {
    const { data } = await api.get<User>('/auth/me');
    return data;
  }

  async update(user: User): Promise<User> {
    const { data } = await api.put<User>(`/users/${user.id}`, user);
    return data;
  }
}

export default new UserService();
