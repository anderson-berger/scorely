import type { User } from '@scorely/shared/schemas/user/user_schemas';
import api from 'src/services/api/api';

class UserService {
  async getMe(): Promise<User> {
    const { data } = await api.get<User>('/user/me');
    return data;
  }

  async update(user: User): Promise<User> {
    const { data } = await api.put<User>('/user/me', user);

    return data;
  }
}

export default new UserService();
