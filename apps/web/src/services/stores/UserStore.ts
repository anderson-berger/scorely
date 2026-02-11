import { reactive } from 'vue';
import type { User } from '@scorely/api/modules/user/user.schemas';
import UserService from 'src/services/api/UserService';

class UserStore {
  private _state = reactive({
    user: null as User | null,
  });

  get user() {
    return this._state.user;
  }

  async fetchUser() {
    this._state.user = await UserService.getMe();
  }

  async refreshUser() {
    await this.fetchUser();
  }

  reset() {
    this._state.user = null;
  }
}

export const userStore = new UserStore();
