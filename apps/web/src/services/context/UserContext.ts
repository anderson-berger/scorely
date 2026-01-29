import type { User } from '@scorely/shared/schemas/user/user_schemas';
import UserService from 'src/services/api/UserService';

const STORAGE_KEY = 'scorely:user';

class UserContext {
  private user: User | undefined = undefined;

  get(): User | undefined {
    if (this.user) return this.user;

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;

    try {
      this.user = JSON.parse(raw);
      return this.user;
    } catch {
      this.clear();
      return undefined;
    }
  }

  async load(force = false) {
    if (!force) {
      const cached = this.get();
      if (cached) return cached;
    }

    const user = await UserService.getMe();
    this.set(user);
  }

  set(user: User) {
    this.user = user;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  clear() {
    this.user = undefined;
    localStorage.removeItem(STORAGE_KEY);
  }
}

export default new UserContext();
