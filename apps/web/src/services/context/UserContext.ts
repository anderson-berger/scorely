import type { User } from '@scorely/shared/schemas/user';
import UserService from 'src/services/api/UserService';

const STORAGE_KEY = 'scorely:user';

class UserContext {
  private user: User | null = null;

  get(): User | null {
    if (this.user) return this.user;

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
      this.user = JSON.parse(raw);
      return this.user;
    } catch {
      this.clear();
      return null;
    }
  }

  async load(force = false): Promise<User> {
    if (!force) {
      const cached = this.get();
      if (cached) return cached;
    }

    const user = await UserService.getMe();
    this.set(user);
    return user;
  }

  set(user: User) {
    this.user = user;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  clear() {
    this.user = null;
    localStorage.removeItem(STORAGE_KEY);
  }
}

export default new UserContext();
