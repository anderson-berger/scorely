import type { User } from '@scorely/shared/schemas/user';
import api from 'src/services/api/api';

class UserService {
  async getMe(): Promise<User> {
    const { data } = await api.get<User>('/users/me');
    return data;
  }

  async update(user: User): Promise<User> {
    const { data } = await api.put<User>('/users/me', user);
    return data;
  }
}

export default new UserService();
