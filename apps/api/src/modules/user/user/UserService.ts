import { generateId, generateTimestamp } from "@/utils/generators";
import { UserRepository } from "@/modules/user/user/UserRepository";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/utils/error/errors";
import { $updateUser, type User } from "@/modules/user/user/user_schemas";
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
      version: 0,
      name: null,
      email,
      createdAt: now,
      updatedAt: now,
    };
    return this.userRepository.create(user);
  }

  async update(userId: User["id"], user: User): Promise<User> {
    if (userId !== user.id) {
      throw new ForbiddenError();
    }

    const oldUser = await this.userRepository.findById(user.id);

    if (!oldUser) {
      throw new NotFoundError();
    }

    if (user.version !== oldUser.version) {
      throw new ConflictError();
    }

    const updateUser = $updateUser.parse(user);

    const now = generateTimestamp();
    const updatedUser: User = {
      ...oldUser,
      ...updateUser,
      version: oldUser.version + 1,
      updatedAt: now,
    };

    return this.userRepository.update(updatedUser);
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
