import { generateId, generateTimestamp } from "@/utils/generators";
import { UserRepository } from "@/modules/user/UserRepository";
import { NotFoundError } from "@/utils/error/errors";
import type { User } from "./user_schemas";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/utils/pagination/pagination";

export class UserService {
  private userRepository = new UserRepository();

  async create(email: string): Promise<User> {
    const now = generateTimestamp();
    const user: User = {
      id: generateId(),
      email,
      createdAt: now,
      updatedAt: now,
    };
    return this.userRepository.create(user);
  }

  async update(id: string, updates: Partial<Pick<User, "name">>): Promise<User> {
    const existingUser = await this.userRepository.findById(id);
    if (!existingUser) {
      throw new NotFoundError("User not found");
    }

    const hasChanges = updates.name !== existingUser.name;
    if (!hasChanges) {
      return existingUser;
    }

    const updatedUser: User = {
      ...existingUser,
      ...updates,
      updatedAt: generateTimestamp(),
    };

    return this.userRepository.save(updatedUser);
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  async list(pagination: PaginationQuery): Promise<PaginatedResult<User>> {
    return this.userRepository.list(pagination);
  }
}
